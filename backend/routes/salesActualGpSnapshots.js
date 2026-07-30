import express from "express";
import moment from "moment-timezone";
import SalesActualGpSnapshot from "../models/SalesActualGpSnapshot.js";
import { requireAuth, allow } from "../middleware/auth.js";
import { brandMiddleware } from "../middleware/brand.js";

const router = express.Router();
const TZ = "America/Chicago";

router.use(brandMiddleware);

/**
 * GET /api/salesActualGpSnapshots?year=&month=
 * Returns mid-month Actual GP snapshots for the current brand.
 */
router.get("/", requireAuth, allow("Admin", "Sales"), async (req, res) => {
  try {
    const brand = req.brand === "PROLANE" ? "PROLANE" : "50STARS";
    const dallasNow = moment.tz(TZ);
    const year = parseInt(req.query.year, 10) || dallasNow.year();
    const month = parseInt(req.query.month, 10) || dallasNow.month() + 1;

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ message: "Invalid year" });
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return res.status(400).json({ message: "Invalid month" });
    }

    const rows = await SalesActualGpSnapshot.find({ brand, year, month })
      .sort({ salesAgent: 1 })
      .lean();

    return res.json({
      brand,
      year,
      month,
      count: rows.length,
      snapshots: rows,
    });
  } catch (err) {
    console.error("GET salesActualGpSnapshots failed:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

export default router;
