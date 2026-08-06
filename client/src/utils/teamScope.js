import { isCommonTeam } from "../../../shared/constants/teams.js";

/**
 * Team on an order comes only from explicit assignment (order.teamOrder).
 * Sales agents are not on teams and are never used for Team display.
 */
export function resolveOrderTeam(order) {
  const assigned = String(order?.teamOrder || "").trim();
  return assigned || "—";
}

/** @deprecated Sales agents are not mapped to teams. */
export function resolveTeamForSalesAgent() {
  return "—";
}

export function readAuthUserTeam() {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      return String(parsed?.user?.team || "").trim();
    }
  } catch {}
  return "";
}

export function readAuthUserRole() {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      return String(parsed?.user?.role || "").trim();
    }
  } catch {}
  return localStorage.getItem("role") || "";
}

export function currentUserIsCommonTeam() {
  return isCommonTeam(readAuthUserTeam());
}

/** Admin + Common team members see the Team column on order lists. */
export function currentUserSeesTeamColumn() {
  if (String(readAuthUserRole()).toLowerCase() === "admin") return true;
  return currentUserIsCommonTeam();
}
