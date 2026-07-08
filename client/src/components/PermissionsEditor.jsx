import React, { useMemo } from "react";
import {
  USER_PERMISSION_OPTIONS,
  normalizePermissionsList,
  permissionsForStorage,
} from "../../../shared/constants/userPermissions.js";

/** Flat permission checkboxes (Invoices, Yard Locates, …). */
export default function PermissionsEditor({
  value,
  onChange,
  className = "",
  labelClassName = "text-sm text-white/90",
}) {
  const selected = useMemo(() => normalizePermissionsList(value), [value]);

  const togglePermission = (permissionKey, checked) => {
    const key = normalizePermissionsList([permissionKey])[0];
    if (!key) return;

    const next = checked
      ? [...new Set([...selected, key])]
      : selected.filter((p) => p !== key);

    onChange(permissionsForStorage(next));
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {USER_PERMISSION_OPTIONS.map(({ key, label }) => (
        <label
          key={key}
          className={`flex items-center gap-2 cursor-pointer ${labelClassName}`}
        >
          <input
            type="checkbox"
            checked={selected.includes(key)}
            onChange={(e) => togglePermission(key, e.target.checked)}
            className="h-4 w-4 accent-emerald-400 shrink-0"
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
