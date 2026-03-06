import express from "express";
import moment from "moment-timezone";
import { getOrderModelForBrand } from "../models/Order.js";

const router = express.Router();
const TZ = "America/Chicago";

function getDateRange({ start, end, month, year }) {
  if (start && end) {
    const startDate = moment.tz(start, TZ).startOf("day").toDate();
    const endDate = moment.tz(end, TZ).endOf("day").toDate();
    return { startDate, endDate };
  }

  if (month && year) {
    const monthMap = {
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11,
    };

    const mIndex = isNaN(month)
      ? monthMap[month]
      : parseInt(month, 10) - 1;

    const y = parseInt(year, 10);
    if (isNaN(mIndex) || isNaN(y)) {
      throw new Error("Invalid month/year");
    }

    const startMoment = moment.tz({ year: y, month: mIndex }, TZ).startOf("month");
    const endExclusive = startMoment.clone().add(1, "month");

    return {
      startDate: startMoment.toDate(),
      endDate: endExclusive.toDate(),
    };
  }

  throw new Error("Provide either start/end or month/year");
}

// GET /orders/junkPartsOrders
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

    // Base filter: date range + at least one yard marked as Junk / Junked Replacement
    const filter = {
      orderDate: { $gte: startDate, $lt: endDate },
      additionalInfo: {
        $elemMatch: {
          escTicked: "Yes",
          $or: [
            { escalationProcess: "Junk" },
            {
              escalationProcess: "Replacement",
              custReason: "Junked",
            },
          ],
        },
      },
    };

    // Free-text search (similar surface as other escalation reports)
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
        or.push({ year: qTrim }); // if stored as string
      }

      filter.$or = or;
    }

    const Order = getOrderModelForBrand(req.brand);

    const totalOrders = await Order.countDocuments(filter);

    const SORT_MAP = {
      orderDate: "orderDate",
      orderNo: "orderNo",
      yardName: "additionalInfo.0.yardName",
    };

    const dir = sortOrder === "desc" ? -1 : 1;

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
    };

    const sortSpec = SORT_MAP[sortBy]
      ? { [SORT_MAP[sortBy]]: dir, _id: 1 }
      : { orderDate: -1, _id: 1 };

    const orders = await Order.find(filter, projectFields)
      .collation({ locale: "en", strength: 2 })
      .sort(sortSpec)
      .skip(skip)
      .limit(pageSize)
      .lean();

    return res.json({
      orders,
      totalOrders,
      totalPages: Math.ceil(totalOrders / pageSize),
      currentPage: Math.max(parseInt(page, 10) || 1, 1),
    });
  } catch (error) {
    console.error("Error fetching junk parts orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;

