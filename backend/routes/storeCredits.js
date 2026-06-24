import express from "express";
import { getOrderModelForBrand } from "../models/Order.js";
import { requireAuth, allow } from "../middleware/auth.js";
import {
  normalizeYardName,
  stripLocationParenthetical,
  yardStoreCreditMatchKey,
} from "../../shared/utils/yardName.js";

const router = express.Router();

function buildStoreCreditSummary(orders) {
  const map = {};

  orders.forEach((ord) => {
    const addl = Array.isArray(ord.additionalInfo) ? ord.additionalInfo : [];
    addl.forEach((ai) => {
      const name = (ai.yardName || "").trim();
      const creditNum =
        ai.storeCredit !== undefined && ai.storeCredit !== null
          ? Number(ai.storeCredit)
          : 0;
      const refundedRaw =
        ai.refundedAmount !== undefined && ai.refundedAmount !== null
          ? Number(ai.refundedAmount)
          : 0;
      if (!name || !Number.isFinite(creditNum) || creditNum <= 0) return;

      const key = yardStoreCreditMatchKey(name, ai.city, ai.state);
      const used = Array.isArray(ai.storeCreditUsedFor)
        ? ai.storeCreditUsedFor.reduce(
            (sum, entry) => sum + (Number(entry.amount) || 0),
            0
          )
        : 0;

      const entry = {
        sourceOrderNo: ord.orderNo,
        remaining: creditNum,
        used,
        refunded: Number.isFinite(refundedRaw) ? refundedRaw : 0,
        usedBreakdown: Array.isArray(ai.storeCreditUsedFor)
          ? ai.storeCreditUsedFor.map((u) => ({
              orderNo: u.orderNo,
              amount: Number(u.amount) || 0,
            }))
          : [],
      };

      if (!map[key]) {
        map[key] = {
          displayName:
            normalizeYardName(name, ai.city, ai.state) ||
            stripLocationParenthetical(name) ||
            name,
          totalRemaining: 0,
          totalUsed: 0,
          totalRefunded: 0,
          entries: [],
        };
      }

      map[key].entries.push(entry);
      map[key].totalRemaining += creditNum;
      map[key].totalUsed += used;
      map[key].totalRefunded += entry.refunded;
    });
  });

  return map;
}

// GET /api/orders/storeCredits  (brand-aware)
router.get("/", requireAuth, allow("Admin", "Sales", "Support"), async (req, res) => {
  try {
    const Order = getOrderModelForBrand(req.brand); // 50STARS / PROLANE
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.max(parseInt(req.query.limit || "25", 10), 1);
    const skip = (page - 1) * limit;
    const q = String(req.query.q || req.query.searchTerm || "").trim();
    const salesAgent = String(req.query.salesAgent || "").trim();
    const forYardLookup =
      String(req.query.scope || "").toLowerCase() === "all" ||
      String(req.query.forYardLookup || "").toLowerCase() === "true";

    const query = {
      "additionalInfo.storeCredit": { $exists: true, $gt: 0 },
    };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { orderNo: rx },
        { customerName: rx },
        { fName: rx },
        { lName: rx },
        { salesAgent: rx },
        { email: rx },
        { phone: rx },
      ];
    }
    if (
      !forYardLookup &&
      (req.user?.role || "").toLowerCase() === "sales" &&
      req.user?.firstName
    ) {
      const escaped = req.user.firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.salesAgent = new RegExp(`^${escaped}(?:\\s.*|$)`, "i");
    } else if ((req.user?.role || "").toLowerCase() === "admin" && salesAgent) {
      query.salesAgent = new RegExp(salesAgent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }

    const [orders, totalOrders] = await Promise.all([
      Order.find(query).sort({ orderDate: -1, _id: 1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(query),
    ]);

    res.json({
      orders,
      totalOrders,
      totalPages: Math.max(1, Math.ceil(totalOrders / limit)),
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching store credits:", error);
    res.status(500).json({ message: "Server error", error: error?.message || String(error) });
  }
});

/** GET /api/orders/storeCredits/yard-balance — lookup credit for a yard when adding yards */
router.get("/yard-balance", requireAuth, allow("Admin", "Sales", "Support"), async (req, res) => {
  try {
    const yardName = String(req.query.yardName || "").trim();
    const city = String(req.query.city || "").trim();
    const state = String(req.query.state || "").trim();
    if (!yardName) {
      return res.status(400).json({ message: "yardName is required" });
    }

    const lookupKey = yardStoreCreditMatchKey(yardName, city, state);

    const Order = getOrderModelForBrand(req.brand);
    const orders = await Order.find({
      "additionalInfo.storeCredit": { $exists: true, $gt: 0 },
    })
      .select("orderNo additionalInfo")
      .lean();

    const matchingOrders = orders
      .map((ord) => ({
        orderNo: ord.orderNo,
        additionalInfo: (ord.additionalInfo || []).filter(
          (ai) =>
            Number(ai.storeCredit) > 0 &&
            yardStoreCreditMatchKey(ai.yardName, ai.city, ai.state) === lookupKey
        ),
      }))
      .filter((ord) => ord.additionalInfo.length > 0);

    const map = buildStoreCreditSummary(matchingOrders);
    const summary = map[lookupKey] || Object.values(map)[0] || null;

    res.json({ summary, lookupKey });
  } catch (error) {
    console.error("Error fetching yard store credit balance:", error);
    res.status(500).json({ message: "Server error", error: error?.message || String(error) });
  }
});

export default router;
