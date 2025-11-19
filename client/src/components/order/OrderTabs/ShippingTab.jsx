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

  const sameAsBilling =
    order?.sameAsBilling === true || order?.sameAsBilling === "true";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[260px] overflow-y-auto pr-1">
      <Field label="Attention">
        <Input readOnly value={order?.attention || ""} />
      </Field>
      <Field label="Billing Name">
        <Input readOnly value={order?.bName || ""} />
      </Field>
      <Field label="Business Name">
        <Input readOnly value={order?.businessName || ""} />
      </Field>
      <Field label="Same as Billing?">
        <Input readOnly value={sameAsBilling ? "Yes" : "No"} />
      </Field>
      <Field label="Order Notes">
        <Input readOnly value={order?.notes || ""} />
      </Field>
      <Field label="Escalation">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border ${isEscalated ? "bg-[#04356d] border-[#021f4b]" : "border-gray-400 dark:border-white/40"}`}>
            {isEscalated ? "✓" : ""}
          </span>
          <span className="text-[#09325d] dark:text-white/80">{isEscalated ? "Yes" : "No"}</span>
        </div>
      </Field>
    </div>
  );
}
