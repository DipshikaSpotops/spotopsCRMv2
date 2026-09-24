import { USER_PERMISSIONS } from "./userPermissions.js";

/** Permissions for roles on the 50 Stars ops roster. */
export const OPS_ROLE_PERMISSIONS = {
  yardLocate: [USER_PERMISSIONS.YARD_LOCATES],
  yardProcessingEscalation: [
    USER_PERMISSIONS.YARD_PROCESSING,
    USER_PERMISSIONS.ESCALATION,
  ],
  invoicesRefund: [
    USER_PERMISSIONS.INVOICES,
    USER_PERMISSIONS.COLLECT_REFUND,
  ],
};

/** Single shared ops team for all Support users (Sales stay off teams). */
export const PRIMARY_OPS_TEAM = "Mavericks";

/**
 * Ops teams from the org chart (no "Team " prefix).
 * Everyone is on Mavericks; Invincibles / High Clouds docs are not deleted.
 */
export const OPS_TEAMS = [
  {
    teamName: PRIMARY_OPS_TEAM,
    members: [
      { firstName: "Tyler", roleKey: "yardLocate" },
      { firstName: "Sunny", roleKey: "yardProcessingEscalation" },
      { firstName: "Rhea", roleKey: "yardProcessingEscalation" },
      { firstName: "Hardin", roleKey: "yardProcessingEscalation" },
      { firstName: "Alex", roleKey: "invoicesRefund" },
      { firstName: "Amy", roleKey: "yardLocate" },
      { firstName: "Suzanne", roleKey: "yardProcessingEscalation" },
      { firstName: "Duke", roleKey: "yardProcessingEscalation" },
      { firstName: "Steve", roleKey: "yardProcessingEscalation" },
      { firstName: "Mona", roleKey: "invoicesRefund" },
      { firstName: "Nik", roleKey: "yardLocate" },
      { firstName: "Max", roleKey: "yardProcessingEscalation" },
      { firstName: "Adam", roleKey: "yardProcessingEscalation" },
      { firstName: "Chris", roleKey: "yardProcessingEscalation" },
      { firstName: "Kevin", roleKey: "invoicesRefund" },
    ],
  },
];

/**
 * Old / alternate names → Mavericks.
 * Used to remapping user.team and order.teamOrder (never deletes Team docs).
 */
export const OPS_TEAM_NAME_ALIASES = {
  "Team Maverick": PRIMARY_OPS_TEAM,
  "Team Mavericks": PRIMARY_OPS_TEAM,
  Maverick: PRIMARY_OPS_TEAM,
  Mavericks: PRIMARY_OPS_TEAM,
  "Team Invicibles": PRIMARY_OPS_TEAM,
  Invicibles: PRIMARY_OPS_TEAM,
  "Team Invincibles": PRIMARY_OPS_TEAM,
  Invincibles: PRIMARY_OPS_TEAM,
  Invisibles: PRIMARY_OPS_TEAM,
  "Team Invisibles": PRIMARY_OPS_TEAM,
  "Team High Clouds": PRIMARY_OPS_TEAM,
  "High Clouds": PRIMARY_OPS_TEAM,
};

export function permissionsForOpsRole(roleKey) {
  return OPS_ROLE_PERMISSIONS[roleKey] || [];
}
