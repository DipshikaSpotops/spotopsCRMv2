export default function Stat({ label, value }) {
  return (
    <div className="rounded-2xl p-3 bg-white/10 backdrop-blur-md shadow-md border border-white/20 transition-all duration-200 hover:scale-[1.02] hover:bg-white/20 text-white">
      <div className="flex items-baseline gap-2">
        <span className="text-xs uppercase tracking-wide text-white/70">{label}:</span>
        <span className="text-base font-semibold">{value}</span>
      </div>
    </div>
  );
}
