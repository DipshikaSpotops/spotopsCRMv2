import Field from "../../ui/Field";
import Input from "../../ui/Input";

export default function PricingTab({ order }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Quoted Price ($)"><Input readOnly value={order?.soldP || ""} /></Field>
      <Field label="Yard Price ($)"><Input readOnly value={order?.costP || ""} /></Field>
      <Field label="Est. Shipping ($)"><Input readOnly value={order?.shippingFee || ""} /></Field>
      <Field label="Sales Tax ($)"><Input readOnly value={order?.salestax || ""} /></Field>
      <Field label="Est. GP ($)"><Input readOnly value={order?.grossProfit || ""} /></Field>
      <Field label="Actual GP ($)"><Input readOnly value={order?.actualGP || ""} /></Field>
    </div>
  );
}
