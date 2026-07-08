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
