import Field from "../../ui/Field";
import Input from "../../ui/Input";
export default function ShippingTab({ order }) {
  const isEscalated = (() => {
    const yards = Array.isArray(order?.additionalInfo)
      ? order.additionalInfo
      : [];
    return yards.some((yard) => {
      const flag = yard?.escTicked;
      if (typeof flag === "string") {
        const normalized = flag.trim().toLowerCase();
        return normalized === "yes" || normalized === "true";
      }
      return Boolean(flag);
    });
  })();

  const paymentSource = order?.paymentSource || "";
  const authorizationId = order?.authorizationId || "";
  const orderNotes = Array.isArray(order?.notes)
    ? order.notes.join(", ")
    : order?.notes || "";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[260px] overflow-y-auto pr-1">
      <Field label="Attention | Billing Name">
        <Input
          readOnly
          value={`${order?.attention || ""}${order?.attention || order?.bName ? " | " : ""}${order?.bName || ""}`}
        />
      </Field>
      <Field label="Business Name">
        <Input readOnly value={order?.businessName || ""} />
      </Field>
      <Field label="Payment Source">
        <Input readOnly value={paymentSource} />
      </Field>
      <Field label="Authorization ID">
        <Input readOnly value={authorizationId} />
      </Field>
      <Field label="Order Notes">
        <Input readOnly value={orderNotes} />
      </Field>
      <Field label="Escalation">
        <div className="flex items-center gap-2">
          <span className={`escalation-checkbox inline-flex h-4 w-4 items-center justify-center rounded-sm border ${isEscalated ? "bg-[#04356d] border-[#021f4b] dark:bg-[#04356d] dark:border-[#021f4b]" : "border-gray-400 dark:border-white/40"}`}>
            {isEscalated ? <span className="text-white text-xs">✓</span> : ""}
          </span>
          <span className="text-[#09325d] dark:text-white/80">{isEscalated ? "Yes" : "No"}</span>
        </div>
      </Field>
    </div>
  );
}
