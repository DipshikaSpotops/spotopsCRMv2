export default function Pill({ children, className = "" }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border bg-white/10 text-white border-white/20 ${className}`}>
      {children}
    </span>
  );
}
