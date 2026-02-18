// server/routes/customerApproved.js
import express from "express";
import { getOrderModelForBrand } from "../models/Order.js";
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
    if (month.length === 3 && monthMap[month]) paddedMonth = monthMap[month];
    else if (!isNaN(month)) paddedMonth = String(month).padStart(2, "0");
    else throw new Error("Invalid month format");

    const startDate = moment.tz(`${year}-${paddedMonth}-01`, tz).startOf("month").toDate();
    const endDate = moment.tz(`${year}-${paddedMonth}-01`, tz).endOf("month").toDate();
    return { startDate, endDate };
  }
  throw new Error("Provide either start/end or month/year");
}

router.get("/", async (req, res) => {
  try {
    const { start, end, month, year, q } = req.query;

    if ((!start || !end) && (!month || !year)) {
      return res.status(400).json({ message: "Provide either start/end dates or month/year" });
    }

    const { startDate, endDate } = getDateRange({ start, end, month, year });

    const filter = {
      orderStatus: "Customer approved",
      orderDate: { $gte: startDate, $lt: endDate },
    };

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), "i");
      filter.$or = [
        { orderNo: regex },
        { customerName: regex },
        { fName: regex },
        { lName: regex },
        { salesAgent: regex },
        { phone: regex },
        { customerPhone: regex },
        { contactNo: regex },
        { email: regex },
      ];
    }

    const Order = getOrderModelForBrand(req.brand);
    const orders = await Order.find(filter).sort({ orderDate: 1 });
    res.json(orders);
  } catch (error) {
    console.error("Error fetching customerApproved orders:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;
