import React from "react";

export default function SearchBar({
  value,
  onChange,
  onApply,  // (q: string) => void
  onClear,  // () => void
  placeholder = "Search… (press Enter)",
  className = "",
  minWidth = "min-w-[260px]",
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply?.(value.trim());
      }}
      className={`relative flex w-full sm:w-auto ${className}`}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClear?.();
        }}
        placeholder={placeholder}
        className={`px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 ${minWidth}`}
        aria-label="Search"
      />
      {value && (
        <button
          type="button"
          onClick={() => onClear?.()}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
          aria-label="Clear search"
          title="Clear"
        >
          ×
        </button>
      )}
      <input type="submit" hidden />
    </form>
  );
}
