export default function YardActionButtons({
  yard, index,
  onEditStatus, onEditDetails, onCardCharged, onRefundStatus, onEscalation
}) {
  const base =
    "px-3 py-1.5 rounded-md text-sm border bg-blue-200 hover:bg-blue-300 text-blue-800 border-blue-300 shadow-sm hover:shadow-md transition-all dark:bg-white/10 dark:text-white dark:border-white/20 dark:hover:bg-white/20";

  const isCardCharged = String(yard?.paymentStatus || "").trim().toLowerCase() === "card charged";
  const isRefundCollected = String(yard?.refundStatus || "").trim().toLowerCase() === "refund collected";
  const isEscalated = !!yard?.escTicked;

  const cardCls = isCardCharged
    ? "px-3 py-1.5 rounded-md text-sm border bg-gray-800 text-white border-gray-700 hover:bg-gray-900 dark:bg-black/40 dark:border-white/30 dark:hover:bg-black/50"
    : base;

  const refundCls = isRefundCollected
    ? "px-3 py-1.5 rounded-md text-sm border bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200 dark:bg-orange-500/25 dark:text-white dark:border-orange-400/40 dark:hover:bg-orange-500/35"
    : base;

  const escCls = isEscalated
    ? "px-3 py-1.5 rounded-md text-sm border bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200 dark:bg-rose-600/30 dark:text-white dark:border-rose-500/40 dark:hover:bg-rose-600/40"
    : base;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={`edit-yard ${base}`} onClick={() => onEditStatus(index)}>Edit Status</button>
      <button type="button" className={`edit-yard-details ${base}`} onClick={() => onEditDetails(index)}>Edit Details</button>
      <button type="button" className={`cardcharged ${cardCls}`} onClick={() => onCardCharged(index)}>Card Charged</button>
      <button type="button" className={`refundCollect ${refundCls}`} onClick={() => onRefundStatus(index)}>Refund Status</button>
      <button type="button" className={`escalation ${escCls}`} onClick={() => onEscalation(index)}>Escalation</button>
    </div>
  );
}
