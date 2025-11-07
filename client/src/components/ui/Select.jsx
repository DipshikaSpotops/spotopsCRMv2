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

export default function Select({ value, onValueChange, children }) {
  let triggerClassName = "";
  let placeholder;
  const items = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const type = child.type?.name;

    if (type === "SelectTrigger") {
      triggerClassName = child.props?.className || "";
      React.Children.forEach(child.props?.children, (inner) => {
        if (!React.isValidElement(inner)) return;
        if (inner.type?.name === "SelectValue") {
          placeholder = inner.props?.placeholder;
        }
      });
    }

    if (type === "SelectContent") {
      React.Children.forEach(child.props?.children, (itemNode) => {
        if (!React.isValidElement(itemNode)) return;
        if (itemNode.type?.name === "SelectItem") {
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
