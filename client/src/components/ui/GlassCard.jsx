// src/components/ui/GlassCard.jsx
export default function GlassCard({ title, actions, children, className = "" }) {
  return (
    <section
      className={`rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-white/5 overflow-visible ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between px-4 py-3 border-b border-white/15 bg-white/10 dark:bg-transparent">
          <h3 className="font-semibold">{title}</h3>
          <div className="flex gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4 flex-1 flex flex-col min-h-0">{children}</div>
    </section>
  );
}
