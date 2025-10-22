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
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
    };

    let paddedMonth;
    if (month.length === 3 && monthMap[month]) {
      paddedMonth = monthMap[month];
    } else if (!isNaN(month)) {
      paddedMonth = month.padStart(2, "0");
    } else {
      throw new Error("Invalid month format");
    }

    const startDate = moment.tz(`${year}-${paddedMonth}-01`, tz).startOf("month").toDate();
    const endDate = moment.tz(`${year}-${paddedMonth}-01`, tz).endOf("month").toDate();

    return { startDate, endDate };
  } else {
    throw new Error("Provide either start/end or month/year");
  }
}

router.get("/", async (req, res) => {
  console.log("-----refunded orders");
  try {
    const { start, end, month, year, page = 1 } = req.query;
    const { startDate, endDate } = getDateRange({ start, end, month, year });

    const pageSize = 25;
    const skip = (parseInt(page) - 1) * pageSize;

    const filter = {
      orderDate: { $gte: startDate, $lt: endDate },
      orderStatus: "Refunded"
    };

    const totalOrders = await Order.countDocuments(filter);
    const totalPages = Math.ceil(totalOrders / pageSize);

    const orders = await Order.find(filter)
      .sort({ orderDate: 1 })
      .skip(skip)
      .limit(pageSize);

    res.json({
      orders,
      totalOrders,
      totalPages,
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error("Error fetching refunded orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


export default router;

