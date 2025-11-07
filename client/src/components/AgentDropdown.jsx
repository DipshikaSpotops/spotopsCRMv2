import React from "react";

const AgentDropdown = ({
  options = [],
  value,
  onChange,
  className = "",
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`
        px-3 py-2 rounded-md bg-[#04356d] hover:bg-[#3b89bf]
        text-white border border-white/20 text-sm text-center
        focus:outline-none focus:ring-2 focus:ring-white/30 under cursor-pointer
        ${className}
      `}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt === "Select" ? "Select Sales-agent" : opt}
        </option>
      ))}
    </select>
  );
};

export default AgentDropdown;
