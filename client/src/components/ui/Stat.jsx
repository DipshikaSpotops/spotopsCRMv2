export default function Stat({ label, value, compact = false }) {
  return (
    <div
      className={`rounded-2xl bg-white/10 backdrop-blur-md shadow-md border border-white/20 transition-all duration-200 hover:scale-[1.02] hover:bg-white/20 text-white ${
        compact ? "px-3 py-2" : "p-3"
      }`}
    >
      <div className={`flex items-baseline gap-2 ${compact ? "text-sm" : ""}`}>
        <span className="text-xs uppercase tracking-wide text-white/70">
          {label}:
        </span>
        <span className="text-base font-semibold">{value}</span>
      </div>
    </div>
  );
}
