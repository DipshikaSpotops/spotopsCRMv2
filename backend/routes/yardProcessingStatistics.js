import express from "express";
import moment from "moment-timezone";
import User from "../models/User.js";
import { getOrderModelForBrand } from "../models/Order.js";
import { requireAuth } from "../middleware/auth.js";
import {
  USER_PERMISSIONS,
  userHasPermission,
} from "../../shared/constants/userPermissions.js";
import { OPS_TEAM_NAME_ALIASES } from "../../shared/constants/opsTeams.js";

const router = express.Router();
const TZ = "America/Chicago";
const EXTRA_VIEWER_EMAILS = new Set(["50starsauto110@gmail.com"]);
const REPORT_TEAMS = ["Mavericks"];

function normalizeTeamName(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const alias = OPS_TEAM_NAME_ALIASES[trimmed];
  return alias || trimmed;
}

function buildDateRange({ start, end, month, year }) {
  if (start && end) {
    const startDate = moment.tz(start, TZ).startOf("day").toDate();
    const endExclusive = moment.tz(end, TZ).endOf("day").add(1, "millisecond").toDate();
    return { startDate, endExclusive };
  }

  if (month && year) {
    const monthMap = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const mIndex = isNaN(month)
      ? monthMap[String(month).slice(0, 3)]
      : Math.max(0, Math.min(11, parseInt(month, 10) - 1));
    const y = parseInt(year, 10);
    if (mIndex == null || Number.isNaN(y)) throw new Error("Invalid month/year");
    const startMoment = moment.tz({ year: y, month: mIndex }, TZ).startOf("month");
    return {
      startDate: startMoment.toDate(),
      endExclusive: startMoment.clone().add(1, "month").toDate(),
    };
  }

  const now = moment.tz(TZ);
  return {
    startDate: now.clone().startOf("month").toDate(),
    endExclusive: now.clone().add(1, "month").startOf("month").toDate(),
  };
}

function emptyMemberRow(teamName, memberName) {
  return {
    teamName,
    memberName,
    noOfOrders: 0,
    partialPayment: 0,
    delivered: 0,
    customerApproved: 0,
    inTransit: 0,
    yardProcessing: 0,
    cancellation: 0,
    escalation: 0,
    disputes: 0,
    total: 0,
  };
}

function bucketForOrderStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "partially charged order") return "partialPayment";
  if (s === "order fulfilled") return "delivered";
  if (s === "customer approved") return "customerApproved";
  if (s === "in transit") return "inTransit";
  if (s === "yard processing") return "yardProcessing";
  if (s === "order cancelled" || s === "refunded") return "cancellation";
  if (s === "escalation") return "escalation";
  if (s === "dispute" || s === "dispute 2" || s === "dispute after cancellation") {
    return "disputes";
  }
  return "";
}

function historyMatchesCurrentStatus(line, status) {
  const text = String(line || "");
  const normalized = String(status || "").trim().toLowerCase();

  switch (normalized) {
    case "partially charged order":
      return /partially charged order by /i.test(text) ||
        /order status changed: .*?→\s*partially charged order by /i.test(text);
    case "customer approved":
      return /customer approved/i.test(text) && /\bby\b/i.test(text);
    case "yard processing":
      return (
        /yard \d+ status updated to (yard po sent|label created|po cancel)/i.test(text) ||
        /order status set to yard processing by /i.test(text) ||
        /order status changed: .*?→\s*yard processing by /i.test(text) ||
        /yard \d+ located by /i.test(text)
      );
    case "in transit":
      return /yard \d+ status updated to part shipped by /i.test(text) ||
        /order status set to in transit by /i.test(text) ||
        /order status changed: .*?→\s*in transit by /i.test(text);
    case "order fulfilled":
      return /yard \d+ status updated to part delivered by /i.test(text) ||
        /marked as part delivered .* by /i.test(text) ||
        /order status set to order fulfilled by /i.test(text) ||
        /order status changed: .*?→\s*order fulfilled by /i.test(text);
    case "order cancelled":
    case "refunded":
      return /order cancelled by /i.test(text) ||
        /order status changed to refunded by /i.test(text) ||
        /order status changed: .*?→\s*order cancelled by /i.test(text);
    case "escalation":
      return /yard \d+ status updated to escalation by /i.test(text) ||
        /order status set to escalation by /i.test(text) ||
        /order status changed: .*?→\s*escalation by /i.test(text);
    case "dispute":
    case "dispute 2":
    case "dispute after cancellation":
      return /dispute/i.test(text) && /\bby\b/i.test(text);
    default:
      return false;
  }
}

function actorFromHistoryLine(line) {
  const text = String(line || "");
  const match = text.match(/\bby\s+(.+?)\s+on\b/i);
  return match ? String(match[1] || "").trim() : "";
}

function resolveResponsibleMember(order, teamMembers) {
  const history = Array.isArray(order?.orderHistory) ? order.orderHistory : [];
  const currentStatus = String(order?.orderStatus || "");
  const memberNameMap = new Map(
    teamMembers.map((name) => [String(name).trim().toLowerCase(), String(name).trim()])
  );

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const line = String(history[i] || "");
    if (!historyMatchesCurrentStatus(line, currentStatus)) continue;
    const actor = actorFromHistoryLine(line);
    const canonical = memberNameMap.get(actor.toLowerCase());
    if (canonical) return canonical;
  }

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const actor = actorFromHistoryLine(history[i]);
    const canonical = memberNameMap.get(actor.toLowerCase());
    if (canonical) return canonical;
  }

  return teamMembers[0] || "";
}

function isAdminOrSpecialViewer(user) {
  const role = String(user?.role || "").trim().toLowerCase();
  const email = String(user?.email || "").trim().toLowerCase();
  return role === "admin" || EXTRA_VIEWER_EMAILS.has(email);
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const canSeeAllTeams = isAdminOrSpecialViewer(req.user);
    const hasYardProcessingPermission = userHasPermission(
      req.user,
      USER_PERMISSIONS.YARD_PROCESSING
    );

    if (!canSeeAllTeams && !hasYardProcessingPermission) {
      return res.status(403).json({
        message: "Access denied. Yard Processing statistics require Yard Processing access.",
      });
    }

    const requestedTeam = normalizeTeamName(req.query.team);
    const viewerTeam = normalizeTeamName(req.user?.team);
    const scopedTeam = canSeeAllTeams ? requestedTeam : viewerTeam;
    const allowedTeams = canSeeAllTeams
      ? REPORT_TEAMS
      : REPORT_TEAMS.includes(scopedTeam)
        ? [scopedTeam]
        : [];

    if (!canSeeAllTeams && !allowedTeams.length) {
      return res.status(403).json({
        message: "Your account is not assigned to Mavericks.",
      });
    }

    const queryTeams = requestedTeam && REPORT_TEAMS.includes(requestedTeam)
      ? [requestedTeam]
      : allowedTeams;

    const users = await User.find({
      role: "Support",
      team: { $in: queryTeams },
    })
      .select("firstName lastName team")
      .sort({ team: 1, firstName: 1, lastName: 1 })
      .lean();

    const teamMembersMap = new Map();
    for (const teamName of queryTeams) teamMembersMap.set(teamName, []);
    for (const user of users) {
      const teamName = normalizeTeamName(user?.team);
      if (!teamMembersMap.has(teamName)) continue;
      const fullName = String(user?.firstName || "").trim();
      if (!fullName) continue;
      teamMembersMap.get(teamName).push(fullName);
    }

    const { startDate, endExclusive } = buildDateRange(req.query);
    const Order = getOrderModelForBrand(req.brand);
    const orders = await Order.find({
      orderDate: { $gte: startDate, $lt: endExclusive },
      teamOrder: { $in: queryTeams },
    })
      .select("orderNo orderStatus teamOrder orderHistory")
      .lean();

    const rowsByTeam = new Map();
    const teamTotalsByName = new Map();
    const grandTotals = emptyMemberRow("All Teams", "Total");

    for (const teamName of queryTeams) {
      const members = teamMembersMap.get(teamName) || [];
      const rows = members.map((name) => emptyMemberRow(teamName, name));
      rowsByTeam.set(teamName, rows);
      teamTotalsByName.set(teamName, emptyMemberRow(teamName, "Total"));
    }

    for (const order of orders) {
      const teamName = normalizeTeamName(order?.teamOrder);
      if (!rowsByTeam.has(teamName)) continue;
      const bucket = bucketForOrderStatus(order?.orderStatus);
      if (!bucket) continue;

      const rows = rowsByTeam.get(teamName);
      if (!rows.length) continue;
      const memberNames = rows.map((row) => row.memberName);
      const owner = resolveResponsibleMember(order, memberNames);
      const row =
        rows.find((item) => item.memberName.toLowerCase() === owner.toLowerCase()) || rows[0];

      row.noOfOrders += 1;
      row[bucket] += 1;
      row.total += 1;

      const teamTotal = teamTotalsByName.get(teamName);
      teamTotal.noOfOrders += 1;
      teamTotal[bucket] += 1;
      teamTotal.total += 1;

      grandTotals.noOfOrders += 1;
      grandTotals[bucket] += 1;
      grandTotals.total += 1;
    }

    const teams = queryTeams.map((teamName) => ({
      teamName,
      rows: rowsByTeam.get(teamName) || [],
      totals: teamTotalsByName.get(teamName) || emptyMemberRow(teamName, "Total"),
    }));

    return res.json({
      filters: {
        teams: REPORT_TEAMS,
        activeTeam: requestedTeam && REPORT_TEAMS.includes(requestedTeam) ? requestedTeam : "ALL",
      },
      scope: {
        canSeeAllTeams,
        viewerTeam: viewerTeam || null,
        visibleTeams: queryTeams,
      },
      dateRange: {
        start: moment.tz(startDate, TZ).format("YYYY-MM-DD"),
        end: moment.tz(endExclusive, TZ).subtract(1, "millisecond").format("YYYY-MM-DD"),
      },
      teams,
      totals: grandTotals,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /orders/yardProcessingStatistics failed:", err);
    return res.status(500).json({
      message: "Failed to load Yard Processing statistics.",
      error: err.message,
    });
  }
});

export default router;
