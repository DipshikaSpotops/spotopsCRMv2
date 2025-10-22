import Field from "../../ui/Field";
import Input from "../../ui/Input";

export default function PartTab({ order }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Make"><Input readOnly value={order?.make || ""} /></Field>
      <Field label="Model"><Input readOnly value={order?.model || ""} /></Field>
      <Field label="Year"><Input readOnly value={order?.year || ""} /></Field>
      <Field label="Part Required"><Input readOnly value={order?.pReq || ""} /></Field>
      <Field label="Description"><Input readOnly value={order?.desc || ""} /></Field>
      <Field label="Warranty (days)"><Input readOnly value={order?.warranty || ""} /></Field>
      <Field label="VIN"><Input readOnly value={order?.vin || ""} /></Field>
      <Field label="Part No."><Input readOnly value={order?.partNo || ""} /></Field>
    </div>
  );
}
