import express from "express";
import { getOrderModelForBrand } from "../models/Order.js";
import { requireAuth, allow } from "../middleware/auth.js";

const router = express.Router();

// GET /api/orders/storeCredits  (brand-aware)
router.get("/", requireAuth, allow("Admin", "Sales", "Support"), async (req, res) => {
  try {
    const Order = getOrderModelForBrand(req.brand); // 50STARS / PROLANE
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.max(parseInt(req.query.limit || "25", 10), 1);
    const skip = (page - 1) * limit;
    const q = String(req.query.q || req.query.searchTerm || "").trim();
    const salesAgent = String(req.query.salesAgent || "").trim();

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
    if ((req.user?.role || "").toLowerCase() === "sales" && req.user?.firstName) {
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

export default router;
