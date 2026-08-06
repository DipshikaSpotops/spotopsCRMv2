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

/**
 * Ops teams from the org chart (no "Team " prefix).
 * Existing Team documents are never deleted; these names are created if missing.
 */
export const OPS_TEAMS = [
  {
    teamName: "Mavericks",
    members: [
      { firstName: "Tyler", roleKey: "yardLocate" },
      { firstName: "Natasha", roleKey: "yardProcessingEscalation" },
      { firstName: "Rhea", roleKey: "yardProcessingEscalation" },
      { firstName: "Hardin", roleKey: "yardProcessingEscalation" },
      { firstName: "Alex", roleKey: "invoicesRefund" },
    ],
  },
  {
    teamName: "Invicibles",
    members: [
      { firstName: "Amy", roleKey: "yardLocate" },
      { firstName: "Suzanne", roleKey: "yardProcessingEscalation" },
      { firstName: "Duke", roleKey: "yardProcessingEscalation" },
      { firstName: "Steve", roleKey: "yardProcessingEscalation" },
      { firstName: "Mona", roleKey: "invoicesRefund" },
    ],
  },
  {
    teamName: "High Clouds",
    members: [
      { firstName: "Nik", roleKey: "yardLocate" },
      { firstName: "Max", roleKey: "yardProcessingEscalation" },
      { firstName: "Adam", roleKey: "yardProcessingEscalation" },
      { firstName: "Chris", roleKey: "yardProcessingEscalation" },
      { firstName: "Stella", roleKey: "invoicesRefund" },
    ],
  },
];

/** Old / alternate names → current ops team name (never deletes old Team docs). */
export const OPS_TEAM_NAME_ALIASES = {
  "Team Mavericks": "Mavericks",
  Mavericks: "Mavericks",
  "Team Invicibles": "Invicibles",
  Invicibles: "Invicibles",
  Invisibles: "Invicibles",
  "Team Invisibles": "Invicibles",
  "Team High Clouds": "High Clouds",
  "High Clouds": "High Clouds",
};

export function permissionsForOpsRole(roleKey) {
  return OPS_ROLE_PERMISSIONS[roleKey] || [];
}
