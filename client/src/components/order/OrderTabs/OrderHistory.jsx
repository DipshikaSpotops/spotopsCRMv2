import GlassCard from "../../ui/GlassCard";

export default function OrderHistory({ timeline, loading, error }) {
  return (
    <div className="sticky top-20 space-y-6">
      <GlassCard title="Order History">
        {loading ? (
          <div className="text-[#04356d]/70 dark:text-white/70">Loading…</div>
        ) : error ? (
          <div className="text-red-600 dark:text-red-300">{error}</div>
        ) : !timeline?.length ? (
          <div className="text-[#04356d]/70 dark:text-white/70">No history yet.</div>
        ) : (
          <div className="relative max-h-[34rem] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-white/30">
            <ul className="pl-8 space-y-4 border-l border-dashed border-gray-300 dark:border-white/20">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-2 top-3 h-3 w-3 rounded-full ring-2 ring-gray-300 bg-[#04356d] dark:ring-white/40 dark:bg-[#080b5a]" />
                  <div className="rounded-lg border border-gray-200 bg-[#e0f2f7] p-3 shadow-sm text-[#04356d] dark:border-white/20 dark:bg-white/10 dark:text-white dark:backdrop-blur-md">
                    <div className="font-medium">{t.event || t.text}</div>
                    {(t.by || t.when) && (
                      <div className="mt-1 text-xs text-[#04356d]/70 dark:text-white/70">
                        {t.by && t.when ? `${t.by} on ${t.when}` : t.by || t.when || ""}
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
