import React, { useEffect, useMemo, useState } from "react";
import {
  USER_PERMISSION_OPTIONS,
  USER_PERMISSIONS,
  normalizePermissionsList,
  permissionsForStorage,
  userHasPermissionList,
} from "../../../shared/constants/userPermissions.js";

/**
 * Checkbox tree for user permissions.
 * Invoices parent reveals page checkboxes; only selected page keys are stored.
 */
export default function PermissionsEditor({
  value,
  onChange,
  className = "",
  labelClassName = "text-sm text-white/90",
  childIndentClassName = "ml-6",
}) {
  const selected = useMemo(() => normalizePermissionsList(value), [value]);

  const invoicesOption = USER_PERMISSION_OPTIONS.find((o) => o.children?.length);
  const invoiceChildKeys = useMemo(
    () => (invoicesOption?.children || []).map((c) => c.key),
    [invoicesOption]
  );

  const hasInvoiceSelection = useMemo(
    () =>
      invoiceChildKeys.some((key) => userHasPermissionList(selected, key)) ||
      selected.includes(USER_PERMISSIONS.INVOICES),
    [selected, invoiceChildKeys]
  );

  const [invoicesOpen, setInvoicesOpen] = useState(hasInvoiceSelection);

  useEffect(() => {
    if (hasInvoiceSelection) setInvoicesOpen(true);
  }, [hasInvoiceSelection]);

  const setSelected = (next) => {
    onChange(permissionsForStorage(next));
  };

  const toggleInvoiceParent = (checked) => {
    setInvoicesOpen(checked);
    if (!checked) {
      setSelected(
        selected.filter(
          (key) =>
            !invoiceChildKeys.includes(key) && key !== USER_PERMISSIONS.INVOICES
        )
      );
    }
  };

  const togglePermission = (permissionKey, checked) => {
    const key = normalizePermissionsList([permissionKey])[0];
    if (!key) return;

    let next = selected.filter((p) => p !== USER_PERMISSIONS.INVOICES);
    if (checked) {
      next = [...new Set([...next, key])];
      if (invoiceChildKeys.includes(key)) setInvoicesOpen(true);
    } else {
      next = next.filter((p) => p !== key);
    }
    setSelected(next);
  };

  if (!invoicesOption) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <label className={`flex items-center gap-2 cursor-pointer ${labelClassName}`}>
        <input
          type="checkbox"
          checked={invoicesOpen || hasInvoiceSelection}
          onChange={(e) => toggleInvoiceParent(e.target.checked)}
          className="h-4 w-4 accent-emerald-400 shrink-0"
        />
        <span className="font-medium">{invoicesOption.label}</span>
      </label>

      {invoicesOpen && (
        <div className={`space-y-2 ${childIndentClassName}`}>
          {invoicesOption.children.map(({ key, label }) => (
            <label
              key={key}
              className={`flex items-center gap-2 cursor-pointer ${labelClassName}`}
            >
              <input
                type="checkbox"
                checked={userHasPermissionList(selected, key)}
                onChange={(e) => togglePermission(key, e.target.checked)}
                className="h-4 w-4 accent-emerald-400 shrink-0"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
