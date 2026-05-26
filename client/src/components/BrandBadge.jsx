import useBrand from "../hooks/useBrand";

const BRAND_COLORS = {
  PROLANE: "bg-[#c40505]",
  PROTP: "bg-[#e67e22]",
};

export default function BrandBadge() {
  const brand = useBrand();

  if (!brand) return null;

  const bgColor = BRAND_COLORS[brand] || "bg-[#04356d]";

  return (
    <div className="pointer-events-none fixed right-[3rem] top-[4.5em] z-40 hidden sm:flex">
      <span
        className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide backdrop-blur-sm border border-white/20 text-white ${bgColor}`}
      >
        {brand}
      </span>
    </div>
  );
}

