import express from "express";
import moment from "moment-timezone";
import { getOrderModelForBrand } from "../models/Order.js";
import Team from "../models/Team.js";
import { requireAuth } from "../middleware/auth.js";
import { canAssignOrders } from "../../shared/constants/assignOrdersAccess.js";
import { isCommonTeam } from "../../shared/constants/teams.js";
import { unassignedTeamOrderClause } from "../utils/orderAccessScope.js";
import { appendTeamAssignHistory } from "../utils/teamAssignHistory.js";

const router = express.Router();

function requireAssignAccess(req, res, next) {
  if (!canAssignOrders(req.user)) {
    return res.status(403).json({
      message:
        "Access denied. Only Admin or authorized emails can assign orders.",
    });
  }
  return next();
}

function applyDateFilter(filter, { month, year, start, end }) {
  if (start && end) {
    const startDate = moment.tz(start, "America/Chicago").startOf("day").toDate();
    const endDate = moment.tz(end, "America/Chicago").endOf("day").toDate();
    filter.orderDate = { $gt: startDate, $lt: endDate };
    return;
  }

  if (month && year) {
    const monthMap = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    if (!(month in monthMap) && isNaN(month)) {
      const err = new Error("Invalid month format");
      err.status = 400;
      throw err;
    }
    const monthIndex = isNaN(month) ? monthMap[month] : parseInt(month, 10) - 1;
    const startDate = moment
      .tz({ year: parseInt(year, 10), month: monthIndex, day: 1 }, "America/Chicago")
      .startOf("month")
      .toDate();
    const endDate = moment(startDate).add(1, "month").toDate();
    filter.orderDate = { $gte: startDate, $lt: endDate };
    return;
  }

  const err = new Error("Provide either month/year or start/end");
  err.status = 400;
  throw err;
}

/** GET / — Placed orders not yet assigned to a team */
router.get("/", requireAuth, requireAssignAccess, async (req, res) => {
  try {
    const { month, year, start, end, q } = req.query;
    const filter = {
      orderStatus: "Placed",
      $and: [unassignedTeamOrderClause()],
    };

    applyDateFilter(filter, { month, year, start, end });

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), "i");
      filter.$and.push({
        $or: [
          { orderNo: regex },
          { customerName: regex },
          { fName: regex },
          { lName: regex },
          { salesAgent: regex },
          { phone: regex },
          { customerPhone: regex },
          { contactNo: regex },
        ],
      });
    }

    const Order = getOrderModelForBrand(req.brand);
    const orders = await Order.find(filter).sort({ orderDate: -1 }).limit(100);
    res.json(orders);
  } catch (error) {
    const status = error.status || 500;
    console.error("Error fetching assignable orders:", error);
    res.status(status).json({
      message: status === 400 ? error.message : "Server error",
      error: error.message,
    });
  }
});

/** PATCH /:orderNo — assign a Placed order to a team */
router.patch("/:orderNo", requireAuth, requireAssignAccess, async (req, res) => {
  try {
    const orderNo = String(req.params.orderNo || "").trim();
    const teamName = String(req.body?.teamOrder || req.body?.team || "").trim();

    if (!orderNo) {
      return res.status(400).json({ message: "Order number is required." });
    }
    if (!teamName) {
      return res.status(400).json({ message: "Team is required." });
    }
    if (isCommonTeam(teamName)) {
      return res.status(400).json({
        message: "Cannot assign orders to the Common team. Pick an ops team.",
      });
    }

    const team = await Team.findOne({
      teamName: { $regex: new RegExp(`^${teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    }).lean();

    if (!team) {
      return res.status(404).json({ message: "Team not found." });
    }

    const Order = getOrderModelForBrand(req.brand);
    const order = await Order.findOne({ orderNo });
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (String(order.orderStatus || "").trim() !== "Placed") {
      return res.status(400).json({
        message: "Only Placed orders can be assigned from this page.",
      });
    }

    const prevTeam = String(order.teamOrder || "").trim();
    if (prevTeam) {
      return res.status(409).json({
        message: `Order is already assigned to ${prevTeam}. Use Monthly Orders to reassign.`,
      });
    }

    order.teamOrder = team.teamName;
    appendTeamAssignHistory(order, {
      prevTeam: "—",
      nextTeam: team.teamName,
      by: req.user?.firstName || req.user?.email || "System",
    });

    await order.save();

    try {
      const io = req.app.get("io");
      if (io) io.emit("orderUpdated", order);
    } catch (e) {
      console.warn("[ws] assignOrders broadcast failed", e);
    }

    res.json(order);
  } catch (error) {
    console.error("Error assigning order to team:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;
