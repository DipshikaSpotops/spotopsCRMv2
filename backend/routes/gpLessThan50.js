import express from "express";
import { getOrderModelForBrand } from "../models/Order.js";
import { requireAuth } from "../middleware/auth.js";
import { getDateRange } from "../utils/dateRange.js";

const router = express.Router();
const ALLOWED_EMAIL = "50starsauto110@gmail.com";

function assertAdminOrAllowedEmail(req, res) {
  const reqEmail = String(req.user?.email || "").trim().toLowerCase();
  const isAdmin = String(req.user?.role || "").trim() === "Admin";
  const isAllowedEmail = reqEmail === ALLOWED_EMAIL;
  if (!isAdmin && !isAllowedEmail) {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function hasRefundHistory(order) {
  const status = String(order?.orderStatus || "").trim().toLowerCase();
  if (status === "refunded") return true;
  if (order?.custRefundDate) return true;
  if (toNum(order?.custRefAmount) > 0) return true;
  if (toNum(order?.custRefundedAmount) > 0) return true;
  if (toNum(order?.cancelledRefAmount) > 0) return true;

  const yards = Array.isArray(order?.additionalInfo) ? order.additionalInfo : [];
  if (
    yards.some(
      (y) =>
        toNum(y?.refundedAmount) > 0 ||
        String(y?.refundStatus || "").trim().toLowerCase() === "refund collected" ||
        String(y?.collectRefundCheckbox || "").trim() === "Ticked"
    )
  ) {
    return true;
  }

  const history = Array.isArray(order?.orderHistory) ? order.orderHistory : [];
  return history.some((h) => /refund/i.test(String(h || "")));
}

function hasReplacementHistory(order) {
  const yards = Array.isArray(order?.additionalInfo) ? order.additionalInfo : [];
  if (
    yards.some((y) => {
      const process = String(y?.escalationProcess || "").trim().toLowerCase();
      if (process === "replacement") return true;
      if (String(y?.customerTrackingNumberReplacement || "").trim()) return true;
      if (String(y?.custOwnShipReplacement || "").trim()) return true;
      if (String(y?.customerShippingMethodReplacement || "").trim()) return true;
      if (String(y?.customerShipperReplacement || "").trim()) return true;
      if (String(y?.yardOwnShipping || "").trim()) return true;
      return false;
    })
  ) {
    return true;
  }

  const history = Array.isArray(order?.orderHistory) ? order.orderHistory : [];
  return history.some((h) => /replacement/i.test(String(h || "")));
}

function extractNameBeforeOn(segment = "") {
  return String(segment || "")
    .replace(/\s*\(.*?\)\s*$/g, "")
    .trim();
}

/**
 * Build Update column text from orderHistory:
 * "Refund updated by {user}" and/or "Reimbursement updated by {user}"
 */
export function buildGpUpdateLabels(order) {
  const history = Array.isArray(order?.orderHistory) ? order.orderHistory : [];
  let refundBy = null;
  let reimbursementBy = null;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const line = String(history[i] || "");

    if (!refundBy) {
      const refundMatch =
        line.match(/refund info updated\s*(?:\([^)]*\))?\s*by\s+(.+?)\s+on\s+/i) ||
        line.match(/Refund updated by\s+(.+?)(?:\s+on\s+|$)/i) ||
        line.match(/changed to Refunded by\s+(.+?)\s+on\s+/i) ||
        line.match(/marked as Refunded by\s+(.+?)\s+on\s+/i);
      if (refundMatch) {
        refundBy = extractNameBeforeOn(refundMatch[1]);
      }
    }

    if (!reimbursementBy) {
      const reimburseMatch =
        line.match(/Reimbursement updated by\s+(.+?)(?:\s+on\s+|$)/i) ||
        line.match(/Reimbursement details updated by\s+(.+?)(?:\s+on\s+|$)/i);
      if (reimburseMatch) {
        reimbursementBy = extractNameBeforeOn(reimburseMatch[1]);
      }
    }

    if (refundBy && reimbursementBy) break;
  }

  // Fallback when reimbursement exists but older rows lack history lines
  if (
    !reimbursementBy &&
    order?.reimbursementDate &&
    toNum(order?.reimbursementAmount) > 0
  ) {
    reimbursementBy = "user";
  }

  const labels = [];
  if (refundBy) labels.push(`Refund updated by ${refundBy}`);
  if (reimbursementBy) labels.push(`Reimbursement updated by ${reimbursementBy}`);
  return labels.length ? labels.join(" | ") : "—";
}

router.get("/", requireAuth, async (req, res) => {
  try {
    if (!assertAdminOrAllowedEmail(req, res)) return;

    const { start, end, month, year } = req.query;
    const { startDate, endDate } = getDateRange({ start, end, month, year });

    const Order = getOrderModelForBrand(req.brand);
    const candidates = await Order.find(
      {
        orderDate: { $gte: startDate, $lt: endDate },
        grossProfit: { $exists: true, $ne: null },
        actualGP: { $exists: true, $ne: null },
      },
      {
        orderNo: 1,
        orderDate: 1,
        salesAgent: 1,
        customerName: 1,
        fName: 1,
        lName: 1,
        email: 1,
        phone: 1,
        orderStatus: 1,
        soldP: 1,
        grossProfit: 1,
        actualGP: 1,
        pReq: 1,
        partName: 1,
        custRefAmount: 1,
        custRefundedAmount: 1,
        cancelledRefAmount: 1,
        custRefundDate: 1,
        reimbursementAmount: 1,
        reimbursementDate: 1,
        orderHistory: 1,
        additionalInfo: 1,
        teamOrder: 1,
      }
    )
      .sort({ orderDate: -1 })
      .lean();

    const orders = candidates
      .filter((order) => {
        const estGp = toNum(order.grossProfit);
        const actualGp = toNum(order.actualGP);
        if (!(estGp > 0)) return false;
        if (!(actualGp < estGp * 0.5)) return false;
        return hasRefundHistory(order) && hasReplacementHistory(order);
      })
      .map((order) => {
        const estGp = toNum(order.grossProfit);
        const actualGp = toNum(order.actualGP);
        const nameFromParts = [order.fName, order.lName].filter(Boolean).join(" ").trim();
        return {
          ...order,
          customerName:
            (order.customerName && String(order.customerName).trim()) ||
            nameFromParts ||
            "",
          estimatedGP: estGp,
          actualGP: actualGp,
          gpPercentOfEst:
            estGp > 0 ? Number(((actualGp / estGp) * 100).toFixed(2)) : null,
          updateLabel: buildGpUpdateLabels(order),
        };
      });

    res.json({
      orders,
      totalOrders: orders.length,
    });
  } catch (err) {
    console.error("[gp-less-than-50] failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

export default router;
