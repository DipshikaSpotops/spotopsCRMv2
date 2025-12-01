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

  const ownVal = extractOwn(y.shippingDetails) ?? y.ownShipping;
  const yardVal = extractYard(y.shippingDetails) ?? y.yardShipping;

  const warrantyUnitLabel = (() => {
    const unit = (y.yardWarrantyField || "days").toString();
    const pretty = unit.charAt(0).toUpperCase() + unit.slice(1);
    return `Warranty (${pretty})`;
  })();

  const normalizeValue = (raw) => {
    if (raw === undefined || raw === null) return "";
    if (Array.isArray(raw)) {
      const joined = raw
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .join(", ");
      return joined;
    }
    const str = String(raw).trim();
    return str;
  };

  const makeField = (label, raw) => {
    const value = normalizeValue(raw);
    if (!value) return null;
    return { label, value };
  };

  const fields = [
    makeField("Part Price", y.partPrice),
    makeField("Exp Shipping Date", y.expShipDate),
    ...(ownVal
      ? [makeField("Own Shipping ($)", ownVal)]
      : yardVal
      ? [makeField("Yard Shipping ($)", yardVal)]
      : []),
    makeField("Others", y.others),
    makeField("Status", y.status),
    makeField("Stock No", y.stockNo),
    makeField(warrantyUnitLabel, y.warranty),
    makeField("Payment Status", y.paymentStatus),
    makeField("Tracking No", y.trackingNo),
    makeField("ETA", y.eta),
    makeField("Shipper", y.shipperName),
    makeField("Delivered", y.deliveredDate || y.yardDeliveredDate),
    makeField("Escalation Reason", y.escalationCause),
    makeField("Yard Refund", y.refundedAmount),
  ].filter(Boolean);

  const hasAnyDetail = fields.length > 0;

  return (
    <div className="text-[#09325d] dark:text-white">
     <div className="mb-3">
  {/* Yard Name */}
  <div className="text-base font-semibold text-[#09325d] dark:text-white/90 mb-1">
    Yard {index + 1}: <span className="text-[#09325d] dark:text-white">{y.yardName || "—"}</span>
  </div>

  {/* Responsive Contact Info */}
  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[#09325d]/90 dark:text-white/80 leading-relaxed">
    {y.address && (
      <div className="flex items-start min-w-[200px]">
        <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1 underline">Address:</span>
        <span className="break-words">{y.address}</span>
      </div>
    )}
    {y.phone && (
      <div className="flex items-start min-w-[180px]">
        <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1 underline">Phone:</span>
        <span>{y.phone}</span>
      </div>
    )}
    {y.faxNo && (
      <div className="flex items-start min-w-[120px]">
        <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1 underline">Fax:</span>
        <span>{y.faxNo}</span>
      </div>
    )}
    {y.email && (
      <div className="flex items-start min-w-[220px]">
        <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1 underline">Email:</span>
        <a
          href={`mailto:${y.email}`}
          className="text-blue-600 hover:underline break-all dark:text-blue-300"
        >
          {y.email}
        </a>
      </div>
    )}
    {y.agentName && (
      <div className="flex items-start min-w-[150px]">
        <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1 underline">Agent:</span>
        <span>{y.agentName}</span>
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
        <div className="text-sm text-[#09325d]/80 dark:text-white/70">
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
