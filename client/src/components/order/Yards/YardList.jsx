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
    <>
      <style>{`
        /* Override OrderDetails.jsx CSS - Must be more specific */
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button.yard-card-charged,
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button[data-yard-card-charged],
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button[data-yard-card-charged-active],
        html:not(.dark) button.yard-card-charged,
        html:not(.dark) button[data-yard-card-charged],
        html:not(.dark) button[data-yard-card-charged-active] {
          background-color: #000000 !important;
          background: #000000 !important;
          color: white !important;
          border-color: #000000 !important;
        }
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button.yard-card-charged:hover,
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button[data-yard-card-charged]:hover,
        html:not(.dark) button.yard-card-charged:hover,
        html:not(.dark) button[data-yard-card-charged]:hover {
          background-color: #111827 !important;
          background: #111827 !important;
        }
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button[data-yard-card-charged-active],
        html:not(.dark) button[data-yard-card-charged-active] {
          background-color: #111827 !important;
          background: #111827 !important;
        }
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button.yard-refund-collected,
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button[data-yard-refund-collected],
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button[data-yard-refund-collected-active],
        html:not(.dark) button.yard-refund-collected,
        html:not(.dark) button[data-yard-refund-collected],
        html:not(.dark) button[data-yard-refund-collected-active] {
          background-color: #f97316 !important;
          background: #f97316 !important;
          color: white !important;
          border-color: #f97316 !important;
        }
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button.yard-refund-collected:hover,
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button[data-yard-refund-collected]:hover,
        html:not(.dark) button.yard-refund-collected:hover,
        html:not(.dark) button[data-yard-refund-collected]:hover {
          background-color: #ea580c !important;
          background: #ea580c !important;
        }
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button[data-yard-refund-collected-active],
        html:not(.dark) button[data-yard-refund-collected-active] {
          background-color: #ea580c !important;
          background: #ea580c !important;
        }
      `}</style>
    <GlassCard
      className="h-full flex flex-col"
      title="Yards"
      actions={
        <div className="flex gap-2 rounded-lg p-1 bg-blue-50 border border-gray-200 dark:bg-white/10 dark:border-white/20">
          {yards?.map((y, idx) => {
            const isActive = activeIdx === idx;
            const paymentStatus = String(y?.paymentStatus || "").trim().toLowerCase();
            const refundStatus = String(y?.refundStatus || "").trim().toLowerCase();
            
            const isCardCharged = paymentStatus === "card charged";
            const isRefundCollected = refundStatus === "refund collected";

            // Debug
            if (idx < 3) {
              console.log(`Yard ${idx + 1}: paymentStatus="${paymentStatus}", refundStatus="${refundStatus}", isCardCharged=${isCardCharged}, isRefundCollected=${isRefundCollected}`);
            }

            let bgClasses = "";
            let dataAttr = "";

            if (isCardCharged && isRefundCollected) {
              // Orange when both card charged and refund collected
              dataAttr = isActive ? "data-yard-refund-collected-active" : "data-yard-refund-collected";
              // Only dark mode classes - light mode handled by CSS
              bgClasses = isActive
                ? "yard-refund-collected shadow-inner dark:bg-[#ea580c] dark:text-white"
                : "yard-refund-collected dark:bg-[#f97316] dark:text-black dark:hover:bg-[#ea580c]";
            } else if (isCardCharged) {
              // Black when card charged only
              dataAttr = isActive ? "data-yard-card-charged-active" : "data-yard-card-charged";
              // Only dark mode classes - light mode handled by CSS
              bgClasses = isActive
                ? "yard-card-charged shadow-inner dark:bg-gray-900 dark:text-white"
                : "yard-card-charged dark:bg-black dark:text-white dark:hover:bg-gray-900";
            } else {
              // Default blue
              bgClasses = isActive
                ? "bg-[#04356d] text-white shadow-inner"
                : "bg-blue-100 text-blue-700 hover:bg-blue-200 hover:text-blue-800 font-medium dark:bg-white/10 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/20";
            }

            const buttonProps = {};
            if (dataAttr) {
              buttonProps[dataAttr] = "";
            }

            return (
              <button
                key={idx}
                onClick={() => setActiveIdx(idx)}
                className={`px-3 py-1.5 rounded-md text-sm transition ${bgClasses}`}
                {...buttonProps}
              >
                Yard {idx + 1}
              </button>
            );
          })}
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
    </>
  );
}
