// src/components/ui/GlassCard.jsx
export default function GlassCard({ title, actions, children }) {
  return (
    <section className="rounded-2xl overflow-hidden shadow-md backdrop-blur-sm
                        bg-white/30 text-white dark:bg-white/5">
      {(title || actions) && (
        <header className="flex items-center justify-between px-4 py-3 border-b border-white/20">
          <h3 className="font-semibold">{title}</h3>
          <div className="flex gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
