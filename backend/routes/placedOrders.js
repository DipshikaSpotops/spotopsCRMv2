import express from "express";
import Order from "../models/Order.js";
import moment from "moment-timezone";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { month, year, start, end, q } = req.query;
    let filter = { orderStatus: "Placed" };
    console.log("Incoming Query Params:", { month, year, start, end });
    // Case 1: Start & End provided (Date range filter)
    if (start && end) {
      // Interpret start/end as Dallas time at start of day / end of day
      const startDate = moment.tz(start, "America/Chicago").startOf("day").toDate();
      const endDate = moment.tz(end, "America/Chicago").endOf("day").toDate();
      console.log("Dallas Start Date:", startDate);
      console.log("Dallas End Date:", endDate);
      filter.orderDate = {
        $gt: startDate,
        $lt: endDate,
      };
    }
    // Case 2: Month & Year provided (Full month filter)
    else if (month && year) {
      const monthMap = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
      };
      if (!(month in monthMap) && isNaN(month)) {
        return res.status(400).json({ message: "Invalid month format" });
      }
      // If month is numeric (e.g., "07"), convert to int for moment
      const monthIndex = isNaN(month) ? monthMap[month] : parseInt(month, 10) - 1;
      // Get start and end of the month in Dallas time
      const startDate = moment.tz({ year: parseInt(year), month: monthIndex, day: 1 }, "America/Chicago").startOf("month").toDate();
      const endDate = moment(startDate).add(1, "month").toDate(); // start of next month (exclusive)
      console.log("Dallas Month Start:", startDate);
      console.log("Dallas Month End:", endDate);
      filter.orderDate = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    // Case 3: Invalid Query
    else {
      console.warn("Invalid query: must provide either month/year or start/end");
      return res
        .status(400)
        .json({ message: "Provide either month/year or start/end" });
    }

    console.log("MongoDB Filter:", JSON.stringify(filter, null, 2));
    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), "i");
      // Adjust field names to match your schema
      filter.$or = [
        { orderNo: regex },           // if stored as string
        { customerName: regex },
        { fName: regex },
        { lName: regex },
        { salesAgent: regex },
        { phone: regex },
        { customerPhone: regex },
        { contactNo: regex },
      ];
    }
    // Fetch Orders from DB
    const orders = await Order.find(filter).sort({ orderDate: 1 }).limit(25);
    console.log(`Orders fetched: ${orders.length}`);

    res.json(orders);

  } catch (error) {
    console.error("Error fetching placed orders:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

export default router;
