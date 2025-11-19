export default function Stat({ label, value, compact = false }) {
  return (
    <div
      className={`rounded-2xl bg-blue-50 border border-gray-200 transition-all duration-200 hover:scale-[1.02] hover:bg-blue-100 hover:shadow-md text-[#09325d] overflow-hidden dark:bg-white/10 dark:backdrop-blur-md dark:border-white/20 dark:hover:bg-white/20 dark:text-white ${
        compact ? "px-3 py-2" : "p-3"
      }`}
    >
      <div className={`flex items-baseline gap-2 ${compact ? "text-sm" : ""}`}>
        <span className="text-xs uppercase tracking-wide text-[#09325d]/80 dark:text-white/70">
          {label}:
        </span>
        <span className="text-base font-semibold text-[#09325d] dark:text-white">{value}</span>
      </div>
    </div>
  );
}
