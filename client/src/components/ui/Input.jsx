export default function Input(props) {
  const { className = "", ...p } = props;
  return (
    <input
      {...p}
      className={
        "w-full rounded-lg px-3 py-2 outline-none " +
        "bg-gray-50 border border-gray-300 text-[#09325d] placeholder-gray-400 " +
        "focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-60 " +
        "dark:bg-white/10 dark:border-white/30 dark:text-white dark:placeholder-white/60 " +
        "dark:focus:ring-white/60 dark:focus:border-white/60 dark:backdrop-blur-sm " +
        className
      }
    />
  );
}