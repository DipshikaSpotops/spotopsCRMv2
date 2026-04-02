// GET /orders/dailySalesGp — Admin + Sales only; same date/search logic as monthlyOrders.
import express from "express";
import moment from "moment-timezone";
import { getOrderModelForBrand } from "../models/Order.js";
import { requireAuth, allow } from "../middleware/auth.js";

const router = express.Router();
const TZ = "America/Chicago";

const AGENT_BRAND_MAPPING = {
  Richard: "Victor",
  Mark: "Sam",
  David: "Steve",
  Michael: "Charlie",
  Dipsikha: "Dipsikha",
};

function buildDateRange(q) {
  const { start, end, month, year } = q;

  if (start && end) {
    const startMoment = moment.tz(start, TZ).startOf("day");
    const endExclusiveMoment = moment.tz(end, TZ).endOf("day").add(1, "millisecond");
    return {
      startDate: startMoment.toDate(),
      endDate: endExclusiveMoment.toDate(),
      exclusiveEnd: true,
    };
  }

  if (month && year) {
    const monthIndex = isNaN(month)
      ? { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }[
          month
        ]
      : parseInt(month, 10) - 1;

    const y = parseInt(year, 10);
    if (isNaN(monthIndex) || isNaN(y)) throw new Error("Invalid month/year");

    const startDateMoment = moment.tz({ year: y, month: monthIndex }, TZ).startOf("month");
    const endExclusiveMoment = startDateMoment.clone().add(1, "month");
    return { startDate: startDateMoment.toDate(), endDate: endExclusiveMoment.toDate(), exclusiveEnd: true };
  }

  throw new Error("Provide either start/end or month/year");
}

router.get("/", requireAuth, allow("Admin", "Sales"), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      q,
      sortBy,
      sortOrder = "asc",
      salesAgent,
      start,
      end,
      month,
      year,
    } = req.query;

    const { startDate, endDate, exclusiveEnd } = buildDateRange({ start, end, month, year });

    const query = {
      orderDate: exclusiveEnd ? { $gte: startDate, $lt: endDate } : { $gte: startDate, $lte: endDate },
    };

    if (q && q.trim()) {
      const rx = new RegExp(q.trim(), "i");
      const or = [
        { orderNo: rx },
        { customerName: rx },
        { fName: rx },
        { lName: rx },
        { salesAgent: rx },
        { phone: rx },
        { email: rx },
        { pReq: rx },
        { desc: rx },
        { partNo: rx },
        { make: rx },
        { model: rx },
        { trackingNo: rx },
        { additionalInfo: { $elemMatch: { yardName: rx } } },
        { additionalInfo: { $elemMatch: { status: rx } } },
        { additionalInfo: { $elemMatch: { expShipDate: rx } } },
        { additionalInfo: { $elemMatch: { trackingNo: rx } } },
        { additionalInfo: { $elemMatch: { customerTrackingNumberReplacement: rx } } },
        { additionalInfo: { $elemMatch: { yardTrackingNumber: rx } } },
        { additionalInfo: { $elemMatch: { returnTrackingCust: rx } } },
      ];
      const maybeNum = Number(q.trim());
      if (Number.isFinite(maybeNum)) {
        or.push({ year: maybeNum });
        or.push({ year: q.trim() });
      }
      query.$or = or;
    }

    if (req.user.role === "Sales") {
      const firstName = req.user.firstName;
      if (!firstName) {
        console.warn("[dailySalesGp] Sales user has no firstName, skipping salesAgent filter");
      } else {
        const mappedFirstName =
          req.brand === "PROLANE" && AGENT_BRAND_MAPPING[firstName] ? AGENT_BRAND_MAPPING[firstName] : firstName;

        const escapedFirstName = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escapedMappedName = mappedFirstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern1 = `^${escapedFirstName}(?:\\s.*|$)`;
        const pattern2 = `^${escapedMappedName}(?:\\s.*|$)`;

        if (mappedFirstName !== firstName) {
          query.salesAgent = { $in: [new RegExp(pattern1, "i"), new RegExp(pattern2, "i")] };
        } else {
          query.salesAgent = new RegExp(pattern1, "i");
        }
      }
    } else if (req.user.role === "Admin" && salesAgent) {
      query.salesAgent = new RegExp(salesAgent.trim(), "i");
    }

    const SORT_MAP = {
      orderDate: "orderDate",
      orderNo: "orderNo",
      salesAgent: "salesAgent",
      grossProfit: "grossProfit",
      orderStatus: "orderStatus",
      pReq: "pReq",
      customerName: "customerName",
    };
    const dir = sortOrder === "desc" ? -1 : 1;

    const projectFields = {
      orderDate: 1,
      orderNo: 1,
      salesAgent: 1,
      customerName: 1,
      fName: 1,
      lName: 1,
      soldP: 1,
      paymentSource: 1,
      grossProfit: 1,
      orderStatus: 1,
      pReq: 1,
      additionalInfo: 1,
      email: 1,
      phone: 1,
      desc: 1,
      partNo: 1,
      year: 1,
      make: 1,
      model: 1,
    };

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const Order = getOrderModelForBrand(req.brand);
    const totalOrders = await Order.countDocuments(query);

    if (sortBy === "customerName") {
      const pipeline = [
        { $match: query },
        {
          $addFields: {
            fullName: {
              $trim: {
                input: {
                  $ifNull: [
                    "$customerName",
                    { $concat: [{ $ifNull: ["$fName", ""] }, " ", { $ifNull: ["$lName", ""] }] },
                  ],
                },
              },
            },
          },
        },
        { $sort: { fullName: dir, _id: 1 } },
        { $skip: skip },
        { $limit: limitNum },
        { $project: projectFields },
      ];
      const orders = await Order.aggregate(pipeline).collation({ locale: "en", strength: 2 });
      return res.json({
        totalOrders,
        currentPage: pageNum,
        totalPages: Math.ceil(totalOrders / limitNum),
        orders,
      });
    }

    const sortSpec = SORT_MAP[sortBy] ? { [SORT_MAP[sortBy]]: dir, _id: 1 } : { orderDate: -1, _id: 1 };

    const orders = await Order.find(query, projectFields)
      .collation({ locale: "en", strength: 2 })
      .sort(sortSpec)
      .skip(skip)
      .limit(limitNum)
      .lean();

    return res.json({
      totalOrders,
      currentPage: pageNum,
      totalPages: Math.ceil(totalOrders / limitNum),
      orders,
    });
  } catch (err) {
    console.error("Error fetching daily sales GP:", err);
    const msg = err?.message?.includes("Provide either start/end") ? err.message : "Internal server error";
    return res.status(500).json({ message: msg });
  }
});

export default router;
