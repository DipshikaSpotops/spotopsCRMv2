import Field from "../../ui/Field";
import Input from "../../ui/Input";
import YardActionButtons from "../YardActionButtons";
import { extractOwn, extractYard } from "../../../utils/yards";

export default function YardCard({
  yard,
  index,
  onEditStatus,
  onEditDetails,
  onCardCharged,
  onRefundStatus,
  onEscalation,
}) {
  const y = yard || {};

  // Prioritize shippingDetails - if it specifies a shipping type, use only that
  const shippingDetailsStr = y.shippingDetails || "";
  const hasOwnInDetails = /own shipping:/i.test(shippingDetailsStr);
  const hasYardInDetails = /yard shipping:/i.test(shippingDetailsStr);
  
  let ownVal, yardVal;
  if (hasOwnInDetails) {
    // shippingDetails says "Own shipping", so only use own shipping
    ownVal = extractOwn(y.shippingDetails) ?? y.ownShipping;
    yardVal = undefined;
  } else if (hasYardInDetails) {
    // shippingDetails says "Yard shipping", so only use yard shipping
    yardVal = extractYard(y.shippingDetails) ?? y.yardShipping;
    ownVal = undefined;
  } else {
    // shippingDetails doesn't specify, fall back to individual fields
    ownVal = y.ownShipping ?? extractOwn(y.shippingDetails);
    yardVal = y.yardShipping ?? extractYard(y.shippingDetails);
  }

  // Collect all non-empty fields dynamically
  const fields = [
    { label: "Part Price", value: y.partPrice },
    { label: "Expected Shipping Date", value: y.expShipDate },
    // Show only one of these two ↓
    ...(ownVal
      ? [{ label: "Own Shipping ($)", value: ownVal }]
      : yardVal
      ? [{ label: "Yard Shipping ($)", value: yardVal }]
      : []),
    { label: "Others", value: y.others },
    { label: "Status", value: y.status },
    { label: "Stock No", value: y.stockNo },
    { label: "Warranty(in days)", value: y.warranty },
    { label: "Payment status", value: y.paymentStatus  },
    { label: "Tracking No", value: y.trackingNo },
    { label: "ETA", value: y.eta },
    { label: "Shipper", value: y.shipperName },
    { label: "Delivered", value: y.deliveredDate || y.yardDeliveredDate },
    { label: "Escalation Reason", value: y.escalationCause },
    { label: "Yard Refund", value: y.refundedAmount },
    
  ].filter((f) => f.value !== undefined && f.value !== null && f.value !== "");

  const hasAnyDetail = fields.length > 0;

  return (
    <div className="text-white">
     <div className="mb-3">
  {/* Yard Name */}
  <div className="text-base font-semibold text-white/90 mb-1">
    Yard {index + 1}: <span className="text-white">{y.yardName || "—"}</span>
  </div>

  {/* Responsive Contact Info */}
  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/80 leading-relaxed">
    {y.address && (
      <div className="flex items-start min-w-[200px]">
        <span className="font-semibold text-white/80 mr-1">Address:</span>
        <span className="break-words">{y.address}</span>
      </div>
    )}
    {y.phone && (
      <div className="flex items-start min-w-[120px]">
        <span className="font-semibold text-white/80 mr-1">Phone:</span>
        <span>{y.phone}</span>
      </div>
    )}
    {y.faxNo && (
      <div className="flex items-start min-w-[120px]">
        <span className="font-semibold text-white/80 mr-1">Fax:</span>
        <span>{y.faxNo}</span>
      </div>
    )}
    {y.email && (
      <div className="flex items-start min-w-[220px]">
        <span className="font-semibold text-white/80 mr-1">Email:</span>
        <a
          href={`mailto:${y.email}`}
          className="text-blue-300 hover:underline break-all"
        >
          {y.email}
        </a>
      </div>
    )}
  </div>
</div>


      {hasAnyDetail ? (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 text-sm">
          {fields.map((f, i) => (
            <Field key={i} label={f.label}>
              <Input readOnly value={f.value} />
            </Field>
          ))}
        </div>
      ) : (
        <div className="text-sm text-white/70">
          No details available for this yard.
        </div>
      )}

      <div className="mt-4">
        <YardActionButtons
          yard={y}
          index={index}
          onEditStatus={onEditStatus}
          onEditDetails={onEditDetails}
          onCardCharged={onCardCharged}
          onRefundStatus={onRefundStatus}
          onEscalation={onEscalation}
        />
      </div>
    </div>
  );
}
