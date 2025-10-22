export default function YardActionButtons({
  yard, index,
  onEditStatus, onEditDetails, onCardCharged, onRefundStatus, onEscalation
}) {
  const base =
    "px-3 py-1.5 rounded-md text-sm border bg-white/10 text-white border-white/20 hover:bg-white/20";

  const isCardCharged = String(yard?.paymentStatus || "").trim().toLowerCase() === "card charged";
  const isRefundCollected = String(yard?.refundStatus || "").trim().toLowerCase() === "refund collected";
  const isEscalated = !!yard?.escTicked;

  const cardCls = isCardCharged
    ? "px-3 py-1.5 rounded-md text-sm border bg-black/40 text-white border-white/30 hover:bg-black/50"
    : base;

  const refundCls = isRefundCollected
    ? "px-3 py-1.5 rounded-md text-sm border bg-orange-500/25 text-white border-orange-400/40 hover:bg-orange-500/35"
    : base;

  const escCls = isEscalated
    ? "px-3 py-1.5 rounded-md text-sm border bg-rose-600/30 text-white border-rose-500/40 hover:bg-rose-600/40"
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
