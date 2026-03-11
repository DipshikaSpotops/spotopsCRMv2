import useBrand from "../hooks/useBrand";

export default function BrandBadge() {
  const brand = useBrand();

  if (!brand) return null;

  return (
    <div className="pointer-events-none fixed right-[3rem] top-[4.5em] z-40 hidden sm:flex">
      <span
        className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide backdrop-blur-sm border border-white/20 ${
          brand === "PROLANE"
            ? "bg-[#c40505] text-white"
            : "bg-[#04356d] text-white"
        }`}
      >
        {brand}
      </span>
    </div>
  );
}

