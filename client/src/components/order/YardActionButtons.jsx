export default function YardActionButtons({
  yard, index,
  onEditStatus, onEditDetails, onCardCharged, onRefundStatus, onEscalation
}) {
  // Base style - using hover background colors as default background with enhanced glow on hover
  const base =
    "px-3 py-1.5 rounded-md text-sm border bg-blue-200 hover:bg-blue-300 text-blue-800 border-blue-300 shadow-sm hover:shadow-md transition-all dark:bg-[#3b82f6]/10 dark:text-[#3b82f6] dark:border-[#3b82f6] dark:hover:bg-[#3b82f6]/15 dark:shadow-[0_0_4px_rgba(59,130,246,0.3)] dark:hover:shadow-[0_0_12px_rgba(59,130,246,0.7),0_0_20px_rgba(59,130,246,0.4)] dark:[text-shadow:0_0_2px_rgba(59,130,246,0.5)] dark:hover:[text-shadow:0_0_8px_rgba(59,130,246,0.9),0_0_12px_rgba(59,130,246,0.6)]";

  const isCardCharged = String(yard?.paymentStatus || "").trim().toLowerCase() === "card charged";
  const isRefundCollected = String(yard?.refundStatus || "").trim().toLowerCase() === "refund collected";
  const isEscalated = !!yard?.escTicked;

  // Card Charged button: match yard tab background (black) when payment status is "Card charged"
  const cardCls = isCardCharged
    ? "px-3 py-1.5 rounded-md text-sm border bg-black text-white border-black hover:bg-gray-900 dark:bg-black dark:text-white dark:border-black dark:hover:bg-gray-900"
    : base;

  // Refund Status button: match yard tab background (orange) when refund status is "Refund collected"
  const refundCls = isRefundCollected
    ? "px-3 py-1.5 rounded-md text-sm border bg-[#f97316] text-white border-[#f97316] hover:bg-[#ea580c] dark:bg-[#f97316] dark:text-white dark:border-[#f97316] dark:hover:bg-[#ea580c]"
    : base;

  // Escalation also uses the same blue background as other buttons
  const escCls = base;

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
