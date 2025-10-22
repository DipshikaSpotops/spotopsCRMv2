export default function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-white/80">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}