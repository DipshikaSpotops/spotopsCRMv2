// routes/disputedOrders.js
import express from "express";
import Order from "../models/Order.js";
import moment from "moment-timezone";

const router = express.Router();

function getDateRange({ start, end, month, year }) {
  const tz = "America/Chicago";

  if (start && end) {
    const startDate = moment.tz(start, tz).startOf("day").toDate();
    const endDate = moment.tz(end, tz).endOf("day").toDate();
    return { startDate, endDate };
  } else if (month && year) {
    const monthMap = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };

    let paddedMonth;
    if (month.length === 3 && monthMap[month]) {
      paddedMonth = monthMap[month];
    } else if (!isNaN(month)) {
      paddedMonth = String(month).padStart(2, "0");
    } else {
      throw new Error("Invalid month format");
    }

    const startDate = moment
      .tz(`${year}-${paddedMonth}-01`, tz)
      .startOf("month")
      .toDate();
    const endDate = moment
      .tz(`${year}-${paddedMonth}-01`, tz)
      .endOf("month")
      .toDate();

    return { startDate, endDate };
  }

  throw new Error("Provide either start/end or month/year");
}

router.get("/", async (req, res) => {
  try {
    const { start, end, month, year, page = 1, q } = req.query;
    const { startDate, endDate } = getDateRange({ start, end, month, year });

    const pageSize = 25;
    const pageNum = parseInt(page, 10) || 1;
    const skip = (pageNum - 1) * pageSize;

    const filter = {
      orderDate: { $gte: startDate, $lt: endDate },
      orderStatus: { $in: ["Dispute", "Dispute 2"] },
    };

    // ---------- SEARCH ----------
    if (q && q.trim()) {
      const qTrim = q.trim();

      // Escape special chars for regex
      const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const rx = new RegExp(escapeRx(qTrim), "i");
      // match “Dispute … by <name>”
      const disputeByRx = new RegExp(`Dispute[\\s\\S]*?\\bby\\s+${escapeRx(qTrim)}`, "i");

      const orClauses = [
        // top-level fields
        { orderNo: rx },
        { customerName: rx },
        { fName: rx },
        { lName: rx },
        { salesAgent: rx },
        { phone: rx },
        { email: rx },
        { pReq: rx },
        { partName: rx },
        { desc: rx },
        { partNo: rx },
        { make: rx },
        { model: rx },

        // nested yard fields
        { additionalInfo: { $elemMatch: { yardName: rx } } },
        { additionalInfo: { $elemMatch: { status: rx } } },

        // orderHistory as array of STRINGS (generic search)
        { orderHistory: { $elemMatch: { $regex: rx } } },

        // orderHistory as array of STRINGS (specifically “Dispute … by <name>”)
        { orderHistory: { $elemMatch: { $regex: disputeByRx } } },

        // orderHistory as array of OBJECTS (fields: message/text/note) — generic search
        { orderHistory: { $elemMatch: { message: { $regex: rx } } } },
        { orderHistory: { $elemMatch: { text:    { $regex: rx } } } },
        { orderHistory: { $elemMatch: { note:    { $regex: rx } } } },

        // orderHistory as array of OBJECTS — “Dispute … by <name>”
        { orderHistory: { $elemMatch: { message: { $regex: disputeByRx } } } },
        { orderHistory: { $elemMatch: { text:    { $regex: disputeByRx } } } },
        { orderHistory: { $elemMatch: { note:    { $regex: disputeByRx } } } },
      ];

      filter.$or = orClauses;
    }
    // ---------- /SEARCH ----------

    const totalOrders = await Order.countDocuments(filter);

    const orders = await Order.find(filter)
      .sort({ orderDate: 1, _id: 1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    res.json({
      orders,
      totalOrders,
      totalPages: Math.ceil(totalOrders / pageSize),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error("Error fetching disputed orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;
