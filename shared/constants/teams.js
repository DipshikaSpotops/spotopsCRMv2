/** Special team: members see all orders (not scoped to team agents). */
export const COMMON_TEAM_NAME = "Common";

export function isCommonTeam(teamName) {
  return String(teamName || "").trim().toLowerCase() === COMMON_TEAM_NAME.toLowerCase();
}
