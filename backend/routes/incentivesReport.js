import express from "express";
import moment from "moment-timezone";
import { getOrderModelForBrand } from "../models/Order.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
const TZ = "America/Chicago";

const toNum = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const normalizeStatus = (status = "") => String(status || "").trim().toLowerCase();
const INCENTIVES_ALLOWED_EMAIL = "50starsauto110@gmail.com";

/** Est-GP-style sum (grossProfit) but omit dispute / cancelled / refunded (and dispute variants). */
function isExcludedFromCurrentGp(orderStatus) {
  const s = normalizeStatus(orderStatus);
  if (s === "order cancelled" || s === "refunded" || s === "dispute") return true;
  if (s.startsWith("dispute")) return true;
  if (s.includes("cancelled") && s.includes("refunded")) return true;
  return false;
}

/** Group by first name only: "Richard Parker" and "Richard" → "Richard" */
function agentKeyFromSalesAgent(salesAgent) {
  const raw = String(salesAgent ?? "").trim();
  if (!raw) return "Unassigned";
  const first = raw.split(/\s+/)[0];
  return first || "Unassigned";
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const reqEmail = String(req.user?.email || "").trim().toLowerCase();
    const isAdmin = String(req.user?.role || "").trim() === "Admin";
    const isAllowedEmail = reqEmail === INCENTIVES_ALLOWED_EMAIL;
    if (!isAdmin && !isAllowedEmail) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const monthsRequestedRaw = Number(req.query.months ?? 5);
    const monthsRequested = Math.min(Math.max(monthsRequestedRaw || 5, 1), 12);

    const now = moment.tz(TZ);
    const earliestStart = now.clone().startOf("month").subtract(monthsRequested - 1, "months");

    const Order = getOrderModelForBrand(req.brand);
    const orders = await Order.find(
      {
        orderDate: {
          $gte: earliestStart.toDate(),
          $lte: now.toDate(),
        },
      },
      {
        orderDate: 1,
        salesAgent: 1,
        soldP: 1,
        grossProfit: 1,
        actualGP: 1,
        orderStatus: 1,
      }
    ).lean();

    const monthMap = new Map();
    for (let i = 0; i < monthsRequested; i += 1) {
      const m = now.clone().startOf("month").subtract(i, "months");
      const key = m.format("YYYY-MM");
      monthMap.set(key, {
        key,
        monthName: m.format("MMMM"),
        year: m.year(),
        monthIndex: m.month() + 1,
        asOfDate: (i === 0 ? now : m.clone().endOf("month")).format("YYYY-MM-DD"),
        agentMap: new Map(),
      });
    }

    for (const row of orders) {
      const dt = moment.tz(row.orderDate, TZ);
      const key = dt.format("YYYY-MM");
      const bucket = monthMap.get(key);
      if (!bucket) continue;

      const agent = agentKeyFromSalesAgent(row.salesAgent);
      if (!bucket.agentMap.has(agent)) {
        bucket.agentMap.set(agent, {
          agent,
          noOfOrders: 0,
          salesReport: 0,
          actualGp: 0,
          estGp: 0,
          currentGp: 0,
          noOfCancellation: 0,
          refundedOrders: 0,
          noOfDispute: 0,
          individualReportCount: 0,
          individualReportPercent: 0,
        });
      }

      const agg = bucket.agentMap.get(agent);
      agg.noOfOrders += 1;
      agg.salesReport += toNum(row.soldP);
      agg.actualGp += toNum(row.actualGP);
      agg.estGp += toNum(row.grossProfit);
      if (!isExcludedFromCurrentGp(row.orderStatus)) {
        agg.currentGp += toNum(row.grossProfit);
      }

      const status = normalizeStatus(row.orderStatus);
      if (status === "order cancelled") agg.noOfCancellation += 1;
      if (status === "refunded") agg.refundedOrders += 1;
      if (status === "dispute") agg.noOfDispute += 1;
    }

    const months = Array.from(monthMap.values())
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((monthData) => {
        const rows = Array.from(monthData.agentMap.values()).map((r) => {
          const individual = r.noOfCancellation + r.refundedOrders + r.noOfDispute;
          const pct = r.noOfOrders > 0 ? (individual / r.noOfOrders) * 100 : 0;
          return {
            ...r,
            individualReportCount: individual,
            individualReportPercent: Number(pct.toFixed(2)),
            salesReport: Number(r.salesReport.toFixed(2)),
            actualGp: Number(r.actualGp.toFixed(2)),
            estGp: Number(r.estGp.toFixed(2)),
            currentGp: Number(r.currentGp.toFixed(2)),
          };
        });

        rows.sort((a, b) => b.noOfOrders - a.noOfOrders || b.agent.localeCompare(a.agent));

        const totals = rows.reduce(
          (acc, r) => {
            acc.noOfOrders += r.noOfOrders;
            acc.salesReport += r.salesReport;
            acc.actualGp += r.actualGp;
            acc.estGp += r.estGp;
            acc.currentGp += r.currentGp;
            acc.noOfCancellation += r.noOfCancellation;
            acc.refundedOrders += r.refundedOrders;
            acc.noOfDispute += r.noOfDispute;
            acc.individualReportCount += r.individualReportCount;
            return acc;
          },
          {
            noOfOrders: 0,
            salesReport: 0,
            actualGp: 0,
            estGp: 0,
            currentGp: 0,
            noOfCancellation: 0,
            refundedOrders: 0,
            noOfDispute: 0,
            individualReportCount: 0,
            individualReportPercent: 0,
          }
        );

        totals.individualReportPercent =
          totals.noOfOrders > 0
            ? Number(((totals.individualReportCount / totals.noOfOrders) * 100).toFixed(2))
            : 0;

        totals.salesReport = Number(totals.salesReport.toFixed(2));
        totals.actualGp = Number(totals.actualGp.toFixed(2));
        totals.estGp = Number(totals.estGp.toFixed(2));
        totals.currentGp = Number(totals.currentGp.toFixed(2));

        return {
          key: monthData.key,
          title: `${monthData.monthName} Month Performance Report - ${monthData.year}`,
          asOfDate: monthData.asOfDate,
          rows,
          totals,
          deltas: {
            actualGpMinusSales: Number((totals.actualGp - totals.salesReport).toFixed(2)),
            estGpMinusSales: Number((totals.estGp - totals.salesReport).toFixed(2)),
          },
        };
      });

    return res.json({
      brand: req.brand,
      monthsRequested,
      months,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("GET /reports/incentives failed:", err);
    return res.status(500).json({ message: "Failed to generate incentives report." });
  }
});

export default router;
