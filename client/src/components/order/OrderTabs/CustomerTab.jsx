import Field from "../../ui/Field";
import Input from "../../ui/Input";
import { fmtAddress } from "../../../utils/formatter";

export default function CustomerTab({ order }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="First Name">
        <Input readOnly value={order?.fName || ""} />
      </Field>
      <Field label="Last Name">
        <Input readOnly value={order?.lName || ""} />
      </Field>
      <Field label="Email">
        <Input readOnly type="email" value={order?.email || ""} />
      </Field>
      <Field label="Phone">
        <Input readOnly value={order?.phone || ""} />
      </Field>
      <Field label="Billing Address">
        <Input readOnly value={fmtAddress(order || {}, "bAddress")} />
      </Field>
      <Field label="Shipping Address">
        <Input readOnly value={fmtAddress(order || {}, "sAddress")} />
      </Field>
    </div>
  );
}
