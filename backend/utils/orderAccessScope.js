import User from "../models/User.js";

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

async function getTeamSalesFirstNames(teamName) {
  const team = String(teamName || "").trim();
  if (!team) return [];

  const users = await User.find({ team, role: "Sales" })
    .select("firstName")
    .lean();

  return [...new Set(users.map((u) => String(u.firstName || "").trim()).filter(Boolean))];
}

export function attachSalesAgentScope(filter, salesAgentScope) {
  if (!salesAgentScope) return filter;

  const clause = { salesAgent: salesAgentScope };

  if (filter.$and) {
    filter.$and.push(clause);
    return filter;
  }

  if (filter.$or) {
    filter.$and = [{ $or: filter.$or }, clause];
    delete filter.$or;
    return filter;
  }

  filter.salesAgent = salesAgentScope;
  return filter;
}

async function getSalesAgentScopeForUser(user, brand) {
  if (!user || user.role === "Admin") {
    return null;
  }

  const team = String(user.team || "").trim();
  if (team) {
    const firstNames = await getTeamSalesFirstNames(team);
    const scope = buildSalesAgentScopeFromFirstNames(firstNames, brand);
    return scope || { $in: [] };
  }

  if (user.role === "Sales") {
    return buildSalesAgentScopeFromFirstNames([user.firstName], brand);
  }

  return null;
}

/**
 * Merge team/salesAgent access into a Mongo filter.
 * - Admin: optional adminSalesAgent query narrows results
 * - User with team: all Sales users on that team
 * - Sales without team: own orders only
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

  const scope = await getSalesAgentScopeForUser(user, brand);
  attachSalesAgentScope(filter, scope);
  return filter;
}

/**
 * Apply salesAgent scope for list queries.
 * @deprecated Prefer mergeOrderAccessFilter
 */
export async function applyTeamOrderScope(filter, user, brand) {
  const scope = await getSalesAgentScopeForUser(user, brand);
  if (scope) {
    filter.salesAgent = scope;
  }
  return filter;
}
