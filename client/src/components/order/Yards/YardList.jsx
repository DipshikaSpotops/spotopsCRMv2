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
      className="h-full flex flex-col"
      title="Yards"
      actions={
        <div className="flex gap-2 rounded-lg p-1 bg-[#29345a]/60 border border-[#43518a]/70 dark:bg-white/10 dark:border-white/15">
          {yards?.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                activeIdx === idx
                  ? "bg-[#38487a] text-white shadow-inner border border-[#5260a1]"
                  : "text-[#d4d9ea] hover:text-white border border-transparent"
              }`}
            >
              Yard {idx + 1}
            </button>
          ))}
          <div className="relative group z-30">
            <button
              onClick={() => {
                if (canAddNewYard) {
                  onOpenAdd?.();
                }
              }}
              disabled={!canAddNewYard}
              className={`px-3 py-1.5 rounded-md text-sm border transition ${
                canAddNewYard
                  ? "bg-white text-[#04356d] border-white/40 hover:bg-white/90 hover:scale-[1.02] shadow-md"
                  : "bg-white/10 text-white/60 border-white/20 cursor-not-allowed"
              }`}
            >
              + Add Yard
            </button>
            {!canAddNewYard && (
              <div className="absolute left-1/2 top-full z-40 hidden w-[20rem] -translate-x-1/2 translate-y-2 rounded-lg bg-black/90 px-4 py-2 text-xs leading-4 text-white shadow-lg group-hover:block whitespace-pre-wrap pointer-events-none">
                Finish the current yard first. Status must be PO Cancelled or Escalation (Return/Junk) before adding a new yard.
              </div>
            )}
          </div>
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
