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
        <div className="flex gap-2 rounded-lg p-1 bg-[#29345a]/60 border border-[#43518a]/70">
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
          <button
            onClick={() => {
              if (canAddNewYard) {
                onOpenAdd?.();
              }
            }}
            onMouseEnter={(e) => {
              if (!canAddNewYard) {
                e.currentTarget.setAttribute(
                  "title",
                  "You cannot add a new yard until the current yard status is either PO Cancelled or Escalation and the escalation process is Return or Junked."
                );
              }
            }}
            disabled={!canAddNewYard}
            className={`px-3 py-1.5 rounded-md text-sm border focus:outline-none focus:ring-2 focus:ring-white/40 ${
              canAddNewYard
                ? "bg-[#38487a] text-white border border-[#5260a1] shadow-inner hover:bg-[#4a5dac]"
                : "bg-white/10 text-white/60 border-white/20 cursor-not-allowed"
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
