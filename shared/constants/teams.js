import { PRIMARY_OPS_TEAM } from "./opsTeams.js";

/** Special team: members see all orders (not scoped to team agents). */
export const COMMON_TEAM_NAME = "Common";

export function isCommonTeam(teamName) {
  return String(teamName || "").trim().toLowerCase() === COMMON_TEAM_NAME.toLowerCase();
}

/**
 * Teams that are not row-scoped by order.teamOrder.
 * Common (legacy) + Mavericks (single shared ops team) see every order,
 * including unassigned ones.
 */
export function teamSeesAllOrders(teamName) {
  const team = String(teamName || "").trim().toLowerCase();
  if (!team) return false;
  if (isCommonTeam(teamName)) return true;
  return team === String(PRIMARY_OPS_TEAM).trim().toLowerCase();
}
