import express from "express";
import moment from "moment-timezone";
import { getOrderModelForBrand } from "../models/Order.js";
import { requireAuth, allow } from "../middleware/auth.js";
import {
  enrichPriorityOrder,
  isExcludedFromPriorityOrders,
  orderQualifiesForPriority,
  PRIORITY_STALE_MIN_CALENDAR_DAYS,
} from "../../shared/utils/priorityOrderHistory.js";

const router = express.Router();
const TZ = "America/Chicago";

function buildDateRange(q) {
  const { start, end, month, year } = q;

  if (start && end) {
    const startDate = moment.tz(start, TZ).startOf("day").toDate();
    const endDate = moment.tz(end, TZ).endOf("day").add(1, "millisecond").toDate();
    return { startDate, endDate, exclusiveEnd: true };
  }

  if (month && year) {
    const monthIndex = Number.isNaN(Number(month))
      ? { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }[month]
      : parseInt(month, 10) - 1;
    const y = parseInt(year, 10);
    if (Number.isNaN(monthIndex) || Number.isNaN(y)) {
      throw new Error("Invalid month/year");
    }
    const startDate = moment.tz({ year: y, month: monthIndex }, TZ).startOf("month").toDate();
    const endDate = moment.tz({ year: y, month: monthIndex }, TZ).endOf("month").add(1, "millisecond").toDate();
    return { startDate, endDate, exclusiveEnd: true };
  }

  return null;
}

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
  actualGP: 1,
  orderStatus: 1,
  pReq: 1,
  partName: 1,
  additionalInfo: 1,
  orderHistory: 1,
  email: 1,
  phone: 1,
  sAddressStreet: 1,
  sAddressCity: 1,
  sAddressState: 1,
  sAddressZip: 1,
  sAddressAcountry: 1,
  desc: 1,
  partNo: 1,
  warranty: 1,
  warrantyField: 1,
  vin: 1,
  programmingRequired: 1,
  year: 1,
  make: 1,
  model: 1,
};

const SORT_MAP = {
  orderDate: (a, b) => new Date(a.orderDate) - new Date(b.orderDate),
  orderNo: (a, b) => String(a.orderNo || "").localeCompare(String(b.orderNo || ""), "en", { sensitivity: "base" }),
  pReq: (a, b) => String(a.pReq || a.partName || "").localeCompare(String(b.pReq || b.partName || ""), "en", { sensitivity: "base" }),
  salesAgent: (a, b) => String(a.salesAgent || "").localeCompare(String(b.salesAgent || ""), "en", { sensitivity: "base" }),
  customerName: (a, b) => {
    const nameA = a.customerName || `${a.fName || ""} ${a.lName || ""}`.trim();
    const nameB = b.customerName || `${b.fName || ""} ${b.lName || ""}`.trim();
    return nameA.localeCompare(nameB, "en", { sensitivity: "base" });
  },
  daysInYardLocated: (a, b) => (a.maxPriorityDays || 0) - (b.maxPriorityDays || 0),
  priorityDays: (a, b) => (a.maxPriorityDays || 0) - (b.maxPriorityDays || 0),
  orderStatus: (a, b) => String(a.orderStatus || "").localeCompare(String(b.orderStatus || ""), "en", { sensitivity: "base" }),
};

router.get("/", requireAuth, allow("Admin", "Sales", "Support"), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      q,
      sortBy,
      sortOrder = "desc",
      salesAgent,
      start,
      end,
      month,
      year,
    } = req.query;

    const query = {
      $nor: [
        { orderStatus: /^order\s+cancelled$/i },
        { orderStatus: /^refunded$/i },
        { orderStatus: /^dispute/i },
      ],
    };

    const range = buildDateRange({ start, end, month, year });
    if (range) {
      query.orderDate = range.exclusiveEnd
        ? { $gte: range.startDate, $lt: range.endDate }
        : { $gte: range.startDate, $lte: range.endDate };
    }

    if (q && q.trim()) {
      const rx = new RegExp(q.trim(), "i");
      query.$or = [
        { orderNo: rx },
        { customerName: rx },
        { fName: rx },
        { lName: rx },
        { salesAgent: rx },
        { phone: rx },
        { email: rx },
        { pReq: rx },
        { desc: rx },
        { make: rx },
        { model: rx },
        { orderStatus: rx },
        { additionalInfo: { $elemMatch: { yardName: rx } } },
      ];
    }

    if (req.user.role === "Admin" && salesAgent && String(salesAgent).trim()) {
      query.salesAgent = new RegExp(String(salesAgent).trim(), "i");
    }

    const Order = getOrderModelForBrand(req.brand);
    const candidates = await Order.find(query, projectFields).lean();

    let filtered = candidates
      .filter((order) => !isExcludedFromPriorityOrders(order.orderStatus))
      .map((order) => enrichPriorityOrder(order))
      .filter(
        (order) =>
          orderQualifiesForPriority(order) &&
          (order.maxPriorityDays || 0) >= PRIORITY_STALE_MIN_CALENDAR_DAYS
      );

    const dir = sortOrder === "asc" ? 1 : -1;
    const sorter = SORT_MAP[sortBy] || SORT_MAP.orderDate;
    filtered.sort((a, b) => dir * sorter(a, b));

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;
    const totalOrders = filtered.length;
    const orders = filtered.slice(skip, skip + limitNum);

    const totalEstGP = filtered.reduce((sum, row) => sum + (parseFloat(row?.grossProfit) || 0), 0);
    const totalActualGP = filtered.reduce((sum, row) => sum + (parseFloat(row?.actualGP) || 0), 0);

    return res.json({
      totalOrders,
      currentPage: pageNum,
      totalPages: Math.ceil(totalOrders / limitNum) || 1,
      orders,
      totalEstGP,
      totalActualGP,
    });
  } catch (err) {
    console.error("Error fetching priority orders:", err);
    const msg = err?.message?.includes("Invalid month/year")
      ? err.message
      : "Internal server error";
    return res.status(500).json({ message: msg });
  }
});

export default router;
