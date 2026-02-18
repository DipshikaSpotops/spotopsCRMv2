import express from "express";
import { getOrderModelForBrand } from "../models/Order.js";
import moment from "moment-timezone";

const router = express.Router();
function getDateRange({ start, end, month, year }) {
  const tz = "America/Chicago";

  if (start && end) {
    const startDate = moment.tz(start, tz).startOf("day").toDate();
    const endDate   = moment.tz(end,   tz).endOf("day").toDate();
    return { startDate, endDate };
  } else if (month && year) {
    const monthMap = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
    };

    let paddedMonth;
    if (month.length === 3 && monthMap[month]) {
      paddedMonth = monthMap[month];
    } else if (!isNaN(month)) {
      paddedMonth = month.toString().padStart(2, "0");
    } else {
      throw new Error("Invalid month format");
    }

    const startDate = moment.tz(`${year}-${paddedMonth}-01`, tz).startOf("month").toDate();
    // exclusive end: start of next month (prevents month-end time glitches)
    const endDate   = moment(startDate).add(1, "month").toDate();

    return { startDate, endDate };
  }
  throw new Error("Provide either start/end or month/year");
}

router.get("/", async (req, res) => {
  try {
    const {
      start,
      end,
      month,
      year,
      page = 1,
      limit = 25,
      q,
      sortBy,
      sortOrder = "asc",
    } = req.query;

    const { startDate, endDate } = getDateRange({ start, end, month, year });

    const pageSize = Math.max(parseInt(limit, 10) || 25, 1);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * pageSize;

    // Base filter: date range + "escalated"
    const filter = {
      orderDate: { $gte: startDate, $lt: endDate },
      additionalInfo: { $elemMatch: { escTicked: "Yes" } },
    };

    // Free-text search across common fields (incl. yardName in any additionalInfo elem)
    if (q && q.trim()) {
      const qTrim = q.trim();
      const rx = new RegExp(qTrim, "i");

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
        { additionalInfo: { $elemMatch: { yardName: rx } } },
      ];

      const maybeNum = Number(qTrim);
      if (Number.isFinite(maybeNum)) {
        or.push({ year: maybeNum });
        or.push({ year: qTrim }); // if saved as string in some docs
      }

      filter.$or = or;
    }

    const Order = getOrderModelForBrand(req.brand);

    const totalOrders = await Order.countDocuments(filter);

    // Sort map (DB fields). For customerName we do special pipeline so "fName lName" works.
    const SORT_MAP = {
      orderDate: "orderDate",
      orderNo: "orderNo",
      pReq: "pReq",
      salesAgent: "salesAgent",
      customerName: "customerName",           // handled in pipeline below
      yardName: "additionalInfo.0.yardName",  // sort by the first yard entry
      orderStatus: "orderStatus",
    };

    const dir = sortOrder === "desc" ? -1 : 1;

    // Fields the client needs (keep this lean for speed)
    const projectFields = {
      orderDate: 1,
      orderNo: 1,
      salesAgent: 1,
      customerName: 1,
      fName: 1,
      lName: 1,
      orderStatus: 1,
      pReq: 1,
      additionalInfo: 1,

      // below are commonly shown in expanded sections; include if you need them
      email: 1,
      phone: 1,
      sAddressStreet: 1,
      sAddressCity: 1,
      sAddressState: 1,
      sAddressZip: 1,
      desc: 1,
      partNo: 1,
      warranty: 1,
      vin: 1,
      programmingRequired: 1,
      year: 1,
      make: 1,
      model: 1,
      orderHistory: 1,
      custRefAmount: 1,
      soldP: 1,
      grossProfit: 1,
      actualGP: 1,
    };

    // Special case: sort by combined "customer name" when customerName is missing
    if (sortBy === "customerName") {
      const pipeline = [
        { $match: filter },
        {
          $addFields: {
            fullName: {
              $trim: {
                input: {
                  $ifNull: [
                    "$customerName",
                    {
                      $concat: [
                        { $ifNull: ["$fName", ""] },
                        " ",
                        { $ifNull: ["$lName", ""] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
        { $sort: { fullName: dir, _id: 1 } },
        { $skip: skip },
        { $limit: pageSize },
        { $project: projectFields },
      ];

      const orders = await Order.aggregate(pipeline).collation({ locale: "en", strength: 2 });

      return res.json({
        orders,
        totalOrders,
        totalPages: Math.ceil(totalOrders / pageSize),
        currentPage: Math.max(parseInt(page, 10) || 1, 1),
      });
    }

    // Default path: regular find/sort with collation (case-insensitive)
    const sortSpec = SORT_MAP[sortBy]
      ? { [SORT_MAP[sortBy]]: dir, _id: 1 }
      : { orderDate: -1, _id: 1 }; // default newest first

    const orders = await Order.find(filter, projectFields)
      .collation({ locale: "en", strength: 2 })
      .sort(sortSpec)
      .skip(skip)
      .limit(pageSize)
      .lean();

    res.json({
      orders,
      totalOrders,
      totalPages: Math.ceil(totalOrders / pageSize),
      currentPage: Math.max(parseInt(page, 10) || 1, 1),
    });
  } catch (error) {
    console.error("Error fetching overall escalations:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


export default router;

