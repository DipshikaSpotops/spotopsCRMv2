import { useState, useEffect } from "react";
import GlassCard from "../../ui/GlassCard";
import YardCard from "./YardCard";

export default function YardList({
  yards,
  canAddNewYard,
  onOpenAdd,
  onEditStatus,
  onEditDetails,
  onCardCharged,
  onRefundStatus,
  onEscalation,
}) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (yards?.length) {
      setActiveIdx(yards.length - 1); // default: last yard
    }
  }, [yards]);

  return (
    <GlassCard
      title="Yards"
      actions={
        <div className="flex gap-2 rounded-lg p-1 bg-[#5c8bc1]/15 border border-[#5c8bc1]/30 dark:bg-white/10 dark:border-white/20">
          {yards?.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                activeIdx === idx
                  ? "bg-white border border-[#5c8bc1]/40 text-[#04356d] shadow dark:bg-black/20 dark:border-white/30 dark:text-white"
                  : "text-[#04356d]/80 hover:text-[#04356d] dark:text-white/80 dark:hover:text-white"
              }`}
            >
              Yard {idx + 1}
            </button>
          ))}
          <button
            onClick={onOpenAdd}
            disabled={!canAddNewYard}
            className={`px-3 py-1.5 rounded-md text-sm border ${
              canAddNewYard
                ? "bg-white text-[#04356d] border-white/30 hover:bg-white/90"
                : "bg-white/10 text-white/70 border-white/20 cursor-not-allowed"
            }`}
          >
            + Add Yard
          </button>
        </div>
      }
    >
      {!yards?.length ? (
        <div className="text-[#04356d]/80 dark:text-white/80">
          No yard information.
        </div>
      ) : (
        <YardCard
          yard={yards[activeIdx]}
          index={activeIdx}
          onEditStatus={onEditStatus}
          onEditDetails={onEditDetails}
          onCardCharged={onCardCharged}
          onRefundStatus={onRefundStatus}
          onEscalation={onEscalation}
        />
      )}
    </GlassCard>
  );
}
