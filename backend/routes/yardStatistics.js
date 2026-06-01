import express from "express";
import moment from "moment-timezone";
import { isJunkedPartYard } from "../../shared/utils/junkYard.js";
import { getOrderModelForBrand } from "../models/Order.js";
import { requireAuth, allow } from "../middleware/auth.js";

const router = express.Router();
const TZ = "America/Chicago";

function buildDateRange({ start, end, month, year }) {
  if (start && end) {
    const startDate = moment.tz(start, TZ).startOf("day").toDate();
    const endExclusive = moment.tz(end, TZ).endOf("day").add(1, "millisecond").toDate();
    return { startDate, endExclusive };
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
      ? monthMap[String(month).slice(0, 3)]
      : Math.max(0, Math.min(11, parseInt(month, 10) - 1));
    const y = parseInt(year, 10);
    if (mIndex == null || Number.isNaN(y)) {
      throw new Error("Invalid month/year");
    }
    const startMoment = moment.tz({ year: y, month: mIndex }, TZ).startOf("month");
    const endExclusive = startMoment.clone().add(1, "month").toDate();
    return { startDate: startMoment.toDate(), endExclusive };
  }

  throw new Error("Provide either start/end or month/year");
}

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function isPoCancelledStatus(status) {
  const s = norm(status);
  return s === "po cancelled" || s === "po canceled" || s === "po cancel";
}

function isEscalationStatus(status) {
  return norm(status) === "escalation";
}

/** Match "Yard 2" but not "Yard 20" when yardNum is 2. */
function lineMatchesYard(line, yardNum) {
  return new RegExp(`\\bYard ${yardNum}\\b`, "i").test(String(line || ""));
}

/** Yard statuses that only apply after a PO was sent to the yard. */
const YARD_STATUS_IMPLIES_PO_SENT = new Set([
  "yard po sent",
  "label created",
  "part shipped",
  "part delivered",
  "part lost with shipping partner",
]);

function isPoSentHistoryLine(line) {
  const text = String(line || "");
  if (!/\bpo sent\b/i.test(text)) return false;
  if (/po sent by\b/i.test(text)) return true;
  if (/status updated to\s+yard po sent/i.test(text)) return true;
  return false;
}

/**
 * Derive yard lifecycle from orderHistory (1-based yard index).
 */
function analyzeYardHistory(orderHistory, yardNum) {
  let poSentCount = 0;
  let poCancelled = false;
  let escalation = false;

  for (const raw of orderHistory || []) {
    const line = String(raw || "");
    if (!lineMatchesYard(line, yardNum)) continue;

    if (isPoSentHistoryLine(line)) {
      poSentCount += 1;
    }
    if (/status updated to\s+po cancel/i.test(line)) {
      poCancelled = true;
    }
    if (/status updated to\s+escalation/i.test(line)) {
      escalation = true;
    }
  }

  return { poSentCount, poCancelled, escalation };
}

function yardHasPoSentDate(yard) {
  const raw = yard?.poSentDate;
  if (raw === undefined || raw === null) return false;
  return String(raw).trim() !== "";
}

function yardStatusImpliesPoSent(yard) {
  const st = norm(yard?.status);
  if (YARD_STATUS_IMPLIES_PO_SENT.has(st)) return true;
  // PO was sent before it could be cancelled
  if (isPoCancelledStatus(yard?.status)) return true;
  return false;
}

/** How many times a PO was sent for this yard slot on this order (min 0 or 1). */
function countYardPoSent(history, yardNum, yard) {
  const events = analyzeYardHistory(history, yardNum);
  if (events.poSentCount > 0) return events.poSentCount;
  if (yardHasPoSentDate(yard) || yardStatusImpliesPoSent(yard)) return 1;
  return 0;
}

function yardPoWasCancelled(history, yardNum, yard) {
  const events = analyzeYardHistory(history, yardNum);
  return events.poCancelled || isPoCancelledStatus(yard?.status);
}

function yardWasEscalation(history, yardNum, yard) {
  const events = analyzeYardHistory(history, yardNum);
  return events.escalation || isEscalationStatus(yard?.status);
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseShippingAmount(shippingDetails) {
  const s = String(shippingDetails || "");
  if (!s) return 0;
  const match = s.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
  return match ? toNumber(match[1]) : 0;
}

function isCardCharged(yard) {
  return String(yard?.paymentStatus || "").trim().toLowerCase() === "card charged";
}

function isRefundCollected(yard) {
  return String(yard?.refundStatus || "")
    .trim()
    .toLowerCase()
    .includes("refund collected");
}

function cardChargedAmount(yard) {
  if (!isCardCharged(yard)) return 0;
  const part = toNumber(yard.partPrice);
  const ship = parseShippingAmount(yard.shippingDetails);
  const others = toNumber(yard.others);
  const refunded = toNumber(yard.refundedAmount);
  return Math.max(0, part + ship + others - refunded);
}

/** Same rules as Collect Refund page */
function refundToCollectAmount(yard) {
  if (String(yard?.collectRefundCheckbox || "").trim() !== "Ticked") return 0;
  const toCollect = toNumber(yard.refundToCollect);
  const refunded = toNumber(yard.refundedAmount);
  if (refunded > 0 || toCollect <= 0) return 0;
  return toCollect;
}

function refundCollectedAmount(yard) {
  if (!isRefundCollected(yard)) return 0;
  return toNumber(yard.refundedAmount);
}

function storeCreditAmount(yard) {
  return Math.max(0, toNumber(yard.storeCredit));
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function computeGrandTotals(rows) {
  const totals = {
    yardCount: rows.length,
    yardPoSent: 0,
    orderCancelled: 0,
    junkedParts: 0,
    cardCharged: 0,
    refundToBeCollected: 0,
    refundCollected: 0,
    storeCredit: 0,
  };

  for (const row of rows) {
    totals.yardPoSent += Number(row.yardPoSent) || 0;
    totals.orderCancelled += Number(row.orderCancelled) || 0;
    totals.junkedParts += Number(row.junkedParts) || 0;
    totals.cardCharged += Number(row.cardCharged) || 0;
    totals.refundToBeCollected += Number(row.refundToBeCollected) || 0;
    totals.refundCollected += Number(row.refundCollected) || 0;
    totals.storeCredit += Number(row.storeCredit) || 0;
  }

  totals.cardCharged = roundMoney(totals.cardCharged);
  totals.refundToBeCollected = roundMoney(totals.refundToBeCollected);
  totals.refundCollected = roundMoney(totals.refundCollected);
  totals.storeCredit = roundMoney(totals.storeCredit);

  return totals;
}

function emptyRow(yardName) {
  return {
    _id: yardName,
    yardName,
    yardPoSent: 0,
    orderCancelled: 0,
    junkedParts: 0,
    cardCharged: 0,
    refundToBeCollected: 0,
    refundCollected: 0,
    storeCredit: 0,
    failedOrders: 0,
    successRate: 0,
  };
}

router.get("/", requireAuth, allow("Admin", "Sales", "Support"), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      q,
      sortBy = "yardName",
      sortOrder = "asc",
      start,
      end,
      month,
      year,
    } = req.query;

    const { startDate, endExclusive } = buildDateRange({ start, end, month, year });
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 25, 1);
    const search = String(q || "").trim().toLowerCase();

    const Order = getOrderModelForBrand(req.brand);
    const query = {
      orderDate: { $gte: startDate, $lt: endExclusive },
      "additionalInfo.0": { $exists: true },
    };

    const orders = await Order.find(query)
      .select("orderStatus additionalInfo orderHistory")
      .lean();

    const statsMap = new Map();
    const history = (order) =>
      Array.isArray(order?.orderHistory) ? order.orderHistory : [];

    for (const order of orders) {
      const yards = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];
      const orderHistory = history(order);

      for (let yardIndex = 0; yardIndex < yards.length; yardIndex++) {
        const yard = yards[yardIndex];
        const yardName = String(yard?.yardName || "").trim();
        if (!yardName) continue;
        if (search && !yardName.toLowerCase().includes(search)) continue;

        const yardNum = yardIndex + 1;
        const poSentCount = countYardPoSent(orderHistory, yardNum, yard);
        const poCancelled = yardPoWasCancelled(orderHistory, yardNum, yard);
        const escalated = yardWasEscalation(orderHistory, yardNum, yard);

        let row = statsMap.get(yardName);
        if (!row) row = emptyRow(yardName);

        row.yardPoSent += poSentCount;
        if (poCancelled) {
          row.orderCancelled += 1;
        }
        if (isJunkedPartYard(yard, { history: orderHistory, yardNum })) {
          row.junkedParts += 1;
        }

        row.cardCharged += cardChargedAmount(yard);
        row.refundToBeCollected += refundToCollectAmount(yard);
        row.refundCollected += refundCollectedAmount(yard);
        row.storeCredit += storeCreditAmount(yard);

        if (poCancelled || escalated) {
          row.failedOrders += 1;
        }

        statsMap.set(yardName, row);
      }
    }

    let rows = Array.from(statsMap.values()).map((row) => {
      const poSentCount = row.yardPoSent;
      const failed = row.failedOrders;
      const successRate =
        poSentCount > 0
          ? Math.round(((poSentCount - failed) / poSentCount) * 10000) / 100
          : 0;
      return {
        ...row,
        cardCharged: roundMoney(row.cardCharged),
        refundToBeCollected: roundMoney(row.refundToBeCollected),
        refundCollected: roundMoney(row.refundCollected),
        storeCredit: roundMoney(row.storeCredit),
        successRate,
      };
    });

    const dir = String(sortOrder).toLowerCase() === "desc" ? -1 : 1;
    const sortKey = String(sortBy || "yardName");

    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return dir * (av - bv);
      }
      return dir * String(av ?? "").localeCompare(String(bv ?? ""), undefined, {
        sensitivity: "base",
      });
    });

    const totalCount = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(pageNum, totalPages);
    const skip = (safePage - 1) * pageSize;
    const pageRows = rows.slice(skip, skip + pageSize);
    const grandTotals = computeGrandTotals(rows);

    res.json({
      orders: pageRows,
      totalCount,
      totalPages,
      currentPage: safePage,
      grandTotals,
    });
  } catch (err) {
    console.error("GET /orders/yardStatistics failed:", err);
    res.status(500).json({
      message: "Failed to load yard statistics",
      error: err.message,
    });
  }
});

export default router;
