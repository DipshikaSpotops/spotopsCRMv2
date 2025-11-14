import React from "react";

export function SelectItem({ children }) {
  return <>{children}</>;
}

export function SelectValue() {
  return null;
}

export function SelectTrigger({ children, className }) {
  // just a marker; className is picked up by <Select/>
  return <span data-select-trigger className={className}>{children}</span>;
}

export function SelectContent({ children }) {
  return <>{children}</>;
}

// Store references for comparison (needed for production builds where function names might be minified)
const SelectItemRef = SelectItem;
const SelectValueRef = SelectValue;
const SelectTriggerRef = SelectTrigger;
const SelectContentRef = SelectContent;

export default function Select({ value, onValueChange, children }) {
  let triggerClassName = "";
  let placeholder;
  const items = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const type = child.type;
    const typeName = type?.name || type?.displayName;
    // Also check if it's the actual function reference (for production builds)
    const isSelectTrigger = typeName === "SelectTrigger" || type === SelectTriggerRef;
    const isSelectContent = typeName === "SelectContent" || type === SelectContentRef;
    const isSelectValue = typeName === "SelectValue" || type === SelectValueRef;
    const isSelectItem = typeName === "SelectItem" || type === SelectItemRef;

    if (isSelectTrigger) {
      triggerClassName = child.props?.className || "";
      React.Children.forEach(child.props?.children, (inner) => {
        if (!React.isValidElement(inner)) return;
        const innerType = inner.type;
        const innerTypeName = innerType?.name || innerType?.displayName;
        if (innerTypeName === "SelectValue" || innerType === SelectValueRef) {
          placeholder = inner.props?.placeholder;
        }
      });
    }

    if (isSelectContent) {
      React.Children.forEach(child.props?.children, (itemNode) => {
        if (!React.isValidElement(itemNode)) return;
        const itemType = itemNode.type;
        const itemTypeName = itemType?.name || itemType?.displayName;
        // Check by component reference or name (works in both dev and production)
        if (itemTypeName === "SelectItem" || itemType === SelectItemRef) {
          items.push({
            value: itemNode.props?.value,
            label: itemNode.props?.children,
          });
        }
      });
    }
  });

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onValueChange(e.target.value)}
      className={[
        "w-full rounded-lg px-3 py-2 outline-none disabled:opacity-70",
        "bg-white/10 border border-white/30 text-white backdrop-blur-sm",
        "focus:ring-2 focus:ring-white/60",
        triggerClassName,
      ].join(" ")}
    >
      {placeholder && (
        <option value="" disabled hidden>
          {placeholder}
        </option>
      )}
      {items.map((it) => (
        <option key={it.value} value={it.value}>
          {it.label}
        </option>
      ))}
    </select>
  );
}
