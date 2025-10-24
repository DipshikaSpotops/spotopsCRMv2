// routes/orders.js
import express from "express";
import moment from "moment-timezone";
import Order from "../models/Order.js";
import { getDateRange } from "../utils/dateRange.js";
// import { io } from "../server.js";
import { getWhen } from "../../shared/utils/timeUtils.js";

const router = express.Router();

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

/* ---------------------------- Routes ----------------------------- */

// Yearly aggregation (for bar chart)
router.get("/yearly", async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ message: "Year is required" });

    const y = Number(year);
    const start = new Date(Date.UTC(y, 0, 1));
    const end   = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));

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

    const orders = await Order.find({
      cancelledDate: { $gte: startDate, $lt: endDate },
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching cancelled-by-date orders:", error);
    res.status(500).json({ message: "Server error", error: error?.message || String(error) });
  }
});

// Refunded-by-date
router.get("/refunded-by-date", async (req, res) => {
  try {
    const { start, end, month, year } = req.query;
    const { startDate, endDate } = getDateRange({ start, end, month, year });

    const orders = await Order.find({
      custRefundDate: { $gte: startDate, $lt: endDate },
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching refunded-by-date orders:", error);
    res.status(500).json({ message: "Server error", error: error?.message || String(error) });
  }
});

// Disputes-by-date
router.get("/disputes-by-date", async (req, res) => {
  try {
    const { start, end, month, year } = req.query;
    const { startDate, endDate } = getDateRange({ start, end, month, year });

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
  const firstName = req.query.firstName || "System";
  const central = moment().tz("America/Chicago");
  const formattedDateTime = central.format("D MMM, YYYY HH:mm");

  try {
    const newOrder = new Order({ ...req.body });
    newOrder.orderDate = central.toDate();

    newOrder.orderHistory = newOrder.orderHistory || [];
    newOrder.orderHistory.push(`Order placed by ${firstName} on ${formattedDateTime}`);

    await newOrder.save();
    const io = req.app.get("io");
    io.emit("orderCreated", newOrder);
    publish(req, newOrder.orderNo, { type: "ORDER_CREATED" });
    res.status(201).json(newOrder);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Order No already exists" });
    }
    res.status(500).json({ message: "Error creating order", error: error?.message || String(error) });
  }
});

// Update order status (and other fields)
router.put("/:orderNo", async (req, res) => {
  const central = moment().tz("America/Chicago");
  const formattedDateTime = central.format("D MMM, YYYY HH:mm");

  try {
    const order = await Order.findOne({ orderNo: req.params.orderNo });
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

    const firstName = order.firstName || "System";

    // Add history only if status changed
    if (oldStatus !== order.orderStatus) {
      order.orderHistory = order.orderHistory || [];
      order.orderHistory.push(
        `Order status updated to ${order.orderStatus} by ${firstName} on ${formattedDateTime}`
      );
    }

    const updatedOrder = await order.save();
    publish(req, updatedOrder.orderNo, {
  type: updatedOrder.orderStatus !== oldStatus ? "STATUS_CHANGED" : "ORDER_UPDATED",
  status: updatedOrder.orderStatus,
});
    res.json(updatedOrder);
  } catch (err) {
    res.status(400).send(err?.message || String(err));
  }
});

// Get order by orderNo
router.get("/:orderNo", async (req, res) => {
  const order = await Order.findOne({ orderNo: req.params.orderNo });
  if (!order) return res.status(404).json({ message: "Order not found" });
  res.json(order);
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

    const firstName = req.query.firstName || "System";

    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Normalize amounts
    const amount = cancelledRefAmount ?? custRefAmount ?? custRefundedAmount ?? null;

    const updateFields = {};

    if (custRefundDate) updateFields.custRefundDate = custRefundDate;
    if (amount !== null) updateFields.custRefAmount = amount;

    if (cancelledDate) updateFields.cancelledDate = cancelledDate;
    if (cancellationReason) updateFields.cancellationReason = cancellationReason;

    let nextStatus = orderStatus;
    if (!nextStatus && cancelledDate) nextStatus = "Order Cancelled";
    if (nextStatus) updateFields.orderStatus = nextStatus;

    const formattedDateTime = moment().tz("America/Chicago").format("D MMM, YYYY HH:mm");

    order.orderHistory = order.orderHistory || [];

    if (custRefundDate && amount !== null) {
      order.orderHistory.push(`Order status changed to Refunded by ${firstName} on ${formattedDateTime}`);
    }

    if (cancelledDate && cancellationReason) {
      order.orderHistory.push(`Order Cancelled by ${firstName} on ${formattedDateTime}`);
    }

    Object.assign(order, updateFields);
    await order.save();
      publish(req, orderNo, {
      type: "REFUND_SAVED",
      status: order.orderStatus,
    });
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
    const firstName = (req.query.firstName || req.query.firstname || "").toString().trim();

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
      shippingDetails, others, faxNo, expShipDate, warranty, stockNo,
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

    await order.save();
    publish(req, orderNo, {
      type: "YARD_ADDED",
      yardIndex: order.additionalInfo.length, 
      status: order.orderStatus,
    });
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
router.put("/:orderNo/additionalInfo/:index", async (req, res) => {
  console.log("REQ BODY:", JSON.stringify(req.body, null, 2));
  try {
    const orderNo = req.params.orderNo;
    const idx1 = parseInt(req.params.index, 10);
    const idx0 = idx1 - 1;

    const firstName = (
      req.query.firstName ||
      req.query.firstname ||
      "System"
    ).toString().trim();

    const when = getWhen();     
    const isoNow = getWhen("iso");

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
    ];

    const patch = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) patch[k] = req.body[k];
    }

    /* ---------------------- VOID LABEL ---------------------- */
    if (req.body.voidLabel) {
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
        ? `Label voided by ${firstName} on ${when}. Cleared → ${removed.join(", ")}.`
        : `Label voided by ${firstName} on ${when}. (No label details found)`;
      subdoc.notes.push(`[${when}] (${firstName}) ${summary}`);

      order.orderHistory.push(`Yard ${idx1} label voided by ${firstName} on ${when}`);

      order.markModified(`additionalInfo.${idx0}`);
      await order.save();
      publish(req, orderNo, {
        type: "YARD_UPDATED",
        yardIndex: idx1,         
        status: order.orderStatus,
      });
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
      const noteDetails = nonStatusChanges
        .map((field) => {
          const oldVal = before?.[field] || "—";
          const newVal = after?.[field] || "—";
          return `${field}: "${oldVal}" → "${newVal}"`;
        })
        .join("; ");
      subdoc.notes.push(`[${when}] (${firstName}) Updated (${noteDetails})`);
    }

    /* ---------------- CLEARED FIELDS (PO Cancelled) ---------------- */
    const clearedFields = req.body?.updatedYardData?._clearedFields;
    if (clearedFields && typeof clearedFields === "object") {
      const clearedEntries = Object.entries(clearedFields)
        .map(([key, val]) => `${key}: "${val || "—"}"`)
        .join("; ");
      subdoc.notes.push(
        `[${when}] (${firstName}) PO Cancelled. Cleared → ${clearedEntries}`
      );
    }

    /* ---------------- ESCALATION ---------------- */
    if (newStatus === "Escalation" && subdoc.escalationCause) {
      subdoc.notes.push(
        `[${when}] (${firstName}) Escalation Reason: "${subdoc.escalationCause}"`
      );
    }

    /* ---------------- TRACKING SNAPSHOT ---------------- */
    if (["Label created", "Part shipped"].includes(newStatus)) {
      const trackAudit = [
        `Tracking No: ${subdoc.trackingNo || "—"}`,
        `ETA: ${subdoc.eta || "—"}`,
        `Shipper: ${subdoc.shipperName || "—"}`,
        `Tracking Link: ${subdoc.trackingLink || "—"}`,
      ].join("; ");
      subdoc.notes.push(`[Tracking snapshot → ${trackAudit} on ${when} by ${firstName}`);
    }

    /* ---------------- SEND TRACKING EMAIL ---------------- */
    if (changed.includes("status") && newStatus === "Part shipped") {
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
    if (changed.includes("status") && newStatus === "Part delivered") {
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

    order.markModified(`additionalInfo.${idx0}`);
    await order.save();
    publish(req, orderNo, {
      type: changed.includes("status") ? "STATUS_CHANGED" : "YARD_UPDATED",
      yardIndex: idx1,          
      status: order.orderStatus,   
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
      ? `Shipment cancelled by ${firstName} on ${when}. Cleared → ${removed.join(", ")}.`
      : `Shipment cancelled by ${firstName} on ${when}. (No tracking details found)`;

    subdoc.notes.push(`[${when}] (${firstName}) ${summary}`);
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
    const hasShippingChange =
      (updates.ownShipping !== undefined &&
        normalize(updates.ownShipping) !== normalize(yard.ownShipping)) ||
      (updates.yardShipping !== undefined &&
        normalize(updates.yardShipping) !== normalize(yard.yardShipping));

    if (hasShippingChange) {
      yard.shippingDetails = [
        yard.ownShipping ? `Own shipping: ${yard.ownShipping}` : "",
        yard.yardShipping ? `Yard shipping: ${yard.yardShipping}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    }

    // 6️ Log note only if something changed
    if (changes.length > 0) {
      if (!Array.isArray(yard.notes)) yard.notes = [];

      const when = getWhen();       // formatted date for display
     const isoNow = getWhen("iso");

      const noteText = `Updated: ${changes.join(", ")} on ${when} by ${firstName || "System"}`;
      yard.notes.push(noteText);
    }
    await order.save();
    publish(req, orderNo, {
      type: "YARD_UPDATED",
      yardIndex: i + 1,
      status: order.orderStatus,
    });
    res.json({
      message:
        changes.length > 0
          ? `Yard ${i + 1} updated successfully`
          : "No meaningful changes detected",
      changes,
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
  try {
    const { orderNo, yardIndex } = req.params;
    const idx0 = Number(yardIndex) - 1;
    const firstName = req.query.firstName || "System";
    const when = getWhen();
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
    if (normalize(cardChargedDate)) patch.cardChargedDate = cardChargedDate;

    const changes = [];
    for (const [key, newVal] of Object.entries(patch)) {
      const oldVal = yard[key] ?? null;
      if (newVal !== oldVal) {
        yard[key] = newVal;
        changes.push(`${key}: ${oldVal || "—"} → ${newVal}`);
      }
    }

    if (changes.length > 0) {
      order.orderHistory.push(
        `Yard ${idx0 + 1} payment details updated (${changes.join("; ")}) by ${firstName} on ${when}`
      );
      order.markModified(`additionalInfo.${idx0}`);
      await order.save();
      publish(req, orderNo, {
        type: "YARD_UPDATED",
        yardIndex: idx0 + 1,
        status: order.orderStatus,
      });
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
    const firstName = req.query.firstName || "System";
    const when = getWhen();
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
      return res.json({ message: "Refund info updated", changes, order });
    }

    res.json({ message: "No meaningful changes detected" });
  } catch (err) {
    console.error("PATCH refundStatus failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// Updating Actual GP for an order
router.put('/:orderNo/updateActualGP', async (req, res) => {
  console.log("[orders] PUT /orders/:orderNo/updateActualGP hit");
  const { orderNo } = req.params;
  const { actualGP } = req.body;

  console.log("Updating actualGP:", actualGP, "for order:", orderNo);

  try {
    const order = await Order.findOneAndUpdate(
      { orderNo: String(orderNo) },
      { actualGP: actualGP },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Optional: add history log entry
    const formattedDateTime = moment().tz("America/Chicago").format("D MMM, YYYY HH:mm");
    order.orderHistory = order.orderHistory || [];
    order.orderHistory.push(`Actual GP updated to ${actualGP} on ${formattedDateTime}`);
    await order.save();
    publish(req, orderNo, {
      type: "GP_UPDATED",
      actualGP: order.actualGP,
    });
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
    const order = await Order.findOne({ orderNo });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    order.supportNotes = order.supportNotes || [];
    order.supportNotes.push(supportNote);

    await order.save();
    publish(req, orderNo, { type: "SUPPORT_NOTE_ADDED" });
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
    order.additionalInfo[index].notes.push(`${author}, ${when} : ${note}`);

    await order.save();
    publish(req, orderNo, { type: "YARD_NOTE_ADDED", yardIndex: Number(index) + 1 });
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
    const firstName = req.query.firstName || "System";

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
  const firstName = req.query.firstName || "System";

  try {
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
    const firstName = req.query.firstName || "System";

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
    res.json({
      message: "Refund saved successfully (no email sent).",
      order,
    });
  } catch (err) {
    console.error("Error saving refund info:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

export default router;
