// routes/fulfilledOrders.js
import express from "express";
import Order from "../models/Order.js";
import moment from "moment-timezone";

const router = express.Router();

function getDateRange({ start, end, month, year }) {
  const tz = "America/Chicago";

  if (start && end) {
    const startDate = moment.tz(start, tz).startOf("day").toDate();
    const endDate   = moment.tz(end,   tz).endOf("day").toDate(); // inclusive end of day
    return { startDate, endDate };
  }

  if (month && year) {
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
    const endDate   = moment(startDate).add(1, "month").toDate(); // end-exclusive (1st of next month)
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
      limit = "25",           // can be "all" or a number
      q = "",
      sortBy,
      sortOrder = "asc",
    } = req.query;

    const { startDate, endDate } = getDateRange({ start, end, month, year });

    // Base filter
    const filter = {
      orderDate: { $gte: startDate, $lt: endDate },
      orderStatus: "Order Fulfilled",
    };

    // Free-text search
    if (q && q.trim()) {
      const needle = q.trim();
      const rx = new RegExp(needle, "i");
      const maybeNum = Number(needle);
      const or = [
        { orderNo: rx },
        { customerName: rx }, { fName: rx }, { lName: rx },
        { salesAgent: rx }, { phone: rx }, { email: rx },
        { pReq: rx }, { desc: rx }, { partNo: rx },
        { make: rx }, { model: rx },
        { additionalInfo: { $elemMatch: { yardName: rx } } },
      ];
      if (Number.isFinite(maybeNum)) {
        or.push({ year: maybeNum }, { year: needle }); // numeric or string
      }
      filter.$or = or;
    }

    const totalOrders = await Order.countDocuments(filter);

    // Build aggregation (normalize orderNo for numeric sorting)
    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          _orderNoIsNumeric: { $regexMatch: { input: "$orderNo", regex: /^[0-9]+(\.[0-9]+)?$/ } },
        },
      },
      {
        $addFields: {
          _orderNoNum: {
            $cond: [ "$_orderNoIsNumeric", { $toDouble: "$orderNo" }, null ],
          },
        },
      },
    ];

    // Server-side sort only for orderDate / orderNo; otherwise default newest-first
    const dir = sortOrder === "desc" ? -1 : 1;
    if (sortBy === "orderDate") {
      pipeline.push({ $sort: { orderDate: dir, _id: 1 } });
    } else if (sortBy === "orderNo") {
      pipeline.push({ $sort: { _orderNoNum: dir, orderNo: dir, _id: 1 } });
    } else {
      pipeline.push({ $sort: { orderDate: -1, _id: 1 } });
    }

    const isAll = String(limit).toLowerCase() === "all";
    let pageSize = 25;
    let pageNum  = Math.max(parseInt(page, 10) || 1, 1);

    if (!isAll) {
      pageSize = Math.max(parseInt(limit, 10) || 25, 1);
      const skip = (pageNum - 1) * pageSize;
      pipeline.push({ $skip: skip }, { $limit: pageSize });
    }
    // if isAll => do NOT push $skip/$limit (return everything in the window)

    const orders = await Order.aggregate(pipeline);

    res.json({
      orders,
      totalOrders,
      totalPages: isAll ? 1 : Math.ceil(totalOrders / pageSize),
      currentPage: isAll ? 1 : pageNum,
    });
  } catch (error) {
    console.error("Error fetching fulfilled orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;
