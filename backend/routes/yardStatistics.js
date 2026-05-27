import express from "express";
import moment from "moment-timezone";
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

function isPoCancelledStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return (
    s === "po cancelled" ||
    s === "po canceled" ||
    s === "po cancel"
  );
}

function isEscalationStatus(status) {
  return String(status || "").trim().toLowerCase() === "escalation";
}

function isNoOrderPlacedStatus(status) {
  return String(status || "").trim().toLowerCase() === "yard located";
}

function isJunkYard(yard) {
  const process = String(yard?.escalationProcess || "").trim();
  const reason = String(yard?.custReason || "").trim();
  return process === "Junk" || (process === "Replacement" && reason === "Junked");
}

function isOrderCancelled(orderStatus) {
  const s = String(orderStatus || "").trim();
  return s === "Order Cancelled" || s === "Cancelled";
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function emptyRow(yardName) {
  return {
    _id: yardName,
    yardName,
    noOrderPlaced: 0,
    orderCancelled: 0,
    junkedParts: 0,
    yardStoreCredit: 0,
    failedOrders: 0,
    successRate: 0,
    ordersPlaced: 0,
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
      salesAgent,
      start,
      end,
      month,
      year,
    } = req.query;

    const { startDate, endExclusive } = buildDateRange({ start, end, month, year });
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 25, 1);
    const search = String(q || "").trim().toLowerCase();

    const Order = getOrderModelForBrand(req);
    const query = {
      orderDate: { $gte: startDate, $lt: endExclusive },
      "additionalInfo.0": { $exists: true },
    };

    if (salesAgent && salesAgent !== "Select" && salesAgent !== "All") {
      query.salesAgent = salesAgent;
    }

    const orders = await Order.find(query)
      .select({ orderStatus: 1, additionalInfo: 1 })
      .lean();

    const statsMap = new Map();

    for (const order of orders) {
      const orderCancelled = isOrderCancelled(order.orderStatus);
      const yards = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];

      for (const yard of yards) {
        const yardName = String(yard?.yardName || "").trim();
        if (!yardName) continue;
        if (search && !yardName.toLowerCase().includes(search)) continue;

        let row = statsMap.get(yardName);
        if (!row) row = emptyRow(yardName);

        row.ordersPlaced += 1;

        if (isNoOrderPlacedStatus(yard.status)) {
          row.noOrderPlaced += 1;
        }
        if (orderCancelled) {
          row.orderCancelled += 1;
        }
        if (isJunkYard(yard)) {
          row.junkedParts += 1;
        }

        row.yardStoreCredit += toNumber(yard.refundedAmount);

        if (isPoCancelledStatus(yard.status) || isEscalationStatus(yard.status)) {
          row.failedOrders += 1;
        }

        statsMap.set(yardName, row);
      }
    }

    let rows = Array.from(statsMap.values()).map((row) => {
      const placed = row.ordersPlaced;
      const failed = row.failedOrders;
      const successRate =
        placed > 0
          ? Math.round(((placed - failed) / placed) * 10000) / 100
          : 0;
      return {
        ...row,
        yardStoreCredit: Math.round(row.yardStoreCredit * 100) / 100,
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

    res.json({
      orders: pageRows,
      totalCount,
      totalPages,
      currentPage: safePage,
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
