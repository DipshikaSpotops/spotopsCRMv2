import express from "express";
import mongoose from "mongoose";
import { zonedTimeToUtc } from "date-fns-tz";

const router = express.Router();

const TZ = "America/Chicago";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Same projection you used
const PROJECTION = {
  orderNo: 1,
  orderDate: 1,
  desc: 1,
  salesAgent: 1,
  customerName: 1,
  fName: 1,
  lName: 1,
  email: 1,
  phone: 1,
  vin: 1,
  pReq: 1,
  year: 1,
  make: 1,
  model: 1,
  partNo: 1,
  warranty: 1,
  programmingRequired: 1,
  sAddressStreet: 1,
  sAddressCity: 1,
  sAddressState: 1,
  sAddressZip: 1,
  orderStatus: 1,
  "additionalInfo.0.yardName": 1,
  "additionalInfo.0.email": 1,
  "additionalInfo.0.phone": 1,
  "additionalInfo.0.status": 1,
  "additionalInfo.0.stockNo": 1,
};

function getPaging(req) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limitRaw = Math.max(parseInt(req.query.limit || "25", 10), 1);
  const limit = Math.min(limitRaw, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function monthStartEndFromParams(monthAbbrev, yearStr) {
  let startUTC, endUTC;

  if (monthAbbrev && yearStr) {
    const idx = MONTHS.findIndex((m) => m.toLowerCase() === String(monthAbbrev).toLowerCase());
    const year = parseInt(String(yearStr), 10);
    const monthIndex = idx >= 0 ? idx : new Date().getMonth();

    const startLocalISO = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01T00:00:00`;
    const endLocalDate = new Date(year, monthIndex + 1, 1);
    const endLocalISO = `${endLocalDate.getFullYear()}-${String(endLocalDate.getMonth() + 1).padStart(2, "0")}-01T00:00:00`;

    startUTC = zonedTimeToUtc(startLocalISO, TZ);
    endUTC = zonedTimeToUtc(endLocalISO, TZ);
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    const startLocalISO = `${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00`;
    const endMonth = (m + 1) % 12;
    const endYear = y + (m === 11 ? 1 : 0);
    const endLocalISO = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-01T00:00:00`;

    startUTC = zonedTimeToUtc(startLocalISO, TZ);
    endUTC = zonedTimeToUtc(endLocalISO, TZ);
  }

  return { startUTC, endUTC };
}

router.get("/", async (req, res) => {
  try {
    const { page, limit, skip } = getPaging(req);
    const searchTerm = (req.query.searchTerm || "").trim();

    // Resolve date window: explicit start/end (ISO) OR month/year OR current month
    let startUTC, endUTC;

    if (req.query.start && req.query.end) {
      const s = new Date(String(req.query.start));
      const e = new Date(String(req.query.end));
      if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        return res.status(400).json({ error: "Invalid start/end date" });
      }
      startUTC = s;
      endUTC = e;
    } else {
      const { startUTC: s, endUTC: e } = monthStartEndFromParams(
        req.query.month,
        req.query.year
      );
      startUTC = s;
      endUTC = e;
    }

    const coll = mongoose.connection.collection("orders");

    // FAST PATH: no/short search → simple paginate within month
    if (searchTerm.length < 2) {
      const monthQuery = { orderDate: { $gte: startUTC, $lt: endUTC } };

      const [orders, totalOrders] = await Promise.all([
        coll
          .find(monthQuery)
          .project(PROJECTION)
          .sort({ orderDate: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        coll.countDocuments(monthQuery),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalOrders / limit));
      return res.json({
        orders,
        totalPages,
        totalOrders,
        currentPage: page,
        start: startUTC.toISOString(),
        end: endUTC.toISOString(),
      });
    }

    // SEARCH PATH: Atlas Search (autocomplete + text) + month range
    const searchablePaths = [
      "orderNo",
      "customerName",
      "fName",
      "lName",
      "phone",
      "email",
      "vin",
      "desc",
      "trackingNo", // top-level trackingNo (if exists)
      "additionalInfo.yardName",
      "additionalInfo.stockNo",
      "additionalInfo.trackingNo",
      "additionalInfo.customerTrackingNumberReplacement",
      "additionalInfo.yardTrackingNumber",
      "additionalInfo.returnTrackingCust",
    ];

    const searchStage = {
      $search: {
        index: "default",
        compound: {
          should: [
            {
              autocomplete: {
                query: searchTerm,
                path: searchablePaths,
                tokenOrder: "any",
                fuzzy: { maxEdits: 1, prefixLength: 1 },
              },
            },
            {
              text: {
                query: searchTerm,
                path: searchablePaths,
                fuzzy: { maxEdits: 1, prefixLength: 1 },
              },
            },
          ],
          minimumShouldMatch: 1,
          filter: [
            {
              range: {
                path: "orderDate",
                gte: startUTC,
                lt: endUTC,
              },
            },
          ],
        },
      },
    };

    // Enforce month range even if orderDate isn't in the Atlas Search index
    const monthRangeMatch = { $match: { orderDate: { $gte: startUTC, $lt: endUTC } } };

    const resultsPipeline = [
      searchStage,
      monthRangeMatch,
      { $sort: { score: { $meta: "searchScore" }, orderDate: -1, _id: -1 } },
      { $project: { ...PROJECTION, score: { $meta: "searchScore" } } },
      { $skip: skip },
      { $limit: limit },
    ];

    const metaPipeline = [
      {
        $searchMeta: {
          index: "default",
          count: { type: "total" },
          ...searchStage.$search,
        },
      },
      { $project: { total: "$count.total" } },
    ];

    const [orders, metaArr] = await Promise.all([
      coll.aggregate(resultsPipeline).toArray(),
      coll.aggregate(metaPipeline).toArray().catch(() => []),
    ]);

    let totalOrders = metaArr?.[0]?.total;
    if (typeof totalOrders !== "number") {
      const countPipeline = [searchStage, monthRangeMatch, { $count: "total" }];
      const countArr = await coll.aggregate(countPipeline).toArray();
      totalOrders = countArr?.[0]?.total ?? 0;
    }

    const totalPages = Math.max(1, Math.ceil(totalOrders / limit));

    return res.json({
      orders,
      totalPages,
      totalOrders,
      currentPage: page,
      start: startUTC.toISOString(),
      end: endUTC.toISOString(),
    });
  } catch (e) {
    console.error("monthlyOrders error:", e);
    return res.status(500).json({ error: "Failed to fetch monthly orders" });
  }
});

export default router;
