export default function Select(props) {
  const { className = "", ...p } = props;
  return (
    <select
      {...p}
      className={
        "w-full rounded-lg px-3 py-2 outline-none disabled:opacity-70 " +
        "bg-white/10 border border-white/30 text-white backdrop-blur-sm " +
        "focus:ring-2 focus:ring-white/60 " +
        className
      }
    />
  );
}