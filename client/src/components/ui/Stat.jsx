export default function Stat({ label, value, compact = false }) {
  return (
    <div
      className={`stat-card rounded-2xl border border-gray-200 transition-all duration-200 hover:scale-[1.02] hover:shadow-md text-white overflow-hidden ${
        compact ? "px-3 py-2" : "p-3"
      }`}
    >
      <div className={`flex items-baseline gap-2 ${compact ? "text-sm" : ""}`}>
        <span className="text-xs uppercase tracking-wide text-white/90">
          {label}:
        </span>
        <span className="text-base font-semibold text-white">{value}</span>
      </div>
    </div>
  );
}
