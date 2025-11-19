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
        <div className="flex gap-2 rounded-lg p-1 bg-blue-50 border border-gray-200 dark:bg-white/10 dark:border-white/20">
          {yards?.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                activeIdx === idx
                  ? "bg-[#04356d] text-white shadow-inner"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200 hover:text-blue-800 font-medium dark:bg-white/10 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/20"
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
                  ? "bg-blue-200 text-blue-800 border-blue-300 hover:bg-blue-300 shadow-sm hover:shadow-md transition-all dark:bg-white dark:border-white/40 dark:hover:bg-white/90"
                  : "bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed dark:bg-white/10 dark:text-white/60 dark:border-white/20"
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
        <div className="text-[#09325d]/80 dark:text-white/80">
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
