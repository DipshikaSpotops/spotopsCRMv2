import { isCommonTeam } from "../../../shared/constants/teams.js";

/**
 * Resolve which team an order's salesAgent belongs to, using a
 * firstName → teamName map from GET /teams/sales-agent-map.
 */
export function resolveTeamForSalesAgent(salesAgent, agentTeamMap) {
  if (!agentTeamMap || typeof agentTeamMap !== "object") return "—";
  const raw = String(salesAgent || "").trim();
  if (!raw) return "—";

  const lowerMap = {};
  for (const [k, v] of Object.entries(agentTeamMap)) {
    lowerMap[String(k).toLowerCase()] = v;
  }

  const lower = raw.toLowerCase();
  if (lowerMap[lower]) return lowerMap[lower];

  const first = lower.split(/\s+/)[0];
  if (first && lowerMap[first]) return lowerMap[first];

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
