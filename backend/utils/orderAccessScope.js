import LegacySalesTeamMap from "../models/LegacySalesTeamMap.js";
import User from "../models/User.js";
import { isCommonTeam } from "../../shared/constants/teams.js";

/** 50STARS firstName → PROLANE/PROTP salesAgent firstName on orders */
export const AGENT_BRAND_MAPPING = {
  Richard: "Victor",
  Mark: "Sam",
  David: "Steve",
  Michael: "Charlie",
  Dipsikha: "Dipsikha",
};

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isProlaneBrand(brand) {
  return brand === "PROLANE" || brand === "PROTP";
}

/** Regexes matching order.salesAgent for one agent firstName (handles full-name legacy values). */
export function salesAgentRegexesForFirstName(firstName, brand) {
  const trimmed = String(firstName || "").trim();
  if (!trimmed) return [];

  const names = new Set([trimmed]);
  if (isProlaneBrand(brand) && AGENT_BRAND_MAPPING[trimmed]) {
    names.add(AGENT_BRAND_MAPPING[trimmed]);
  }

  return [...names].map((name) => {
    const escaped = escapeRegex(name);
    return new RegExp(`^${escaped}(?:\\s.*|$)`, "i");
  });
}

export function buildSalesAgentScopeFromFirstNames(firstNames = [], brand) {
  const regexes = [];
  const seen = new Set();

  for (const firstName of firstNames) {
    for (const regex of salesAgentRegexesForFirstName(firstName, brand)) {
      const key = regex.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      regexes.push(regex);
    }
  }

  if (regexes.length === 0) return null;
  if (regexes.length === 1) return regexes[0];
  return { $in: regexes };
}

export function attachSalesAgentScope(filter, salesAgentScope) {
  if (!salesAgentScope) return filter;

  const clause = { salesAgent: salesAgentScope };
  return attachFilterClause(filter, clause);
}

/** Orders not yet assigned to a team (Assign Orders queue). */
export function unassignedTeamOrderClause() {
  return {
    $or: [
      { teamOrder: { $exists: false } },
      { teamOrder: null },
      { teamOrder: "" },
    ],
  };
}

/** Orders that have been assigned to a team. */
export function assignedTeamOrderClause() {
  return {
    teamOrder: { $exists: true, $nin: [null, ""] },
  };
}

function attachFilterClause(filter, clause) {
  if (!clause) return filter;

  if (filter.$and) {
    filter.$and.push(clause);
    return filter;
  }

  if (filter.$or) {
    filter.$and = [{ $or: filter.$or }, clause];
    delete filter.$or;
    return filter;
  }

  Object.assign(filter, clause);
  return filter;
}

export function attachTeamOrderScope(filter, teamName) {
  const team = String(teamName || "").trim();
  if (!team) return filter;
  const escaped = escapeRegex(team);
  return attachFilterClause(filter, {
    teamOrder: new RegExp(`^${escaped}$`, "i"),
  });
}

/** Live Sales still on a team + frozen legacy snapshot for that team. */
async function getLegacySalesFirstNamesForTeam(teamName) {
  const team = String(teamName || "").trim();
  if (!team || isCommonTeam(team)) return [];

  const teamRegex = new RegExp(`^${escapeRegex(team)}$`, "i");

  const [liveSales, legacyRows] = await Promise.all([
    User.find({ role: "Sales", team: teamRegex }).select("firstName").lean(),
    LegacySalesTeamMap.find({ team: teamRegex }).select("firstName").lean(),
  ]);

  const names = new Set();
  for (const u of liveSales) {
    const n = String(u.firstName || "").trim();
    if (n) names.add(n);
  }
  for (const row of legacyRows) {
    const n = String(row.firstName || "").trim();
    if (n) names.add(n);
  }
  return [...names];
}

/**
 * Team users see:
 * 1) New flow: orders with teamOrder matching their team
 * 2) Legacy flow: unassigned teamOrder + salesAgent from (live or snapshot) team sales
 */
async function attachTeamAccessScope(filter, teamName, brand) {
  const team = String(teamName || "").trim();
  if (!team) return filter;

  const escaped = escapeRegex(team);
  const teamOrderMatch = { teamOrder: new RegExp(`^${escaped}$`, "i") };

  const legacyNames = await getLegacySalesFirstNamesForTeam(team);
  const salesScope = buildSalesAgentScopeFromFirstNames(legacyNames, brand);

  if (!salesScope) {
    return attachFilterClause(filter, teamOrderMatch);
  }

  const legacyMatch = {
    $and: [unassignedTeamOrderClause(), { salesAgent: salesScope }],
  };

  return attachFilterClause(filter, {
    $or: [teamOrderMatch, legacyMatch],
  });
}

/**
 * Merge team / sales access into a Mongo filter.
 * - Admin: optional adminSalesAgent query only
 * - Common team: no restriction
 * - User with team: teamOrder match OR legacy salesAgent scope for unassigned orders
 * - Sales without team: own salesAgent orders only
 * - Support without team: no restriction
 */
export async function mergeOrderAccessFilter(filter, req, options = {}) {
  const user = req.user;
  const brand = req.brand || "50STARS";
  const { adminSalesAgent } = options;

  if (!user) return filter;

  if (user.role === "Admin") {
    const agent = String(adminSalesAgent || "").trim();
    if (agent) {
      const scope = buildSalesAgentScopeFromFirstNames([agent], brand);
      attachSalesAgentScope(filter, scope);
    }
    return filter;
  }

  const team = String(user.team || "").trim();
  if (isCommonTeam(team)) {
    return filter;
  }

  if (team) {
    await attachTeamAccessScope(filter, team, brand);
    return filter;
  }

  if (user.role === "Sales") {
    const scope = buildSalesAgentScopeFromFirstNames([user.firstName], brand);
    attachSalesAgentScope(filter, scope);
    return filter;
  }

  return filter;
}

/**
 * Apply salesAgent scope for list queries.
 * @deprecated Prefer mergeOrderAccessFilter
 */
export async function applyTeamOrderScope(filter, user, brand) {
  const team = String(user?.team || "").trim();
  if (team && !isCommonTeam(team)) {
    await attachTeamAccessScope(filter, team, brand);
    return filter;
  }
  if (user?.role === "Sales") {
    const scope = buildSalesAgentScopeFromFirstNames([user.firstName], brand);
    if (scope) filter.salesAgent = scope;
  }
  return filter;
}
