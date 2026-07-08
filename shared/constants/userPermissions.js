/** Permission keys stored on User.permissions (string array). */
export const USER_PERMISSIONS = {
  /** @deprecated Legacy umbrella — treated as both invoice pages. */
  INVOICES: "invoices",
  INVOICES_PLACED_ORDERS: "invoices.placed_orders",
  INVOICES_CUSTOMER_APPROVED: "invoices.customer_approved",
};

export const INVOICE_PAGE_PERMISSIONS = [
  USER_PERMISSIONS.INVOICES_PLACED_ORDERS,
  USER_PERMISSIONS.INVOICES_CUSTOMER_APPROVED,
];

/** UI options for permission checkboxes (add new top-level groups here as permissions grow). */
export const USER_PERMISSION_OPTIONS = [
  {
    key: "group:invoices",
    label: "Invoices",
    children: [
      { key: USER_PERMISSIONS.INVOICES_PLACED_ORDERS, label: "Placed Orders" },
      { key: USER_PERMISSIONS.INVOICES_CUSTOMER_APPROVED, label: "Customer Approved" },
    ],
  },
];

const ALL_KNOWN_PERMISSION_KEYS = new Set([
  USER_PERMISSIONS.INVOICES,
  ...INVOICE_PAGE_PERMISSIONS,
]);

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

/** Expand legacy `invoices` to both page keys for access checks. */
export function expandLegacyPermissions(permissions) {
  const list = normalizePermissionsList(permissions);
  if (list.includes(USER_PERMISSIONS.INVOICES)) {
    return [...new Set([...list, ...INVOICE_PAGE_PERMISSIONS])];
  }
  return list;
}

/** Leaf keys only — what we persist (no group keys, no legacy umbrella). */
export function permissionsForStorage(permissions) {
  return normalizePermissionsList(permissions).filter(
    (key) => key !== USER_PERMISSIONS.INVOICES && !key.startsWith("group:")
  );
}

/** Load into editor: expand legacy umbrella, then leaf keys only. */
export function permissionsForEditor(permissions) {
  return permissionsForStorage(expandLegacyPermissions(permissions));
}

export function userHasPermission(user, permissionKey) {
  const key = normalizePermissionKey(permissionKey);
  if (!key || !user) return false;
  const list = expandLegacyPermissions(user.permissions);
  return list.includes(key);
}

export function userHasAnyInvoicePagePermission(user) {
  return INVOICE_PAGE_PERMISSIONS.some((key) => userHasPermission(user, key));
}

export function userHasPermissionList(permissions, permissionKey) {
  const key = normalizePermissionKey(permissionKey);
  if (!key) return false;
  const list = expandLegacyPermissions(permissions);
  return list.includes(key);
}

/** Comma-separated labels for table display. */
export function formatPermissionLabels(permissions) {
  const list = expandLegacyPermissions(permissions);
  if (!list.length) return "—";

  const parts = [];
  for (const option of USER_PERMISSION_OPTIONS) {
    if (option.children?.length) {
      const childLabels = option.children
        .filter(({ key }) => list.includes(normalizePermissionKey(key)))
        .map(({ label }) => label);
      if (childLabels.length) {
        parts.push(`${option.label}: ${childLabels.join(", ")}`);
      }
      continue;
    }
    if (list.includes(normalizePermissionKey(option.key))) {
      parts.push(option.label);
    }
  }

  const unknown = list.filter((k) => !ALL_KNOWN_PERMISSION_KEYS.has(k));
  const display = [...parts, ...unknown];
  return display.length ? display.join("; ") : "—";
}
