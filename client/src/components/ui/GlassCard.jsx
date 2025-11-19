// src/components/ui/GlassCard.jsx
export default function GlassCard({ title, actions, children, className = "" }) {
  return (
    <section
      className={`rounded-2xl border border-gray-200 bg-blue-50 text-[#09325d] shadow-md dark:border-white/20 dark:bg-white/10 dark:text-white dark:shadow-lg dark:backdrop-blur-md overflow-hidden ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-blue-50 dark:border-white/15 dark:bg-white/10">
          <h3 className="font-semibold text-[#09325d] dark:text-white">{title}</h3>
          <div className="flex gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4 flex-1 flex flex-col min-h-0">{children}</div>
    </section>
  );
}
