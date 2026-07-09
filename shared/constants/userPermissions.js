/** Permission keys stored on User.permissions (string array). */
export const USER_PERMISSIONS = {
  INVOICES: "invoices",
  YARD_LOCATES: "yardLocates",
  YARD_PROCESSING: "yardProcessing",
  ESCALATION: "escalation",
  COLLECT_REFUND: "collectRefund",
};

/** Sidebar sections gated by these permissions (non-admin scoped users). */
export const SCOPED_PERMISSION_KEYS = [
  USER_PERMISSIONS.INVOICES,
  USER_PERMISSIONS.YARD_LOCATES,
  USER_PERMISSIONS.YARD_PROCESSING,
  USER_PERMISSIONS.ESCALATION,
  USER_PERMISSIONS.COLLECT_REFUND,
];

/** UI options for permission checkboxes. */
export const USER_PERMISSION_OPTIONS = [
  { key: USER_PERMISSIONS.INVOICES, label: "Invoices" },
  { key: USER_PERMISSIONS.YARD_LOCATES, label: "Yard Locates" },
  { key: USER_PERMISSIONS.YARD_PROCESSING, label: "Yard Processing" },
  { key: USER_PERMISSIONS.ESCALATION, label: "Escalation" },
  { key: USER_PERMISSIONS.COLLECT_REFUND, label: "Collect Refund" },
];

const GRANULAR_INVOICE_KEYS = new Set([
  "invoices.placed_orders",
  "invoices.customer_approved",
]);

const PERMISSION_ALIASES = {
  invoices: USER_PERMISSIONS.INVOICES,
  yardlocates: USER_PERMISSIONS.YARD_LOCATES,
  yard_locates: USER_PERMISSIONS.YARD_LOCATES,
  yardprocessing: USER_PERMISSIONS.YARD_PROCESSING,
  yard_processing: USER_PERMISSIONS.YARD_PROCESSING,
  escalation: USER_PERMISSIONS.ESCALATION,
  escalations: USER_PERMISSIONS.ESCALATION,
  collectrefund: USER_PERMISSIONS.COLLECT_REFUND,
  collect_refund: USER_PERMISSIONS.COLLECT_REFUND,
};

export function normalizePermissionKey(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (GRANULAR_INVOICE_KEYS.has(lower)) {
    return USER_PERMISSIONS.INVOICES;
  }
  if (PERMISSION_ALIASES[lower]) {
    return PERMISSION_ALIASES[lower];
  }
  if (SCOPED_PERMISSION_KEYS.includes(trimmed)) {
    return trimmed;
  }
  return lower;
}

export function normalizePermissionsList(permissions) {
  if (!Array.isArray(permissions)) return [];
  const seen = new Set();
  const out = [];
  for (const item of permissions) {
    const key = normalizePermissionKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Map old granular invoice keys to umbrella `invoices` for access checks. */
export function expandLegacyPermissions(permissions) {
  return normalizePermissionsList(permissions);
}

/** Top-level permission keys only — what we persist. */
export function permissionsForStorage(permissions) {
  return normalizePermissionsList(permissions).filter((key) =>
    SCOPED_PERMISSION_KEYS.includes(key)
  );
}

export function permissionsForEditor(permissions) {
  return permissionsForStorage(permissions);
}

export function userHasPermission(user, permissionKey) {
  const key = normalizePermissionKey(permissionKey);
  if (!key || !user) return false;
  return normalizePermissionsList(user.permissions).includes(key);
}

export function userHasPermissionList(permissions, permissionKey) {
  const key = normalizePermissionKey(permissionKey);
  if (!key) return false;
  return normalizePermissionsList(permissions).includes(key);
}

export function userHasAnyScopedPermission(user) {
  return SCOPED_PERMISSION_KEYS.some((key) => userHasPermission(user, key));
}

/** Comma-separated labels for table display. */
export function formatPermissionLabels(permissions) {
  const list = normalizePermissionsList(permissions);
  if (!list.length) return "—";

  const labels = USER_PERMISSION_OPTIONS.filter(({ key }) =>
    list.includes(key)
  ).map(({ label }) => label);

  const unknown = list.filter((k) => !USER_PERMISSION_OPTIONS.some((o) => o.key === k));
  const display = [...labels, ...unknown];
  return display.length ? display.join(", ") : "—";
}
