import Field from "../../ui/Field";
import Input from "../../ui/Input";

export default function PartTab({ order }) {
  // Determine warranty label based on warrantyField (default to "days" if empty)
  const warrantyField = (order?.warrantyField || "days").toString().toLowerCase();
  const warrantyValue = Number(order?.warranty) || 0;
  
  // Handle pluralization based on warranty value
  let displayUnit;
  if (warrantyField === "months") {
    displayUnit = warrantyValue === 1 ? "Month" : "Months";
  } else if (warrantyField === "years") {
    displayUnit = warrantyValue === 1 ? "Year" : "Years";
  } else {
    // Default to days
    displayUnit = warrantyValue === 1 ? "Day" : "Days";
  }
  
  const warrantyLabel = `Warranty (${displayUnit})`;

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
      { label: warrantyLabel, value: order?.warranty },
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
