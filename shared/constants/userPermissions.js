/** Permission keys stored on User.permissions (string array). */
export const USER_PERMISSIONS = {
  INVOICES: "invoices",
};

/** UI options for permission checkboxes (add new entries here as permissions grow). */
export const USER_PERMISSION_OPTIONS = [
  { key: USER_PERMISSIONS.INVOICES, label: "Invoices" },
];

export function normalizePermissionKey(value) {
  return String(value || "").trim().toLowerCase();
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

export function userHasPermission(user, permissionKey) {
  const key = normalizePermissionKey(permissionKey);
  if (!key || !user) return false;
  const list = normalizePermissionsList(user.permissions);
  return list.includes(key);
}

/** Comma-separated labels for table display (e.g. "Invoices, Reports"). */
export function formatPermissionLabels(permissions) {
  const normalized = normalizePermissionsList(permissions);
  if (!normalized.length) return "—";

  const knownKeys = new Set(USER_PERMISSION_OPTIONS.map((o) => o.key));
  const labels = USER_PERMISSION_OPTIONS
    .filter(({ key }) => normalized.includes(key))
    .map(({ label }) => label);
  const unknown = normalized.filter((k) => !knownKeys.has(k));

  const display = [...labels, ...unknown];
  return display.length ? display.join(", ") : "—";
}
