import Field from "../../ui/Field";
import Input from "../../ui/Input";

export default function PartTab({ order }) {
  const rows = [
    [
      {
        label: "Year / Make / Model",
        value: [order?.year, order?.make, order?.model]
          .filter((part) => part !== undefined && part !== null && part !== "")
          .join(" / "),
      },
      { label: "Part Required", value: order?.pReq },
    ],
    [
      { label: "Description", value: order?.desc },
      { label: "Warranty (days)", value: order?.warranty },
    ],
    [
      { label: "VIN", value: order?.vin },
      { label: "Part No.", value: order?.partNo },
    ],
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {rows.map((cols, rowIdx) =>
        cols.map((field, colIdx) => (
          <Field key={`${rowIdx}-${colIdx}-${field.label}`} label={field.label}>
            <Input readOnly value={field.value || ""} />
          </Field>
        ))
      )}
    </div>
  );
}
