/** Permission keys stored on User.permissions (string array). */
export const USER_PERMISSIONS = {
  INVOICES: "invoices",
  YARD_LOCATES: "yardLocates",
};

/** UI options for permission checkboxes. */
export const USER_PERMISSION_OPTIONS = [
  { key: USER_PERMISSIONS.INVOICES, label: "Invoices" },
  { key: USER_PERMISSIONS.YARD_LOCATES, label: "Yard Locates" },
];

const GRANULAR_INVOICE_KEYS = new Set([
  "invoices.placed_orders",
  "invoices.customer_approved",
]);

export function normalizePermissionKey(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower === "invoices" || GRANULAR_INVOICE_KEYS.has(lower)) {
    return USER_PERMISSIONS.INVOICES;
  }
  if (lower === "yardlocates" || lower === "yard_locates") {
    return USER_PERMISSIONS.YARD_LOCATES;
  }
  if (trimmed === USER_PERMISSIONS.YARD_LOCATES) {
    return USER_PERMISSIONS.YARD_LOCATES;
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
  return normalizePermissionsList(permissions).filter(
    (key) => key === USER_PERMISSIONS.INVOICES || key === USER_PERMISSIONS.YARD_LOCATES
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
