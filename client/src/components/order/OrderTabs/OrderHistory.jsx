import GlassCard from "../../ui/GlassCard";

export default function OrderHistory({ timeline, loading, error }) {
  return (
    <div className="sticky top-20 space-y-6">
      <GlassCard title="Order History">
        {loading ? (
          <div className="text-white/70">Loading…</div>
        ) : error ? (
          <div className="text-red-300">{error}</div>
        ) : !timeline?.length ? (
          <div className="text-white/70">No history yet.</div>
        ) : (
          <div className="relative max-h-[34rem] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent">
            <ul className="pl-8 space-y-4 border-l border-white/30 dark:border-white/20">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-2 top-3 h-3 w-3 rounded-full ring-2 ring-white/40 bg-[#9370d3] dark:bg-[#080b5a]" />
                  <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-3 shadow-sm text-white">
                    <div className="font-medium">{t.event || t.text}</div>
                    {(t.by || t.when) && (
                      <div className="mt-1 text-xs text-white/70">
                        {t.by ? `${t.by} on ` : ""}{t.when || ""}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
