export default function Input(props) {
  const { className = "", ...p } = props;
  return (
    <input
      {...p}
      className={
        "w-full rounded-lg px-3 py-2 outline-none " +
        "bg-white/10 border border-white/30 text-white placeholder-white/60 " +
        "backdrop-blur-sm focus:ring-2 focus:ring-white/60 disabled:opacity-60 " +
        className
      }
    />
  );
}