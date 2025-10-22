import Field from "../../ui/Field";
import Input from "../../ui/Input";
import Select from "../../ui/Select";

export default function ShippingTab({ order }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Order Status">
        <Select value={order?.orderStatus || ""} readOnly disabled>
          {[
            "Placed","Customer approved","Yard Processing","In Transit","Escalation",
            "Order Fulfilled","Order Cancelled","Dispute","Refunded","Voided",
          ].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Last 4 Digits"><Input readOnly value={order?.last4digits || ""} /></Field>

      <label className="inline-flex items-center gap-2 mt-2">
        <input type="checkbox" className="h-4 w-4" readOnly
          checked={(order?.orderStatus || "").toLowerCase().includes("escalation")} />
        <span className="text-[#04356d] dark:text-white">Escalation</span>
      </label>

      <Field label="Attention"><Input readOnly value={order?.attention || ""} /></Field>
    </div>
  );
}
