// routes/orders.js
import express from "express";
import moment from "moment-timezone";
import jwt from "jsonwebtoken";
import { getOrderModelForBrand } from "../models/Order.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { getDateRange } from "../utils/dateRange.js";
import { getWhen } from "../../shared/utils/timeUtils.js";
import multer from "multer";
import { uploadVoidLabelScreenshotToS3 } from "../services/s3Upload.js";

const router = express.Router();
const TZ = "America/Chicago";
const upload = multer();

/* helper functions*/
// publish to all clients watching this order
const publish = (req, orderNo, payload = {}) => {
  try {
    const io = req.app.get("io");
    const actorId =
      req.get("x-actor-id") ||
      req.query.actorId ||
      (req.body && req.body.actorId) ||
      null;

    io.to(`order.${orderNo}`).emit("order:msg", {
      orderNo,
      actorId,      
      ...payload,
    });
  } catch (e) {
    console.warn("[ws] emit failed", e);
  }
};

// broadcast an updated order object to all listeners (for list pages, dashboards, etc.)
const broadcastOrder = (req, order) => {
  try {
    if (!order) return;
    const io = req.app.get("io");
    if (!io) return;
    io.emit("orderUpdated", order);
  } catch (e) {
    console.warn("[ws] broadcastOrder failed", e);
  }
};

// Helper to get the correct Order model for this request
const getOrderModel = (req) => getOrderModelForBrand(req.brand);
const coerceDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  
  // Handle Date objects first - check both instanceof and object type with getTime method
  // Also check if it's a Date-like object (has getTime method and constructor is Date)
  if (value instanceof Date || (value && typeof value === "object" && typeof value.getTime === "function" && value.constructor === Date)) {
    const dateValue = value instanceof Date ? value : new Date(value.getTime());
    return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  }
  
  // Handle moment objects
  if (moment.isMoment(value)) {
    const asDate = value.toDate();
    return Number.isNaN(asDate.getTime()) ? null : asDate;
  }
  
  // Handle numbers (timestamps)
  if (typeof value === "number") {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  
  // Handle strings
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    
    // Check if string looks like a Date object string representation (e.g., "Mon Dec 01 2025...")
    // If so, try to parse it as a Date first
    if (/^[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}/.test(trimmed)) {
      const dateFromString = new Date(trimmed);
      if (!Number.isNaN(dateFromString.getTime())) {
        return dateFromString;
      }
    }
    
    const formats = [
      moment.ISO_8601,
      "YYYY-MM-DD",
      "YYYY-MM-DDTHH:mm:ss.SSSZ",
      "MM/DD/YYYY",
      "MM/DD/YYYY HH:mm",
      "M/D/YYYY",
      "M/D/YYYY HH:mm",
      "Do MMM, YYYY",
      "Do MMM, YYYY H:mm",
      "Do MMM, YYYY h:mm A",
      "MMM D, YYYY",
      "MMM D, YYYY H:mm",
      "MMM D, YYYY h:mm A",
    ];
    let parsed = moment.tz(trimmed, formats, true, "America/Chicago");
    if (!parsed.isValid()) {
      parsed = moment(trimmed, formats, true);
    }
    if (!parsed.isValid()) {
      // Only use moment(trimmed) as last resort, and catch any errors
      try {
        parsed = moment(trimmed);
      } catch (err) {
        console.warn("[coerceDate] moment parsing error:", err.message, "for value:", trimmed);
        // Fall back to native Date constructor
        const fallback = new Date(trimmed);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
      }
    }
    if (parsed.isValid()) {
      const asDate = parsed.toDate();
      return Number.isNaN(asDate.getTime()) ? null : asDate;
    }
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  
  // Handle objects with toDate method (like Firestore timestamps)
  if (value && typeof value === "object" && typeof value.toDate === "function") {
    const fromObj = value.toDate();
    if (fromObj instanceof Date && !Number.isNaN(fromObj.getTime())) {
      return fromObj;
    }
    return null;
  }
  
  return null;
};
const sanitizeYardDateFields = (yard) => {
  if (!yard || typeof yard !== "object") return;
  const dateKeys = ["poSentDate", "cardChargedDate", "refundedDate"];
  for (const key of dateKeys) {
    if (!(key in yard)) continue;
    const current = yard[key];
    if (current === null || current === undefined || current === "") {
      yard[key] = null;
      continue;
    }
    // Check if it's already a valid Date object (more robust check)
    if (current instanceof Date && !Number.isNaN(current.getTime())) {
      continue;
    }
    // Also check for Date-like objects
    if (current && typeof current === "object" && typeof current.getTime === "function" && current.constructor === Date) {
      const dateValue = new Date(current.getTime());
      if (!Number.isNaN(dateValue.getTime())) {
        yard[key] = dateValue;
        continue;
      }
    }
    const coerced = coerceDate(current);
    if (coerced) {
      yard[key] = coerced;
    } else {
      console.warn(`[orders] Unable to coerce ${key}`, current, typeof current);
      yard[key] = null;
    }
  }
};
const isInactiveStatus = (s) => {
  const t = String(s ?? "").trim().toLowerCase();
  return (
    t === "po cancelled" ||
    t === "po canceled" ||
    t === "po cancel" ||
    t === "escalation" ||
    t === "cancelled" ||
    t === "canceled"
  );
};

const HUMAN_FIELD_LABELS = {
  escalationCause: "Escalation",
  escalationProcess: "Process",
  custReason: "Reason",
  customerShippingMethodReplacement: "Shipping method",
  custOwnShipReplacement: "Own shipping value",
  customerShipperReplacement: "Shipper",
  customerTrackingNumberReplacement: "Tracking number",
  customerETAReplacement: "ETA",
  custreplacementDelivery: "Delivery status",
  yardShippingStatus: "Shipping status (yard)",
  yardShippingMethod: "Shipping method (yard)",
  yardOwnShipping: "Own shipping (yard)",
  yardShipper: "Shipper (yard)",
  yardTrackingNumber: "Tracking number (yard)",
  yardTrackingETA: "ETA (yard)",
  yardTrackingLink: "Tracking link",
  custShipToRep: "Ship to (replacement)",
  customerShippingMethodReturn: "Shipping method (return)",
  custOwnShippingReturn: "Own shipping value (return)",
  customerShipperReturn: "Shipper (return)",
  returnTrackingCust: "Tracking number (return)",
  custretPartETA: "ETA (return)",
  custReturnDelivery: "Delivery status (return)",
  custShipToRet: "Ship to (return)",
};

const categorizeField = (field) => {
  if (field === "escalationCause") return "General";
  if (field.startsWith("customer") || field.startsWith("cust")) {
    return "Replacement (Part from customer)";
  }
  if (field.startsWith("yard")) return "Replacement (Part from yard)";
  if (
    field.startsWith("return") ||
    field.startsWith("custret") ||
    field.startsWith("custReturn") ||
    field.startsWith("custShipToRet") ||
    field === "customerShippingMethodReturn" ||
    field === "custOwnShippingReturn"
  ) {
    return "Return (Part from customer)";
  }
  return "General";
};

const toHumanLabel = (field) => {
  if (HUMAN_FIELD_LABELS[field]) return HUMAN_FIELD_LABELS[field];
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
};

// Helper function to clean firstName (remove duplicates, comma-separated values)
const cleanFirstName = (name) => {
  if (!name) return "";
  let cleaned = String(name).trim();
  // If firstName contains comma, split and take first part only
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
    cleaned = parts[0] || "";
  }
  return cleaned;
};

const formatNote = (author, when, message) => {
  if (!author) {
    throw new Error("author (firstName) is required for formatNote");
  }
  const name = cleanFirstName(author.toString().trim());
  const stamp = when || getWhen();
  return `${name}, ${stamp} : ${message}`;
};

const pushUniqueNote = (notesArr, noteText) => {
  if (!Array.isArray(notesArr) || !noteText) return false;
  const trimmed = noteText.trim();
  if (!trimmed) return false;
  const last = notesArr[notesArr.length - 1];
  if (last && last.trim() === trimmed) return false;
  notesArr.push(trimmed);
  return true;
};

/* ---------------------------- Routes ----------------------------- */

// Yearly aggregation (for bar chart)
router.get("/yearly", async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ message: "Year is required" });

    const y = Number(year);
    const start = new Date(Date.UTC(y, 0, 1));
    const end   = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));

    const Order = getOrderModel(req);
    const results = await Order.aggregate([
      { $match: { orderDate: { $gte: start, $lte: end } } },
      { $group: { _id: { $month: "$orderDate" }, totalActualGP: { $sum: { $toDouble: "$actualGP" } } } },
      { $sort: { _id: 1 } },
    ]);

    res.json(results);
  } catch (err) {
    console.error("Yearly aggregation failed:", err);
    res.status(500).json({ message: "Server error", error: err?.message || String(err) });
  }
});

// Dashboard aggregates for a month
router.get("/dashboard", async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }

    const m = Number(month); // 1..12
    const y = Number(year);

    const startDate = new Date(Date.UTC(y, m - 1, 1));
    const endDate   = new Date(Date.UTC(y, m, 1));

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    // Monthly breakdown (group by day + status)
    const Order = getOrderModel(req);

    const monthlyData = await Order.aggregate([
      { $match: { orderDate: { $gte: startDate, $lt: endDate } } },
      {
        $group: {
          _id: { day: { $dayOfMonth: "$orderDate" }, status: "$orderStatus" },
          orders: { $sum: 1 },
          totalSales: { $sum: { $toDouble: "$soldP" } },
          totalGP: { $sum: { $toDouble: "$grossProfit" } },
          actualGP: { $sum: { $toDouble: "$actualGP" } },
        },
      },
    ]);

    let totals = { totalOrders: 0, totalSales: 0, totalGp: 0, actualGp: 0 };
    const dailyData = {};
    const statusBreakdown = {};

    monthlyData.forEach((row) => {
      totals.totalOrders += row.orders;
      totals.totalSales  += row.totalSales;
      totals.totalGp     += row.totalGP;
      totals.actualGp    += row.actualGP;

      const day = row._id.day;
      if (!dailyData[day]) dailyData[day] = { orders: 0, gp: 0 };
      dailyData[day].orders += row.orders;
      dailyData[day].gp     += row.totalGP;

      const status = row._id.status || "Unknown";
      statusBreakdown[status] = (statusBreakdown[status] || 0) + row.orders;
    });

    // Yearly GP
    const yearlyData = await Order.aggregate([
      { $match: { orderDate: { $gte: new Date(Date.UTC(y, 0, 1)), $lt: new Date(Date.UTC(y + 1, 0, 1)) } } },
      { $group: { _id: { month: { $month: "$orderDate" } }, totalActualGP: { $sum: { $toDouble: "$actualGP" } } } },
    ]);

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const yearlyGP = months.map((mm, i) => ({
      month: mm,
      actualGP: yearlyData.find((r) => r._id.month === i + 1)?.totalActualGP || 0,
    }));

    // Agent GP (this month)
    const agentData = await Order.aggregate([
      { $match: { orderDate: { $gte: startDate, $lt: endDate } } },
      { $group: { _id: "$salesAgent", totalGP: { $sum: { $toDouble: "$grossProfit" } } } },
    ]);
    const monthlyAgentGP = {};
    agentData.forEach((a) => { monthlyAgentGP[a._id || "Unknown"] = a.totalGP; });

    // Best day this month
    const dayData = await Order.aggregate([
      { $match: { orderDate: { $gte: startDate, $lt: endDate } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } }, totalGP: { $sum: { $toDouble: "$grossProfit" } } } },
      { $sort: { totalGP: -1 } },
      { $limit: 1 },
    ]);
    const bestDay = dayData.length ? [dayData[0]._id, dayData[0].totalGP] : null;

    // Top agent today
    const todayAgentData = await Order.aggregate([
      { $match: { orderDate: { $gte: todayStart, $lt: todayEnd } } },
      { $group: { _id: "$salesAgent", totalGP: { $sum: { $toDouble: "$grossProfit" } } } },
      { $sort: { totalGP: -1 } },
      { $limit: 1 },
    ]);
    const topAgentToday = todayAgentData.length
      ? [todayAgentData[0]._id || "Unknown", todayAgentData[0].totalGP]
      : null;

    res.json({ ...totals, dailyData, statusBreakdown, yearlyGP, monthlyAgentGP, bestDay, topAgentToday });
  } catch (err) {
    console.error("Dashboard aggregation failed:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Cancelled-by-date
router.get("/cancelled-by-date", async (req, res) => {
  try {
    const { start, end, month, year } = req.query;
    const { startDate, endDate } = getDateRange({ start, end, month, year });

    const Order = getOrderModel(req);
    const orders = await Order.find({
      cancelledDate: { $gte: startDate, $lt: endDate },
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching cancelled-by-date orders:", error);
    res.status(500).json({ message: "Server error", error: error?.message || String(error) });
  }
});

// Reimbursed-by-date (includes both old per-yard and new order-level reimbursements)
router.get("/reimbursed-by-date", async (req, res) => {
  try {
    const { start, end, month, year } = req.query;
    const { startDate, endDate } = getDateRange({ start, end, month, year });

    // Find orders with:
    // 1. New order-level reimbursement (reimbursementDate)
    // 2. Old per-yard reimbursement (additionalInfo[].reimbursedDate)
    const Order = getOrderModel(req);
    const orders = await Order.find({
      $or: [
        { reimbursementDate: { $gte: startDate, $lt: endDate } },
        { "additionalInfo.reimbursedDate": { $gte: startDate, $lt: endDate } },
      ],
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching reimbursed-by-date orders:", error);
    res.status(500).json({ message: "Server error", error: error?.message || String(error) });
  }
});

// Refunded-by-date
router.get("/refunded-by-date", async (req, res) => {
  try {
    const { start, end, month, year } = req.query;
    const { startDate, endDate } = getDateRange({ start, end, month, year });

    const Order = getOrderModel(req);
    const orders = await Order.find({
      custRefundDate: { $gte: startDate, $lt: endDate },
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching refunded-by-date orders:", error);
    res.status(500).json({ message: "Server error", error: error?.message || String(error) });
  }
});

// Card Charged - shows orders with card charged yards and refund details
router.get("/card-charged", async (req, res) => {
  try {
    const { start, end, month, year } = req.query;
    const { startDate, endDate } = getDateRange({ start, end, month, year });

    // Find all orders with card charged yards
    const Order = getOrderModel(req);
    const orders = await Order.find({
      "additionalInfo.paymentStatus": "Card charged",
      orderDate: { $gte: startDate, $lt: endDate },
    }).select("orderNo orderDate orderStatus custRefAmount custRefundDate cancelledDate cancellationReason additionalInfo");

    // Group yards by order
    const orderMap = new Map();

    orders.forEach((order) => {
      const yards = [];
      let totalOrderCharged = 0;

      order.additionalInfo.forEach((yard, yardIndex) => {
        if (yard.paymentStatus === "Card charged") {
          // Calculate total charged amount
          const partPrice = parseFloat(yard.partPrice) || 0;
          let shippingCost = 0;
          if (yard.shippingDetails) {
            const match = yard.shippingDetails.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
            if (match) {
              shippingCost = parseFloat(match[1]) || 0;
            }
          }
          const others = parseFloat(yard.others) || 0;
          const totalCharged = partPrice + shippingCost + others;
          totalOrderCharged += totalCharged;

          // Check if order is cancelled
          const isCancelled = order.orderStatus === "Order Cancelled";
          
          // Check refund conditions (only for cancelled orders)
          const isRefunded = isCancelled && order.orderStatus === "Refunded" && order.custRefAmount;
          const isPOCancelled = isCancelled && (yard.status === "PO cancelled" || yard.status === "PO canceled");
          const isCollectRefundChecked = isCancelled && (yard.collectRefundCheckbox === "true" || yard.collectRefundCheckbox === true || yard.collectRefundCheckbox === "checked");
          
          // Refund details
          const refundInfo = {
            isRefunded: isRefunded,
            hasCustRefAmount: !!order.custRefAmount,
            isPOCancelled: isPOCancelled,
            isCollectRefundChecked: isCollectRefundChecked,
            refundedAmount: parseFloat(yard.refundedAmount) || 0,
            refundStatus: yard.refundStatus || "",
          };

          yards.push({
            yardIndex: yardIndex + 1,
            yardName: yard.yardName || "",
            partPrice: partPrice,
            shippingCost: shippingCost,
            others: others,
            totalCharged: totalCharged,
            cardChargedDate: yard.cardChargedDate || null,
            yardStatus: yard.status || "",
            refundInfo: refundInfo,
          });
        }
      });

      if (yards.length > 0) {
        const isCancelled = order.orderStatus === "Order Cancelled";
        orderMap.set(order.orderNo, {
          orderNo: order.orderNo,
          orderDate: order.orderDate,
          orderStatus: order.orderStatus,
          isCancelled: isCancelled,
          custRefAmount: order.custRefAmount || null,
          custRefundDate: order.custRefundDate || null,
          cancelledDate: order.cancelledDate || null,
          cancellationReason: order.cancellationReason || null,
          yards: yards,
          totalCharged: totalOrderCharged,
        });
      }
    });

    const results = Array.from(orderMap.values());
    res.json(results);
  } catch (error) {
    console.error("Error fetching card-charged orders:", error);
    res.status(500).json({ message: "Server error", error: error?.message || String(error) });
  }
});

// Disputes-by-date (brand-aware)
router.get("/disputes-by-date", async (req, res) => {
  try {
    const { start, end, month, year } = req.query;
    const { startDate, endDate } = getDateRange({ start, end, month, year });

    const Order = getOrderModel(req);
    const orders = await Order.find({
      disputedDate: { $gte: startDate, $lt: endDate },
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching disputed-by-date orders:", error);
    res.status(500).json({ message: "Server error", error: error?.message || String(error) });
  }
});

// Add a new order
router.post("/orders", async (req, res) => {
  const firstName = req.query.firstName;
  if (!firstName) {
    return res.status(400).json({ message: "firstName is required" });
  }
  const central = moment().tz("America/Chicago");
  const formattedDateTime = central.format("D MMM, YYYY HH:mm");

  try {
    // Get brand-specific Order model
    const Order = getOrderModel(req);
    
    // Determine orderStatus based on chargedAmount vs soldP if not explicitly provided
    let orderStatus = req.body.orderStatus;
    if (req.body.chargedAmount !== undefined && req.body.soldP !== undefined) {
      const soldPNum = parseFloat(req.body.soldP) || 0;
      const chargedNum = parseFloat(req.body.chargedAmount) || soldPNum;
      // Only override if orderStatus wasn't explicitly set or if it's the default "Placed"
      if (!orderStatus || orderStatus === "Placed") {
        orderStatus = chargedNum === soldPNum ? "Placed" : "Partially charged order";
      }
    } else if (!orderStatus) {
      orderStatus = "Placed"; // default
    }

    const newOrder = new Order({ ...req.body, orderStatus });
    newOrder.orderDate = central.toDate();

    newOrder.orderHistory = newOrder.orderHistory || [];
    newOrder.orderHistory.push(`Order placed by ${firstName} on ${formattedDateTime}`);

    await newOrder.save();
    const io = req.app.get("io");
    io.emit("orderCreated", newOrder);
    // also broadcast for list pages
    broadcastOrder(req, newOrder);
    publish(req, newOrder.orderNo, { type: "ORDER_CREATED" });
    res.status(201).json(newOrder);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Order No already exists" });
    }
    res.status(500).json({ message: "Error creating order", error: error?.message || String(error) });
  }
});

/* GET /orders/statistics - Get order statistics by state, part required, and month */
/* IMPORTANT: This route must be defined BEFORE /:orderNo to avoid route conflicts */
router.get("/statistics", requireAuth, async (req, res) => {
  try {
    // Check if user is Admin or has the authorized email
    // req.user is set by requireAuth middleware
    if (!req.user) {
      return res.status(403).json({ message: "User not authenticated" });
    }

    const isAdmin = req.user.role === "Admin";
    const isAuthorizedEmail = req.user.email?.toLowerCase() === "50starsauto110@gmail.com";
    
    if (!isAdmin && !isAuthorizedEmail) {
      return res.status(403).json({ message: "Access denied. Admin or 50starsauto110@gmail.com only." });
    }

    // Build date range filter (same logic as monthlyOrders)
    const { start, end, month, year } = req.query;
    let dateQuery = {};
    
    if (start && end) {
      // Manual date range (calendar picker)
      const startMoment = moment.tz(start, TZ).startOf("day");
      const endExclusiveMoment = moment.tz(end, TZ).endOf("day").add(1, "millisecond");
      dateQuery = {
        orderDate: {
          $gte: startMoment.toDate(),
          $lt: endExclusiveMoment.toDate(),
        },
      };
    } else if (month && year) {
      // Month + year path
      const monthIndex = isNaN(month)
        ? { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }[month]
        : parseInt(month, 10) - 1;
      const y = parseInt(year, 10);
      if (!isNaN(monthIndex) && !isNaN(y)) {
        const startDateMoment = moment.tz({ year: y, month: monthIndex }, TZ).startOf("month");
        const endExclusiveMoment = startDateMoment.clone().add(1, "month");
        dateQuery = {
          orderDate: {
            $gte: startDateMoment.toDate(),
            $lt: endExclusiveMoment.toDate(),
          },
        };
      }
    } else {
      // Default to current month if no date parameters provided
      const now = moment.tz(TZ);
      const startDateMoment = now.clone().startOf("month");
      const endExclusiveMoment = startDateMoment.clone().add(1, "month");
      dateQuery = {
        orderDate: {
          $gte: startDateMoment.toDate(),
          $lt: endExclusiveMoment.toDate(),
        },
      };
    }

    // Fetch orders with date filter (brand-aware)
    const Order = getOrderModel(req);
    const orders = await Order.find(dateQuery).lean();

    // Helper to extract state from sAddress or use sAddressState
    const extractState = (order) => {
      // First try sAddressState field
      if (order.sAddressState && order.sAddressState.trim()) {
        return order.sAddressState.trim().toUpperCase();
      }
      
      // Fallback: parse from sAddress string
      if (order.sAddress) {
        // Format: "476 Young James Cir,Stockbridge,GA,30281,US"
        const parts = order.sAddress.split(",");
        if (parts.length >= 3) {
          const statePart = parts[2].trim();
          return statePart.toUpperCase();
        }
      }
      
      return "UNKNOWN";
    };

    // Group statistics by STATE only (aggregate across all parts and months)
    const stats = {};

    orders.forEach((order) => {
      const state = extractState(order);
      const orderStatus = order.orderStatus || "";
      const cancellationReason = order.cancellationReason || "";

      // Initialize if needed
      if (!stats[state]) {
        stats[state] = {
          total: 0,
          cancelled: 0,
          disputed: 0,
          fulfilled: 0,
          sameDayCancellation: 0,
        };
      }

      const stateStats = stats[state];

      // Count total
      stateStats.total++;

      // Count by status
      const statusLower = orderStatus.toLowerCase();
      if (statusLower.includes("cancelled") || statusLower === "order cancelled") {
        stateStats.cancelled++;
      }
      if (statusLower.includes("dispute") || statusLower === "dispute") {
        stateStats.disputed++;
      }
      if (statusLower.includes("fulfilled") || statusLower === "order fulfilled") {
        stateStats.fulfilled++;
      }

      // Check for same day cancellation
      if (cancellationReason && cancellationReason.toLowerCase().includes("same day")) {
        stateStats.sameDayCancellation++;
      }
    });

    // Transform to array format - one row per state
    const result = [];
    Object.keys(stats).forEach((state) => {
      result.push({
        state,
        ...stats[state],
      });
    });

    // Sort by total orders (descending - highest first)
    result.sort((a, b) => b.total - a.total);

    res.json(result);
  } catch (err) {
    console.error("Error fetching order statistics:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* GET /orders/makeStatistics - Get statistics grouped by make, part, and state */
/* IMPORTANT: This route must be defined BEFORE /:orderNo to avoid route conflicts */
router.get("/makeStatistics", requireAuth, async (req, res) => {
  try {
    // Check if user is Admin or has the authorized email
    if (!req.user) {
      return res.status(403).json({ message: "User not authenticated" });
    }

    const isAdmin = req.user.role === "Admin";
    const isAuthorizedEmail = req.user.email?.toLowerCase() === "50starsauto110@gmail.com";
    
    if (!isAdmin && !isAuthorizedEmail) {
      return res.status(403).json({ message: "Access denied. Admin or 50starsauto110@gmail.com only." });
    }

    // Build date range filter (same logic as statistics route)
    const { start, end, month, year } = req.query;
    let dateQuery = {};
    
    if (start && end) {
      const startMoment = moment.tz(start, TZ).startOf("day");
      const endExclusiveMoment = moment.tz(end, TZ).endOf("day").add(1, "millisecond");
      dateQuery = {
        orderDate: {
          $gte: startMoment.toDate(),
          $lt: endExclusiveMoment.toDate(),
        },
      };
    } else if (month && year) {
      const monthIndex = isNaN(month)
        ? { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }[month]
        : parseInt(month, 10) - 1;
      const y = parseInt(year, 10);
      if (!isNaN(monthIndex) && !isNaN(y)) {
        const startDateMoment = moment.tz({ year: y, month: monthIndex }, TZ).startOf("month");
        const endExclusiveMoment = startDateMoment.clone().add(1, "month");
        dateQuery = {
          orderDate: {
            $gte: startDateMoment.toDate(),
            $lt: endExclusiveMoment.toDate(),
          },
        };
      }
    } else {
      // Default to current month if no date parameters provided
      const now = moment.tz(TZ);
      const startDateMoment = now.clone().startOf("month");
      const endExclusiveMoment = startDateMoment.clone().add(1, "month");
      dateQuery = {
        orderDate: {
          $gte: startDateMoment.toDate(),
          $lt: endExclusiveMoment.toDate(),
        },
      };
    }

    // Fetch orders with date filter (brand-aware)
    const Order = getOrderModel(req);
    const orders = await Order.find(dateQuery).lean();

    // Helper to extract state from sAddress or use sAddressState
    const extractState = (order) => {
      if (order.sAddressState && order.sAddressState.trim()) {
        return order.sAddressState.trim().toUpperCase();
      }
      if (order.sAddress) {
        const parts = order.sAddress.split(",");
        if (parts.length >= 3) {
          const statePart = parts[2].trim();
          return statePart.toUpperCase();
        }
      }
      return "UNKNOWN";
    };

    // Helper to normalize part names into categories
    const normalizePart = (partName) => {
      if (!partName) return "Others";
      const part = partName.trim().toLowerCase();
      
      // ABS Module category - includes "ABS Module" and "Anti Lock Braking Module (With Pump)"
      if (part.includes("abs module") || 
          part.includes("anti lock braking module") ||
          part.includes("anti-lock braking module") ||
          (part.includes("anti lock") && part.includes("braking") && part.includes("module")) ||
          (part.includes("anti lock") && part.includes("pump"))) {
        return "ABS Module";
      }
      
      // Transmission category - includes "Transmission" and "Transmission Assembly"
      if (part === "transmission" ||
          part.includes("transmission assembly") ||
          (part.includes("transmission") && part.includes("assembly"))) {
        return "Transmission";
      }
      
      // Engine category - includes "Engine" and "Engine Assembly"
      if (part === "engine" ||
          part.includes("engine assembly") ||
          (part.includes("engine") && part.includes("assembly"))) {
        return "Engine";
      }
      
      // Everything else goes to "Others"
      return "Others";
    };

    // Group statistics by make -> part -> state -> model
    const stats = {};

    orders.forEach((order) => {
      const make = (order.make || "UNKNOWN").trim();
      const rawPart = (order.pReq || "UNKNOWN").trim();
      const part = normalizePart(rawPart);
      const state = extractState(order);
      // Only track model if it exists and is not empty
      const modelRaw = order.model ? String(order.model).trim() : "";
      const model = modelRaw && modelRaw !== "" ? modelRaw : null;

      if (!stats[make]) {
        stats[make] = {
          parts: {
            "ABS Module": 0,
            "Transmission": 0,
            "Engine": 0,
            "Others": 0,
          },
          states: {},
          models: {},
        };
      }

      // Count by part category
      if (stats[make].parts[part] !== undefined) {
        stats[make].parts[part]++;
      } else {
        stats[make].parts["Others"]++;
      }

      // Count by state
      if (!stats[make].states[state]) {
        stats[make].states[state] = 0;
      }
      stats[make].states[state]++;

      // Count by model (only if model exists)
      if (model) {
        if (!stats[make].models[model]) {
          stats[make].models[model] = 0;
        }
        stats[make].models[model]++;
      }
    });

    // Transform to array format - one row per make
    const result = [];
    Object.keys(stats).forEach((make) => {
      const makeStats = stats[make];
      
      // Get top 3 states (sorted by count descending)
      const stateEntries = Object.entries(makeStats.states)
        .map(([state, count]) => ({ state, count }))
        .sort((a, b) => b.count - a.count) // Sort descending by count
        .slice(0, 3); // Top 3
      
      // Format as "State1 (count), State2 (count), State3 (count)"
      const top3States = stateEntries
        .map(({ state, count }) => `${state} (${count})`)
        .join(", ") || "—";

      // Get top 3 models (sorted by count descending), excluding "UNKNOWN"
      const modelEntries = Object.entries(makeStats.models)
        .filter(([model]) => model && model.toUpperCase() !== "UNKNOWN" && model.trim() !== "")
        .map(([model, count]) => ({ model, count }))
        .sort((a, b) => b.count - a.count) // Sort descending by count
        .slice(0, 3); // Top 3
      
      // Format as "Model1 (count), Model2 (count), Model3 (count)"
      const top3Models = modelEntries.length > 0
        ? modelEntries.map(({ model, count }) => `${model} (${count})`).join(", ")
        : "—";

      result.push({
        make,
        absModule: makeStats.parts["ABS Module"],
        transmission: makeStats.parts["Transmission"],
        engine: makeStats.parts["Engine"],
        others: makeStats.parts["Others"],
        top3States: top3States || "—",
        top3Models: top3Models || "—",
        total: makeStats.parts["ABS Module"] + 
               makeStats.parts["Transmission"] + 
               makeStats.parts["Engine"] + 
               makeStats.parts["Others"],
      });
    });

    // Sort by total orders (descending - highest first)
    result.sort((a, b) => b.total - a.total);

    res.json(result);
  } catch (err) {
    console.error("Error fetching make statistics:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Update order status (and other fields)
router.put("/:orderNo", async (req, res) => {
  const central = moment().tz("America/Chicago");
  const formattedDateTime = central.format("D MMM, YYYY HH:mm");

  try {
    // Decode and trim the order number to handle URL encoding and whitespace
    const orderNoParam = decodeURIComponent(req.params.orderNo).trim();
    
    // Try exact match first (most common case)
    const Order = getOrderModel(req);
    let order = await Order.findOne({ orderNo: orderNoParam });
    
    // If not found, try case-insensitive search as fallback
    if (!order) {
      order = await Order.findOne({ 
        orderNo: { $regex: new RegExp(`^${orderNoParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
    }
    
    if (!order) return res.status(404).send("Order not found");

    const oldStatus = order.orderStatus;

    // Preserve existing customerApprovedDate if not provided
    if (req.body.customerApprovedDate) {
      order.customerApprovedDate = req.body.customerApprovedDate;
    }

    // Update provided fields (except customerApprovedDate already handled)
    Object.keys(req.body).forEach((key) => {
      if (key !== "customerApprovedDate") {
        order[key] = req.body[key];
      }
    });

    const firstName = cleanFirstName(req.query.firstName || req.user?.firstName || "");
    if (!firstName) {
      return res.status(400).json({ message: "firstName is required" });
    }

    // Add history only if status changed
    if (oldStatus !== order.orderStatus) {
      order.orderHistory = order.orderHistory || [];
      order.orderHistory.push(
        `Order status changed: ${oldStatus || "—"} → ${order.orderStatus} by ${firstName} on ${formattedDateTime}`
      );
    }

    const updatedOrder = await order.save();
    publish(req, updatedOrder.orderNo, {
  type: updatedOrder.orderStatus !== oldStatus ? "STATUS_CHANGED" : "ORDER_UPDATED",
  status: updatedOrder.orderStatus,
});
    broadcastOrder(req, updatedOrder);
    res.json(updatedOrder);
  } catch (err) {
    res.status(400).send(err?.message || String(err));
  }
});

// Get order by orderNo
router.get("/:orderNo", async (req, res) => {
  try {
    // Decode and trim the order number to handle URL encoding and whitespace
    const orderNoParam = decodeURIComponent(req.params.orderNo).trim();
    
    // Try exact match first (most common case)
    const Order = getOrderModel(req);
    let order = await Order.findOne({ orderNo: orderNoParam });
    
    // If not found, try case-insensitive search as fallback
    if (!order) {
      order = await Order.findOne({ 
        orderNo: { $regex: new RegExp(`^${orderNoParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
    }
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    res.json(order);
  } catch (err) {
    console.error("Error fetching order:", err);
    res.status(500).json({ message: "Error fetching order" });
  }
});

// Refund/cancellation updates
router.put("/:orderNo/custRefund", async (req, res) => {
  try {
    const { orderNo } = req.params;

    const {
      custRefundDate,
      custRefundedAmount,
      cancelledDate,
      custRefAmount,
      cancellationReason,
      orderStatus,
      cancelledRefAmount,
    } = req.body;

    const firstName = req.query.firstName;
    if (!firstName) {
      return res.status(400).json({ message: "firstName is required" });
    }

    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Normalize amounts - check for 0 explicitly as it's a valid value (including string "0")
    const amount = cancelledRefAmount !== undefined ? cancelledRefAmount : 
                   (custRefAmount !== undefined ? custRefAmount : 
                   (custRefundedAmount !== undefined ? custRefundedAmount : null));

    const updateFields = {};

    if (custRefundDate) updateFields.custRefundDate = custRefundDate;
    // Always update custRefAmount if provided, even if 0 or "0"
    if (amount !== null && amount !== undefined) {
      updateFields.custRefAmount = amount;
    }

    if (cancelledDate) updateFields.cancelledDate = cancelledDate;
    // Always update cancellationReason if provided (even if empty string, to allow clearing)
    if (cancellationReason !== undefined) updateFields.cancellationReason = cancellationReason;

    let nextStatus = orderStatus;
    if (!nextStatus && cancelledDate) nextStatus = "Order Cancelled";
    if (nextStatus) updateFields.orderStatus = nextStatus;

    const formattedDateTime = moment().tz("America/Chicago").format("D MMM, YYYY HH:mm");

    order.orderHistory = order.orderHistory || [];

    // Track if status changed
    const oldStatus = order.orderStatus;
    const statusChanged = nextStatus && oldStatus !== nextStatus;

    // Add history for status change
    if (statusChanged) {
      let historyEntry = `Order status changed: ${oldStatus || "—"} → ${nextStatus} by ${firstName} on ${formattedDateTime}`;
      
      // Add custRefAmount if status is "Order Cancelled" or "Refunded" and amount is provided (including 0 or "0")
      // Check both the request body amount and the order's existing custRefAmount
      const finalAmount = amount !== null && amount !== undefined ? amount : 
                         (order.custRefAmount !== null && order.custRefAmount !== undefined ? order.custRefAmount : null);
      
      if ((nextStatus === "Order Cancelled" || nextStatus === "Refunded") && finalAmount !== null && finalAmount !== undefined) {
        const amountValue = parseFloat(finalAmount) || 0;
        historyEntry += ` (Refund Amount: $${amountValue.toFixed(2)})`;
      }
      
      order.orderHistory.push(historyEntry);
    }

    // Add specific history entries for refunded/cancelled with details
    if (custRefundDate) {
      const finalAmount = amount !== null && amount !== undefined ? amount : 
                         (order.custRefAmount !== null && order.custRefAmount !== undefined ? order.custRefAmount : null);
      if (finalAmount !== null && finalAmount !== undefined) {
        const amountValue = parseFloat(finalAmount) || 0;
        order.orderHistory.push(`Order status changed to Refunded by ${firstName} on ${formattedDateTime} (Refund Amount: $${amountValue.toFixed(2)})`);
      } else {
        order.orderHistory.push(`Order status changed to Refunded by ${firstName} on ${formattedDateTime}`);
      }
    }

    if (cancelledDate && cancellationReason) {
      const finalAmount = amount !== null && amount !== undefined ? amount : 
                         (order.custRefAmount !== null && order.custRefAmount !== undefined ? order.custRefAmount : null);
      if (finalAmount !== null && finalAmount !== undefined) {
        const amountValue = parseFloat(finalAmount) || 0;
        order.orderHistory.push(`Order Cancelled by ${firstName} on ${formattedDateTime} (Refund Amount: $${amountValue.toFixed(2)})`);
      } else {
        order.orderHistory.push(`Order Cancelled by ${firstName} on ${formattedDateTime}`);
      }
    }

    Object.assign(order, updateFields);
    await order.save({ validateBeforeSave: false });
      publish(req, orderNo, {
      type: "REFUND_SAVED",
      status: order.orderStatus,
    });
    broadcastOrder(req, order);
    res.json(order);
  } catch (error) {
    console.error("Error updating refund/cancellation:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * One call: append a yard entry and (optionally) update orderStatus.
 * Frontend can send { orderStatus: "Yard Processing" } in the same body.
 */
router.post("/:orderNo/additionalInfo", async (req, res) => {
  try {
   const when = getWhen();       // formatted date for display
   const isoNow = getWhen("iso");

    const { orderNo } = req.params;
    const firstName = cleanFirstName(req.query.firstName || req.query.firstname || "");

    const {
      orderStatus,
      yardName,
      agentName,
      yardRating,
      phone,
      altPhone,
      ext,
      email,
      street,
      city,
      state,
      zipcode,
      address,
      country,
      partPrice,
      ownShipping,
      yardShipping,
      shippingDetails: shippingDetailsRaw,
      others,
      faxNo,
      expShipDate,
      warranty,
      yardWarrantyField,
      stockNo,
      trackingNo,
      eta,
      deliveredDate,
      status = "Yard located",
    } = req.body || {};

    const ownSet  = ownShipping !== undefined && String(ownShipping).trim() !== "";
    const yardSet = yardShipping !== undefined && String(yardShipping).trim() !== "";
    if (ownSet && yardSet) {
      return res.status(400).json({ message: "Provide either ownShipping or yardShipping, not both." });
    }

    let shippingDetails = shippingDetailsRaw;
    if (!shippingDetails) {
      shippingDetails = [
        ownSet  ? `Own shipping: ${ownShipping}`   : "",
        yardSet ? `Yard shipping: ${yardShipping}` : "",
      ].filter(Boolean).join(" | ");
    }

    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.additionalInfo = order.additionalInfo || [];
    const nextIndex = order.additionalInfo.length + 1;

    const yardEntry = {
      yardName, agentName, yardRating, phone, altPhone, ext, email,
      street, city, state, zipcode,
      address: address || [street, city, state, zipcode].filter(Boolean).join(" "),
      country, partPrice,
      ownShipping:  ownSet  ? ownShipping  : undefined,
      yardShipping: yardSet ? yardShipping : undefined,
      shippingDetails, others, faxNo, expShipDate, warranty, yardWarrantyField, stockNo,
      trackingNo, eta, deliveredDate, status,
    };

    order.additionalInfo.push(yardEntry);

    const pp    = partPrice ?? "";
    const yname = yardName  ?? "";
    const shipTxt =
      shippingDetails ||
      (ownSet ? `Own shipping: ${ownShipping}` : (yardSet ? `Yard shipping: ${yardShipping}` : ""));
    const othTxt = (others ?? "") === "" ? "" : String(others);

    order.orderHistory = order.orderHistory || [];
    order.orderHistory.push(
      `Yard ${nextIndex} Located by ${firstName} on ${when}`
    );
// Yard Name: ${yname} PP: ${pp} Shipping: ${shipTxt} Others: ${othTxt}
    if (orderStatus && String(orderStatus).trim() !== "") {
      const prevStatus = order.orderStatus || "";
      if (prevStatus !== orderStatus) {
        order.orderStatus = orderStatus;
        order.orderHistory.push(
          `Order status changed: ${prevStatus || "—"} → ${orderStatus}   by ${firstName} on ${when}`
        );
      }
    }

    await order.save({ validateBeforeSave: false });
    publish(req, orderNo, {
      type: "YARD_ADDED",
      yardIndex: order.additionalInfo.length, 
      status: order.orderStatus,
    });
    broadcastOrder(req, order);
    res.json(order);
  } catch (error) {
    console.error("POST /orders/:orderNo/additionalInfo failed", error);
    res.status(500).json({ message: "Server error", error: error?.message || String(error) });
  }
});
const ORDER_STATUS_MAP = {
  "Yard located": "Yard Processing",
  "Yard PO Sent": "Yard Processing",
  "Label created": "Yard Processing",
  "PO cancelled": "Yard Processing",
  "Part shipped": "In Transit",
  "Part delivered": "Order Fulfilled",
  Escalation: "Escalation",
};

/* ---------------- PUT /orders/:orderNo/additionalInfo/:index ----------------
   (index is 1-based)
----------------------------------------------------------------------------- */
router.put(
  "/:orderNo/additionalInfo/:index",
  upload.single("voidLabelScreenshot"),
  async (req, res) => {
  console.log("REQ BODY:", JSON.stringify(req.body, null, 2));
  try {
    // Decode and trim the order number to handle URL encoding and whitespace
    const orderNo = decodeURIComponent(req.params.orderNo).trim();
    const idx1 = parseInt(req.params.index, 10);
    const idx0 = idx1 - 1;

    const firstName = cleanFirstName(
      req.query.firstName ||
      req.query.firstname ||
      "System"
    );

    const when = getWhen();     
    const isoNow = getWhen("iso");

    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!order.additionalInfo?.[idx0])
      return res.status(404).json({ message: `Yard ${idx1} not found` });

    const subdoc = order.additionalInfo[idx0];
    order.orderHistory = order.orderHistory || [];
    if (!Array.isArray(subdoc.notes)) subdoc.notes = [];

    /* ---------------- ALLOWED FIELDS ---------------- */
    const allowed = [
      "yardName",
      "agentName",
      "yardRating",
      "phone",
      "altPhone",
      "ext",
      "email",
      "street",
      "city",
      "state",
      "zipcode",
      "country",
      "partPrice",
      "status",
      "ownShipping",
      "yardShipping",
      "shippingDetails",
      "others",
      "faxNo",
      "expShipDate",
      "warranty",
      "stockNo",
    "trackingNo",
    "eta",
    "deliveredDate",
    "shipperName",
    "trackingLink",
      "paymentStatus",
      "refundedAmount",
      "refundStatus",
      "escTicked",
      "escalationCause",
      "escalationProcess",
    "escalationDate",
    "custReason",
    "customerShippingMethodReplacement",
    "customerShipperReplacement",
    "customerTrackingNumberReplacement",
    "customerETAReplacement",
    "custOwnShipReplacement",
    "custreplacementDelivery",
    "yardShippingStatus",
    "yardShippingMethod",
    "yardShipper",
    "yardTrackingNumber",
    "yardOwnShipping",
    "yardTrackingETA",
    "yardTrackingLink",
    "customerShippingMethodReturn",
    "custretPartETA",
    "customerShipperReturn",
    "custOwnShippingReturn",
    "returnTrackingCust",
    "custReturnDelivery",
    "inTransitpartCustDate",
    "repPartCustDeliveredDate",
    "inTransitpartYardDate",
    "yardDeliveredDate",
    "inTransitReturnDate",
    "returnDeliveredDate",
    "custShipToRet",
    "custShipToRep",
    "escRetTrackingDate",
    "escRepCustTrackingDate",
    "escRepYardTrackingDate",
    "escReturnTrackingHistory",
    "escReturnETAHistory",
    "escReturnShipperNameHistory",
    "escReturnBOLhistory",
    "escRepTrackingHistoryCust",
    "escRepETAHistoryCust",
    "escRepShipperNameHistoryCust",
    "escrepBOLhistoryCust",
    "escRepTrackingHistoryYard",
    "escRepETAHistoryYard",
    "escRepShipperNameHistoryYard",
    "escrepBOLhistoryYard",
    ];

    const patch = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) patch[k] = req.body[k];
    }

    /* ---------------------- VOID LABEL ---------------------- */
    if (req.body.voidLabel) {
      // Screenshot is mandatory for voiding
      if (!req.file) {
        return res
          .status(400)
          .json({ message: "Screenshot is required to void the label." });
      }

      // Upload screenshot to Drive first; only proceed to void if this succeeds
      try {
        const mimeType = req.file.mimetype || "image/png";
        const safeOrderNo = orderNo.replace(/[^\w\-]/g, "_");

        const s3Url = await uploadVoidLabelScreenshotToS3(
          req.file.buffer,
          mimeType,
          safeOrderNo
        );

        subdoc.voidLabelScreenshot = s3Url;
      } catch (uploadErr) {
        console.error(
          "Error uploading void label screenshot to S3:",
          uploadErr
        );
        return res.status(500).json({
          message:
            "Failed to upload screenshot. Label was not voided. Please try again.",
        });
      }

      const removed = [];
      const labelFields = [
        "trackingNo",
        "eta",
        "shipperName",
        "trackingLink",
        "shippingDetails",
        "ownShipping",
      ];

      labelFields.forEach((f) => {
        if (subdoc[f] && String(subdoc[f]).trim() !== "") {
          removed.push(`${f}: ${subdoc[f]}`);
          subdoc[f] = "";
        }
      });

      subdoc.status = "Yard PO Sent";
      subdoc.labelVoidedDate = isoNow;
      order.orderStatus = ORDER_STATUS_MAP["Yard PO Sent"];

      const summary = removed.length
        ? `Label voided. Cleared → ${removed.join(", ")}.`
        : "Label voided. (No label details found)";
      const noteAdded = pushUniqueNote(subdoc.notes, formatNote(firstName, when, summary));
      if (noteAdded) {
        publish(req, orderNo, { type: "YARD_NOTE_ADDED", yardIndex: idx1 });
      }

      order.orderHistory.push(`Yard ${idx1} label voided by ${firstName} on ${when}`);

      order.markModified(`additionalInfo.${idx0}`);
      await order.save();
      publish(req, orderNo, {
        type: "YARD_UPDATED",
        yardIndex: idx1,         
        status: order.orderStatus,
      });
      broadcastOrder(req, order);
      return res.json({ message: "Label voided", order });
    }

    /* ------------------ NORMAL UPDATE FLOW ------------------ */
    const before = subdoc.toObject({
      depopulate: true,
      virtuals: false,
      getters: false,
    });
    subdoc.set(patch);
    const after = subdoc.toObject({
      depopulate: true,
      virtuals: false,
      getters: false,
    });

    sanitizeYardDateFields(subdoc);

    const changed = [];
    for (const k of allowed) {
      const a = before?.[k];
      const b = after?.[k];
      if (String(a ?? "") !== String(b ?? "")) changed.push(k);
    }

    const newStatus = patch.status || subdoc.status || "Unknown";

    /* ---------------- STATUS → orderHistory ---------------- */
    if (changed.includes("status")) {
      order.orderHistory.push(
        `Yard ${idx1} status updated to ${newStatus} by ${firstName} on ${when}`
      );

      const mapped = ORDER_STATUS_MAP[newStatus] || order.orderStatus;
      order.orderStatus = req.body.orderStatus || mapped;
    } else if (req.body.orderStatus) {
      order.orderStatus = req.body.orderStatus;
    }

    /* ---------------- NON-STATUS FIELD NOTES ---------------- */
    const nonStatusChanges = changed.filter((f) => f !== "status");
    if (nonStatusChanges.length > 0) {
      const grouped = nonStatusChanges.reduce((acc, field) => {
        const section = categorizeField(field);
        const oldVal = before?.[field] ?? "";
        const newVal = after?.[field] ?? "";
        const label = toHumanLabel(field);
        const cleanOld =
          oldVal === "" || oldVal === null || oldVal === undefined
            ? "—"
            : String(oldVal).trim();
        const cleanNew =
          newVal === "" || newVal === null || newVal === undefined
            ? "—"
            : String(newVal).trim();
        acc[section] = acc[section] || [];
        // If there was no previous value, just show the new value. Otherwise show old → new
        if (cleanOld === "—") {
          acc[section].push(`${label}: ${cleanNew}`);
        } else {
          acc[section].push(`${label}: ${cleanOld} → ${cleanNew}`);
        }
        return acc;
      }, {});

      const orderedSections = ["Replacement (Part from customer)", "Replacement (Part from yard)", "Return (Part from customer)", "General"];
      let noteAdded = false;
      orderedSections.forEach((section) => {
        if (!grouped[section]) return;
        const header =
          section === "General" ? "Updated" : `Updated • Escalation — ${section}`;
        const messageLines = [header, ...grouped[section].map((entry) => `  • ${entry}`)];
        const message = messageLines.join("\n");
        const added = pushUniqueNote(
          subdoc.notes,
          formatNote(firstName, when, message)
        );
        if (added) {
          noteAdded = true;
        }
      });
      if (noteAdded) {
        publish(req, orderNo, { type: "YARD_NOTE_ADDED", yardIndex: idx1 });
      }
    }

    /* ---------------- CLEARED FIELDS (PO Cancelled) ---------------- */
    const clearedFields = req.body?.updatedYardData?._clearedFields;
    if (clearedFields && typeof clearedFields === "object") {
      const clearedEntries = Object.entries(clearedFields)
        .map(([key, val]) => `${toHumanLabel(key)}: "${val || "—"}"`)
        .join("; ");
      const noteAdded = pushUniqueNote(
        subdoc.notes,
        formatNote(firstName, when, `PO Cancelled. Cleared → ${clearedEntries}`)
      );
      if (noteAdded) {
        publish(req, orderNo, { type: "YARD_NOTE_ADDED", yardIndex: idx1 });
      }
    }

    /* ---------------- ESCALATION ---------------- */
    if (newStatus === "Escalation" && subdoc.escalationCause) {
      const lastMatch = subdoc.notes
        .slice()
        .reverse()
        .find((entry) => entry.includes("Escalation Reason:"));
      const alreadyRecorded =
        lastMatch &&
        lastMatch.trim().endsWith(`Escalation Reason: "${subdoc.escalationCause}"`);
      if (!alreadyRecorded) {
        const noteAdded = pushUniqueNote(
          subdoc.notes,
          formatNote(firstName, when, `Escalation Reason: "${subdoc.escalationCause}"`)
        );
        if (noteAdded) {
          publish(req, orderNo, { type: "YARD_NOTE_ADDED", yardIndex: idx1 });
        }
      }
    }

    /* ---------------- TRACKING SNAPSHOT ---------------- */
    // Removed: Tracking snapshot comment is redundant - the "Updated" comment already shows tracking info in a cleaner format
    // if (["Label created", "Part shipped"].includes(newStatus)) {
    //   const trackAudit = [
    //     `Tracking No: ${subdoc.trackingNo || "—"}`,
    //     `ETA: ${subdoc.eta || "—"}`,
    //     `Shipper: ${subdoc.shipperName || "—"}`,
    //     `Tracking Link: ${subdoc.trackingLink || "—"}`,
    //   ].join("; ");
    //   const noteAdded = pushUniqueNote(
    //     subdoc.notes,
    //     formatNote(firstName, when, `Tracking snapshot → ${trackAudit}`)
    //   );
    //   if (noteAdded) {
    //     publish(req, orderNo, { type: "YARD_NOTE_ADDED", yardIndex: idx1 });
    //   }
    // }

    /* ---------------- SEND TRACKING EMAIL ---------------- */
    // Only send email if frontend hasn't already sent it (skipEmail flag)
    const shouldSkipEmail = req.body.skipEmail === true || req.body.skipEmail === "true";
    if (changed.includes("status") && newStatus === "Part shipped" && !shouldSkipEmail) {
      console.log("[orders] Sending tracking email from backend (skipEmail was false/undefined)");
      try {
        const API_BASE =
          process.env.PUBLIC_API_BASE_URL ||
          `http://localhost:${process.env.PORT || 5000}`;
        const response = await fetch(
          `${API_BASE}/emails/orders/sendTrackingInfo/${encodeURIComponent(orderNo)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              trackingNo: subdoc.trackingNo,
              eta: subdoc.eta,
              shipperName: subdoc.shipperName,
              link: subdoc.trackingLink,
              firstName,
            }),
          }
        );

        if (response.ok) {
          order.orderHistory.push(
            `Yard ${idx1} marked as Part shipped (tracking email sent by ${firstName}) on ${when}`
          );
        } else {
          const txt = await response.text().catch(() => "");
          order.orderHistory.push(
            `Failed to send tracking email for Yard ${idx1}: ${txt || response.status}`
          );
        }
      } catch (err) {
        console.error("Tracking email error:", err);
        order.orderHistory.push(
          `Error sending tracking email (Yard ${idx1}): ${err.message}`
        );
      }
    }

    /* ---------------- SEND DELIVERY EMAIL ---------------- */
    // Only send email if frontend hasn't already sent it (skipEmail flag)
    const shouldSkipDeliveryEmail = req.body.skipEmail === true || req.body.skipEmail === "true";
    if (changed.includes("status") && newStatus === "Part delivered" && !shouldSkipDeliveryEmail) {
      console.log("[orders] Sending delivery email from backend (skipEmail was false/undefined)");
      try {
        const API_BASE =
          process.env.PUBLIC_API_BASE_URL ||
          `http://localhost:${process.env.PORT || 5000}`;
        const response = await fetch(
          `${API_BASE}/emails/customer-delivered/${encodeURIComponent(orderNo)}?yardIndex=${idx1}&firstName=${encodeURIComponent(firstName)}`,
          { method: "POST" }
        );

        if (response.ok) {
          order.orderHistory.push(
            `Yard ${idx1} marked as Part delivered (delivery email sent by ${firstName}) on ${when}`
          );
        } else {
          const txt = await response.text().catch(() => "");
          order.orderHistory.push(
            `Failed to send delivery email for Yard ${idx1}: ${txt || response.status}`
          );
        }
      } catch (err) {
        console.error("Delivery email error:", err);
        order.orderHistory.push(
          `Error sending delivery email (Yard ${idx1}): ${err.message}`
        );
      }
    }

    order.additionalInfo.forEach(sanitizeYardDateFields);
    order.markModified(`additionalInfo.${idx0}`);
    await order.save();
    publish(req, orderNo, {
      type: changed.includes("status") ? "STATUS_CHANGED" : "YARD_UPDATED",
      yardIndex: idx1,          
      status: order.orderStatus,
      yardStatus: newStatus, // Include the yard status for email loading detection
    });
    res.json(order);
  } catch (err) {
    console.error("PUT yard edit failed", err);
    res.status(500).json({ message: "Server error", error: err.message || err });
  }
});

/* ---------------- CANCEL SHIPMENT ---------------- */
router.put("/:orderNo/cancelShipment", async (req, res) => {
  try {
    const orderNo = req.params.orderNo;
    const idx1 = parseInt(req.body?.yardIndex, 10);
    if (!idx1 || Number.isNaN(idx1)) {
      return res.status(400).json({ message: "yardIndex (1-based) is required" });
    }
    const idx0 = idx1 - 1;

    const firstName = (
      req.query.firstName ||
      req.query.firstname ||
      req.body?.firstName ||
      "System"
    ).toString().trim();

    const when = getWhen();       // formatted date for display
    const isoNow = getWhen("iso");

    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!order.additionalInfo?.[idx0]) {
      return res.status(404).json({ message: `Yard ${idx1} not found` });
    }

    const subdoc = order.additionalInfo[idx0];
    order.orderHistory = order.orderHistory || [];
    if (!Array.isArray(subdoc.notes)) subdoc.notes = [];

    const removed = [];
    const labelFields = [
      "trackingNo",
      "eta",
      "shipperName",
      "trackingLink",
      "shippingDetails",
      "ownShipping",
    ];
    labelFields.forEach((f) => {
      if (subdoc[f] && String(subdoc[f]).trim() !== "") {
        removed.push(`${f}: ${subdoc[f]}`);
        subdoc[f] = "";
      }
    });

    const prevStatus = subdoc.status || "Unknown";
    subdoc.status = "Yard PO Sent";
    subdoc.shipmentCancelledDate = isoNow;

    order.orderStatus = ORDER_STATUS_MAP["Yard PO Sent"];

    const summary = removed.length
      ? `Shipment cancelled. Cleared → ${removed.join(", ")}.`
      : "Shipment cancelled. (No tracking details found)";

    const noteAdded = pushUniqueNote(subdoc.notes, formatNote(firstName, when, summary));
    if (noteAdded) {
      publish(req, orderNo, { type: "YARD_NOTE_ADDED", yardIndex: idx1 });
    }
    order.orderHistory.push(
      `Yard ${idx1} shipment cancelled (was "${prevStatus}") by ${firstName} on ${when}`
    );

    order.markModified(`additionalInfo.${idx0}`);
    await order.save();
    publish(req, orderNo, {
      type: "YARD_UPDATED",
      yardIndex: idx1,
      status: order.orderStatus,
    });
    broadcastOrder(req, order);
    res.json({ message: "Shipment cancelled", order });
  } catch (err) {
    console.error("PUT cancelShipment failed", err);
    res.status(500).json({ message: "Server error", error: err.message || err });
  }
});
// edit yard details
router.patch("/:orderNo/additionalInfo/:index", async (req, res) => {
  const FIELD_LABELS = {
  yardName: "Yard Name",
  agentName: "Agent Name",
  yardRating: "Yard Rating",
  phone: "Phone",
  altPhone: "Alt Phone",
  ext: "Extension",
  email: "Email",
  street: "Street",
  city: "City",
  state: "State",
  zipcode: "Zip Code",
  country: "Country",
  partPrice: "Part Price",
  status: "Status",
  ownShipping: "Own Shipping",
  yardShipping: "Yard Shipping",
  others: "Other Charges",
  faxNo: "Fax No.",
  expShipDate: "Expected Ship Date",
  warranty: "Warranty",
  yardWarrantyField: "Warranty Unit",
  stockNo: "Stock No.",
  trackingNo: "Tracking No.",
  eta: "ETA",
  address: "Address",
  shippingDetails: "Shipping Details",
  };
  try {
    const { orderNo, index } = req.params;
    const { firstName } = req.query;
    const updates = req.body;

    // Get brand-aware Order model
    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const i = Number(index) - 1;
    const yard = order.additionalInfo?.[i];
    if (!yard) return res.status(400).json({ message: "Invalid yard index" });

    const normalize = (v) => {
      if (v === undefined || v === null || v === "") return "";
      if (typeof v === "string") return v.trim();
      if (typeof v === "number" && isNaN(v)) return "";
      return v;
    };

    const changes = [];
    const prevOwnShipping = normalize(yard.ownShipping);
    const prevYardShipping = normalize(yard.yardShipping);
    const prevShippingDetails = yard.shippingDetails || "";

    // 3️Detect changed fields
    for (const [key, newValRaw] of Object.entries(updates)) {
      if (["address", "shippingDetails"].includes(key)) continue; // skip derived
      const newVal = normalize(newValRaw);
      const oldVal = normalize(yard[key]);

      // Skip false empties or same numbers
      if (newVal === "" && oldVal === "") continue;
      if (!isNaN(Number(newVal)) && !isNaN(Number(oldVal)) && Number(newVal) === Number(oldVal)) continue;
      if (newVal === oldVal) continue;

      // Apply change
      yard[key] = newVal;
      const label = FIELD_LABELS[key] || key;
      changes.push(`${label} ${oldVal || "—"} → ${newVal || "—"}`);
    }

    // 4️ Only rebuild address if components changed
    const addressChanged = ["street", "city", "state", "zipcode"].some(
      (f) => updates[f] !== undefined && normalize(updates[f]) !== normalize(yard[f])
    );
    if (addressChanged) {
      yard.address = `${yard.street || ""} ${yard.city || ""} ${yard.state || ""} ${yard.zipcode || ""}`.trim();
    }

    // 5️ Only rebuild shippingDetails if shipping actually changed
    const normalizedOwnUpdate =
      updates.ownShipping !== undefined ? normalize(updates.ownShipping) : null;
    const normalizedYardUpdate =
      updates.yardShipping !== undefined ? normalize(updates.yardShipping) : null;
    const hasOwnShippingChange =
      updates.ownShipping !== undefined && normalizedOwnUpdate !== prevOwnShipping;
    const hasYardShippingChange =
      updates.yardShipping !== undefined && normalizedYardUpdate !== prevYardShipping;

    if (hasOwnShippingChange || hasYardShippingChange) {
      if (hasOwnShippingChange && normalizedOwnUpdate) {
        yard.shippingDetails = `Own shipping: ${normalizedOwnUpdate}`;
        yard.ownShipping = normalizedOwnUpdate;
        yard.yardShipping = "";
      } else if (hasYardShippingChange && normalizedYardUpdate) {
        yard.shippingDetails = `Yard shipping: ${normalizedYardUpdate}`;
        yard.yardShipping = normalizedYardUpdate;
        yard.ownShipping = "";
      } else {
        yard.shippingDetails = "";
        yard.ownShipping = "";
        yard.yardShipping = "";
      }
      const newShippingDetails = yard.shippingDetails || "";
      if (newShippingDetails !== prevShippingDetails) {
        changes.push(
          `Shipping Details ${prevShippingDetails || "—"} → ${
            newShippingDetails || "—"
          }`
        );
      }
    } else if (
      updates.shippingDetails !== undefined &&
      typeof updates.shippingDetails === "string"
    ) {
      const trimmed = updates.shippingDetails.trim();
      
      // If shippingDetails is empty and yardShipping is provided separately, use it
      if (!trimmed && updates.yardShipping !== undefined) {
        const normalizedYard = normalize(updates.yardShipping);
        if (normalizedYard) {
          yard.shippingDetails = `Yard shipping: ${normalizedYard}`;
          yard.yardShipping = normalizedYard;
          yard.ownShipping = "";
        } else {
          yard.shippingDetails = "";
          yard.ownShipping = "";
          yard.yardShipping = "";
        }
      } else if (!trimmed && updates.ownShipping !== undefined) {
        const normalizedOwn = normalize(updates.ownShipping);
        if (normalizedOwn) {
          yard.shippingDetails = `Own shipping: ${normalizedOwn}`;
          yard.ownShipping = normalizedOwn;
          yard.yardShipping = "";
        } else {
          yard.shippingDetails = "";
          yard.ownShipping = "";
          yard.yardShipping = "";
        }
      } else {
        // Process shippingDetails string as before
        yard.shippingDetails = trimmed;
        if (/^Own shipping:/i.test(trimmed)) {
          const val = trimmed.replace(/^Own shipping:\s*/i, "");
          yard.ownShipping = val;
          yard.yardShipping = "";
        } else if (/^Yard shipping:/i.test(trimmed)) {
          const val = trimmed.replace(/^Yard shipping:\s*/i, "");
          yard.yardShipping = val;
          yard.ownShipping = "";
        } else {
          yard.ownShipping = "";
          yard.yardShipping = "";
        }
      }
      const newShippingDetails = yard.shippingDetails || "";
      if (newShippingDetails !== prevShippingDetails) {
        changes.push(
          `Shipping Details ${prevShippingDetails || "—"} → ${
            newShippingDetails || "—"
          }`
        );
      }
    } else if (updates.yardShipping !== undefined || updates.ownShipping !== undefined) {
      // Handle case where only yardShipping or ownShipping is provided without shippingDetails
      if (updates.yardShipping !== undefined) {
        const normalizedYard = normalize(updates.yardShipping);
        if (normalizedYard) {
          yard.shippingDetails = `Yard shipping: ${normalizedYard}`;
          yard.yardShipping = normalizedYard;
          yard.ownShipping = "";
        } else {
          yard.shippingDetails = "";
          yard.ownShipping = "";
          yard.yardShipping = "";
        }
      } else if (updates.ownShipping !== undefined) {
        const normalizedOwn = normalize(updates.ownShipping);
        if (normalizedOwn) {
          yard.shippingDetails = `Own shipping: ${normalizedOwn}`;
          yard.ownShipping = normalizedOwn;
          yard.yardShipping = "";
        } else {
          yard.shippingDetails = "";
          yard.ownShipping = "";
          yard.yardShipping = "";
        }
      }
      const newShippingDetails = yard.shippingDetails || "";
      if (newShippingDetails !== prevShippingDetails) {
        changes.push(
          `Shipping Details ${prevShippingDetails || "—"} → ${
            newShippingDetails || "—"
          }`
        );
      }
    }

    // 5.5️ Ensure mutual exclusivity - only one shipping type should exist
    // This is a safety check to prevent both ownShipping and yardShipping from being set
    // Priority: shippingDetails is the source of truth
    const shippingDetailsStr = yard.shippingDetails || "";
    const hasOwnInDetails = /own shipping:/i.test(shippingDetailsStr);
    const hasYardInDetails = /yard shipping:/i.test(shippingDetailsStr);
    
    if (hasOwnInDetails) {
      // shippingDetails says "Own shipping", so clear yardShipping and ensure ownShipping matches
      yard.yardShipping = "";
      if (!yard.ownShipping) {
        // Extract value from shippingDetails if ownShipping is not set
        const match = shippingDetailsStr.match(/own shipping:\s*([^\|]+)/i);
        if (match) yard.ownShipping = match[1].trim();
      }
    } else if (hasYardInDetails) {
      // shippingDetails says "Yard shipping", so clear ownShipping and ensure yardShipping matches
      yard.ownShipping = "";
      if (!yard.yardShipping) {
        // Extract value from shippingDetails if yardShipping is not set
        const match = shippingDetailsStr.match(/yard shipping:\s*([^\|]+)/i);
        if (match) yard.yardShipping = match[1].trim();
      }
    } else {
      // shippingDetails doesn't specify type, sync based on which field is set
      if (yard.ownShipping && yard.yardShipping) {
        // Both set but shippingDetails doesn't indicate - clear both
        yard.ownShipping = "";
        yard.yardShipping = "";
        yard.shippingDetails = "";
      } else if (yard.ownShipping && !yard.yardShipping) {
        // Only ownShipping is set, ensure shippingDetails matches
        yard.shippingDetails = `Own shipping: ${yard.ownShipping}`;
      } else if (yard.yardShipping && !yard.ownShipping) {
        // Only yardShipping is set, ensure shippingDetails matches
        yard.shippingDetails = `Yard shipping: ${yard.yardShipping}`;
      } else {
        // Both cleared, ensure shippingDetails is also cleared
        yard.shippingDetails = "";
      }
    }

    // 6️ Log note only if something changed
    if (changes.length > 0) {
      if (!Array.isArray(yard.notes)) yard.notes = [];

      const when = getWhen();       // formatted date for display
     const isoNow = getWhen("iso");

      const noteLines = [`Updated`, ...changes.map((entry) => `  • ${entry}`)];
      const noteText = formatNote(firstName, when, noteLines.join("\n"));
      const added = pushUniqueNote(yard.notes, noteText);
      if (added) {
        publish(req, orderNo, { type: "YARD_NOTE_ADDED", yardIndex: i + 1 });
      }
    }
    await order.save();
    // Use the same brand-aware Order model (already defined above)
    const updatedOrder = await Order.findOne({ orderNo }).lean();
    publish(req, orderNo, {
      type: "YARD_UPDATED",
      yardIndex: i + 1,
      status: order.orderStatus,
    });
    broadcastOrder(req, updatedOrder);
    res.json({
      message:
        changes.length > 0
          ? `Yard ${i + 1} updated successfully`
          : "No meaningful changes detected",
      changes,
      order: updatedOrder,
    });
  } catch (err) {
    console.error("PATCH /orders/:orderNo/additionalInfo/:index error:", err);
    res.status(500).json({ message: "Server error while updating yard" });
  }
});
/* ---------------------------------------------------------------------
   PATCH /orders/:orderNo/additionalInfo/:yardIndex/paymentStatus
   - Partial update for payment/card charged info
------------------------------------------------------------------------ */
router.patch("/:orderNo/additionalInfo/:yardIndex/paymentStatus", async (req, res) => {
  console.log("REQ BODY:", JSON.stringify(req.body, null, 2));
  try {
    const { orderNo, yardIndex } = req.params;
    const idx0 = Number(yardIndex) - 1;
    const firstName = req.query.firstName;
    if (!firstName) {
      return res.status(400).json({ message: "firstName is required" });
    }
    const when = getWhen();
    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!order.additionalInfo?.[idx0]) {
      return res.status(400).json({ message: `Invalid yard index: ${yardIndex}` });
    }

    const yard = order.additionalInfo[idx0];
    const { paymentStatus, cardChargedDate } = req.body || {};

    const normalize = (v) => (v === undefined || v === null || v === "" ? null : v);

    const patch = {};
    if (normalize(paymentStatus)) patch.paymentStatus = paymentStatus;
    const normalizedCardChargedDate = normalize(cardChargedDate);
    if (normalizedCardChargedDate !== null) patch.cardChargedDate = normalizedCardChargedDate;
    if (patch.cardChargedDate !== undefined) {
      const coerced = coerceDate(patch.cardChargedDate);
      if (coerced || patch.cardChargedDate === null) {
        patch.cardChargedDate = coerced;
      } else {
        return res.status(400).json({ message: "Invalid cardChargedDate format" });
      }
    }

    const changes = [];
    for (const [key, newVal] of Object.entries(patch)) {
      const oldVal = yard[key] ?? null;
      if (newVal !== oldVal) {
        yard[key] = newVal;
        changes.push(`${key}: ${oldVal || "—"} → ${newVal}`);
      }
    }

    if (changes.length > 0) {
      if (Array.isArray(order.additionalInfo)) {
        order.additionalInfo.forEach(sanitizeYardDateFields);
      }
      if (!Array.isArray(order.orderHistory)) {
        order.orderHistory = [];
      }
      order.orderHistory.push(
        `Yard ${idx0 + 1} payment details updated (${changes.join("; ")}) by ${firstName} on ${when}`
      );
      order.markModified("orderHistory");
      order.markModified(`additionalInfo.${idx0}`);
      await order.save();
      publish(req, orderNo, {
        type: "YARD_UPDATED",
        yardIndex: idx0 + 1,
        status: order.orderStatus,
      });
      broadcastOrder(req, order);
      return res.json({ message: "Payment status updated", changes, order });
    }

    res.json({ message: "No meaningful changes detected" });
  } catch (err) {
    console.error("PATCH paymentStatus failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
/* ---------------------------------------------------------------------
   PATCH /orders/:orderNo/additionalInfo/:yardIndex/refundStatus
   - Partial update for refund-related info
------------------------------------------------------------------------ */
router.patch("/:orderNo/additionalInfo/:yardIndex/refundStatus", async (req, res) => {
  try {
    const { orderNo, yardIndex } = req.params;
    const idx0 = Number(yardIndex) - 1;
    const firstName = req.query.firstName;
    if (!firstName) {
      return res.status(400).json({ message: "firstName is required" });
    }
    const when = getWhen();
    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!order.additionalInfo?.[idx0]) {
      return res.status(400).json({ message: `Invalid yard index: ${yardIndex}` });
    }

    const yard = order.additionalInfo[idx0];
    const body = req.body || {};

    const normalize = (v) =>
      v === undefined || v === null || v === "" ? null : v;

    const patch = {};
    // Only include non-empty updates
    for (const [k, v] of Object.entries(body)) {
      if (normalize(v) !== null) patch[k] = v;
    }

    const changes = [];
    for (const [key, newVal] of Object.entries(patch)) {
      const oldVal = yard[key] ?? null;
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        yard[key] = newVal;
        changes.push(`${key}: ${oldVal || "—"} → ${newVal}`);
      }
    }

    if (changes.length > 0) {
      order.orderHistory.push(
        `Yard ${idx0 + 1} refund info updated (${changes.join("; ")}) by ${firstName} on ${when}`
      );
      order.markModified(`additionalInfo.${idx0}`);
      await order.save();
      publish(req, orderNo, {
        type: "YARD_UPDATED",
        yardIndex: idx0 + 1,
        status: order.orderStatus,
      });
      broadcastOrder(req, order);
      return res.json({ message: "Refund info updated", changes, order });
    }

    res.json({ message: "No meaningful changes detected" });
  } catch (err) {
    console.error("PATCH refundStatus failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
router.put("/:orderNo/reimbursement", async (req, res) => {
  const { orderNo } = req.params;
  const { reimbursementAmount, reimbursementDate } = req.body || {};
  try {
    const amount =
      reimbursementAmount === null ||
      reimbursementAmount === undefined ||
      reimbursementAmount === ""
        ? null
        : Number(reimbursementAmount);

    if (amount !== null && Number.isNaN(amount)) {
      return res
        .status(400)
        .json({ message: "Invalid reimbursementAmount value" });
    }

    let dateValue = null;
    if (reimbursementDate) {
      const parsed = new Date(reimbursementDate);
      if (Number.isNaN(parsed.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid reimbursementDate value" });
      }
      dateValue = parsed;
    }

    const Order = getOrderModel(req);
    const order = await Order.findOneAndUpdate(
      { orderNo: String(orderNo) },
      {
        reimbursementAmount: amount,
        reimbursementDate: dateValue,
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    publish(req, orderNo, {
      type: "REIMBURSEMENT_UPDATED",
      reimbursementAmount: order.reimbursementAmount,
      reimbursementDate: order.reimbursementDate,
    });
    broadcastOrder(req, order);

    res.json({
      message: "Reimbursement details updated",
      reimbursementAmount: order.reimbursementAmount,
      reimbursementDate: order.reimbursementDate,
      order,
    });
  } catch (error) {
    console.error("Error updating reimbursement:", error);
    res
      .status(500)
      .json({ message: "Server error", error: error?.message || String(error) });
  }
});
// Updating Actual GP for an order
router.put('/:orderNo/updateActualGP', async (req, res) => {
  console.log("[orders] PUT /orders/:orderNo/updateActualGP hit");
  const { orderNo } = req.params;
  const { actualGP } = req.body;
  const firstName = req.query.firstName || req.user?.firstName;
  if (!firstName) {
    return res.status(400).json({ message: "firstName is required" });
  }

  const nextGP = Number(actualGP);
  if (Number.isNaN(nextGP)) {
    return res.status(400).json({ message: "Invalid Actual GP value" });
  }

  console.log("Updating actualGP:", nextGP, "for order:", orderNo);

  try {
    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo: String(orderNo) });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const previousGP = Number(order.actualGP ?? 0);
    const hasMeaningfulChange = Math.abs(previousGP - nextGP) > 0.0001;

    if (!hasMeaningfulChange) {
      console.log(
        `Skipping Actual GP history entry — unchanged (prev: ${previousGP}, incoming: ${nextGP})`
      );
      return res.json(order);
    }

    order.actualGP = nextGP;

    const formattedDateTime = moment().tz("America/Chicago").format("D MMM, YYYY HH:mm");
    order.orderHistory = order.orderHistory || [];
    const formattedGP = nextGP.toFixed(2);
    const entry = `Actual GP updated to ${formattedGP} by ${firstName} on ${formattedDateTime}`;
    const lastEntry = order.orderHistory[order.orderHistory.length - 1];

    if (lastEntry !== entry) {
      order.orderHistory.push(entry);
    }

    await order.save();
    publish(req, orderNo, {
      type: "GP_UPDATED",
      actualGP: order.actualGP,
    });
    broadcastOrder(req, order);
    res.json(order);
  } catch (error) {
    console.error("Error updating Actual GP:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
// updating support comments
router.patch('/:orderNo/supportNotes', async (req, res) => {
  const when = getWhen(); 
  const { orderNo } = req.params;
  const { note, author } = req.body;

  const supportNote = `${author}, ${when} : ${note}`;

  try {
    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    order.supportNotes = order.supportNotes || [];
    const added = pushUniqueNote(order.supportNotes, supportNote);

    await order.save();
    if (added) {
      publish(req, orderNo, { type: "SUPPORT_NOTE_ADDED" });
    }
    broadcastOrder(req, order);
    res.json({ message: 'Support comment added', supportNotes: order.supportNotes });
  } catch (err) {
    console.error("PATCH /supportNotes error:", err);
    res.status(500).json({ message: 'Failed to update support comments.', error: err.message });
  }
});// PATCH: Add note to a specific yard's notes array inside additionalInfo
router.patch("/:orderNo/additionalInfo/:index/notes", async (req, res) => {
  const when = getWhen(); 
  try {
    const { orderNo, index } = req.params;
    const { note, author } = req.body;
    console.log("Adding yard note:", { orderNo, index, note, author })
    if (!note || !author ) {
      return res.status(400).json({ message: "Missing note, author, or timestamp." });
    }

    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    console.log("Found order:", order ? "Yes" : "No");
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    // Ensure additionalInfo array exists
    if (!Array.isArray(order.additionalInfo) || !order.additionalInfo[index]) {
      return res.status(400).json({ message: `No yard found at index ${index}.` });
    }

    // Initialize notes if not present
    if (!Array.isArray(order.additionalInfo[index].notes)) {
      order.additionalInfo[index].notes = [];
    }

    // Add new note
    const formatted = `${author}, ${when} : ${note}`;
    const noteAdded = pushUniqueNote(order.additionalInfo[index].notes, formatted);

    await order.save();
    if (noteAdded) {
      publish(req, orderNo, { type: "YARD_NOTE_ADDED", yardIndex: Number(index) + 1 });
    }
    broadcastOrder(req, order);
    return res.json({
      message: "Yard note added successfully.",
      notes: order.additionalInfo[index].notes,
    });
  } catch (err) {
    console.error("Error adding yard note:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});
/* Save only — for order cancellation (no email sent)*/
router.put("/:orderNo/cancelOnly", async (req, res) => {
  try {
    const { orderNo } = req.params;
    const { cancelledRefAmount, cancellationReason } = req.body;
    const firstName = req.query.firstName;
    if (!firstName) {
      return res.status(400).json({ message: "firstName is required" });
    }

    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const cancelledDate = moment().tz("America/Chicago").toISOString();
    const formattedDateTime = moment().tz("America/Chicago").format("D MMM, YYYY HH:mm");

    // update fields
    order.cancelledDate = cancelledDate;
    order.cancellationReason = cancellationReason;
    order.custRefAmount = cancelledRefAmount || null;
    order.orderStatus = "Order Cancelled";

    // history entry
    order.orderHistory = order.orderHistory || [];
    order.orderHistory.push(
      `Order Cancelled by ${firstName} on ${formattedDateTime}`
    );

    await order.save();
    publish(req, orderNo, { type: "STATUS_CHANGED", status: order.orderStatus });
    broadcastOrder(req, order);
    res.json({
      message: "Order cancelled and saved successfully (no email sent).",
      order,
    });
  } catch (err) {
    console.error("Error saving cancelled order:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// to mark dispute
router.put('/:orderNo/dispute', async (req, res) => {
  const { orderNo } = req.params;
  const { disputedDate, disputeReason, disputedRefAmount } = req.body;
  const firstName = req.query.firstName;
  if (!firstName) {
    return res.status(400).json({ message: "firstName is required" });
  }

  try {
    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const moment = (await import("moment-timezone")).default;
    const central = moment().tz("America/Chicago");
    const formattedDateTime = central.format("D MMM, YYYY HH:mm");

    order.disputedDate = disputedDate || central.toISOString();
    order.disputeReason = disputeReason;
    order.custRefAmount = disputedRefAmount || order.custRefAmount;
    order.orderStatus = "Dispute";

    order.orderHistory = order.orderHistory || [];
    order.orderHistory.push(
      `Order marked as Dispute by ${firstName} on ${formattedDateTime}`
    );

    await order.save();
    publish(req, orderNo, { type: "STATUS_CHANGED", status: order.orderStatus });
    broadcastOrder(req, order);
    res.json({ message: "Order marked as Dispute successfully.", order });
  } catch (error) {
    console.error("Error updating dispute:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


/* Save only — for refund info (no email sent)*/
router.put("/:orderNo/refundOnly", async (req, res) => {
  try {
    const { orderNo } = req.params;
    const { custRefundedAmount } = req.body;
    const firstName = req.query.firstName;
    if (!firstName) {
      return res.status(400).json({ message: "firstName is required" });
    }

    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const custRefundDate = moment().tz("America/Chicago").toISOString();
    const formattedDateTime = moment().tz("America/Chicago").format("D MMM, YYYY HH:mm");

    // update fields
    order.custRefundDate = custRefundDate;
    order.custRefAmount = custRefundedAmount || null;
    order.orderStatus = "Refunded";

    // history entry
    order.orderHistory = order.orderHistory || [];
    order.orderHistory.push(
      `Order marked as Refunded by ${firstName} on ${formattedDateTime}`
    );

    await order.save();
    publish(req, orderNo, {
      type: "REFUND_SAVED",
      status: order.orderStatus,
    });
    broadcastOrder(req, order);
    res.json({
      message: "Refund saved successfully (no email sent).",
      order,
    });
  } catch (err) {
    console.error("Error saving refund info:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* PATCH /orders/:orderNo/storeCredits - Use store credit (brand-aware) */
router.patch("/:orderNo/storeCredits", async (req, res) => {
  try {
    const { orderNo } = req.params;
    const { usageType, amountUsed, orderNoUsedFor } = req.body;
    const firstName = cleanFirstName(req.query.firstName || req.user?.firstName || "");
    if (!firstName) {
      return res.status(400).json({ message: "firstName is required" });
    }
    const when = getWhen();

    if (!orderNoUsedFor || !orderNoUsedFor.trim()) {
      return res.status(400).json({ message: "orderNoUsedFor is required" });
    }

    const amount = Number(amountUsed);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid amountUsed value" });
    }

    const Order = getOrderModel(req);
    const order = await Order.findOne({ orderNo });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Find all yards with store credit > 0
    const yardsWithCredit = (order.additionalInfo || []).filter(
      (info) => info.storeCredit && Number(info.storeCredit) > 0
    );

    if (yardsWithCredit.length === 0) {
      return res.status(400).json({ message: "No store credit available for this order" });
    }

    // Calculate total available store credit
    const totalAvailable = yardsWithCredit.reduce(
      (sum, info) => sum + Number(info.storeCredit || 0),
      0
    );

    if (amount > totalAvailable) {
      return res.status(400).json({
        message: `Amount ($${amount.toFixed(2)}) exceeds available store credit ($${totalAvailable.toFixed(2)})`,
      });
    }

    // Distribute the usage across yards with credit (proportional or first-come-first-served)
    let remainingAmount = amount;
    const updates = [];

    for (const yard of yardsWithCredit) {
      if (remainingAmount <= 0) break;

      const yardCredit = Number(yard.storeCredit || 0);
      if (yardCredit <= 0) continue;

      const amountToUse = Math.min(remainingAmount, yardCredit);
      const newCredit = yardCredit - amountToUse;
      remainingAmount -= amountToUse;

      // Update storeCredit
      yard.storeCredit = newCredit;

      // Add to storeCreditUsedFor
      if (!Array.isArray(yard.storeCreditUsedFor)) {
        yard.storeCreditUsedFor = [];
      }
      yard.storeCreditUsedFor.push({
        orderNo: orderNoUsedFor.trim(),
        amount: amountToUse,
      });

      updates.push({
        yardName: yard.yardName || "Unknown Yard",
        used: amountToUse,
        remaining: newCredit,
      });

      // Mark the field as modified
      order.markModified(`additionalInfo`);
    }

    // Add history entry
    if (!Array.isArray(order.orderHistory)) {
      order.orderHistory = [];
    }
    const historyEntry = `Store credit of $${amount.toFixed(2)} used for order ${orderNoUsedFor.trim()} by ${firstName} on ${when}`;
    order.orderHistory.push(historyEntry);

    await order.save();

    publish(req, orderNo, {
      type: "STORE_CREDIT_USED",
      amountUsed: amount,
      orderNoUsedFor: orderNoUsedFor.trim(),
    });
    broadcastOrder(req, order);

    res.json({
      message: "Store credit updated successfully",
      order,
      updates,
    });
  } catch (err) {
    console.error("Error updating store credit:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

export default router;
