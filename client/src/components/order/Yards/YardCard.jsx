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

  const buildAddress = () => {
    const clean = (val) =>
      String(val ?? "")
        .trim()
        .replace(/,+$/, "");

    const parts = [
      clean(y.street),
      clean(y.city),
      clean(y.state),
      clean(y.zipcode),
      clean(y.country),
    ].filter(Boolean);

    if (parts.length > 0) return parts.join(", ");

    // Fallback to existing combined address if structured fields are missing
    const addr = clean(y.address);
    return addr || "";
  };

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

  const warrantyUnitLabel = (() => {
    const unit = (y.yardWarrantyField || "days").toString().toLowerCase();
    const warrantyValue = Number(y.warranty) || 0;
    
    // Handle pluralization based on warranty value
    let displayUnit;
    if (unit === "months") {
      displayUnit = warrantyValue === 1 ? "Month" : "Months";
    } else if (unit === "years") {
      displayUnit = warrantyValue === 1 ? "Year" : "Years";
    } else {
      // Default to days
      displayUnit = warrantyValue === 1 ? "Day" : "Days";
    }
    
    return `Warranty (${displayUnit})`;
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
    // Show expedite as a checkbox (read-only here; editable in Yard Details modal)
    {
      label: "Expedite",
      checked:
        y?.yardExpedite === true ||
        y?.yardExpedite === "true" ||
        y?.expediteShipping === true ||
        y?.expediteShipping === "true",
      isCheckbox: true,
    },
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
  <div className="text-sm text-[#09325d]/90 dark:text-white/80 leading-relaxed space-y-1">
    {/* Address - its own row, bolder & slightly larger (especially in light mode) */}
    {(() => {
      const fullAddress = buildAddress();
      return fullAddress ? (
        <div className="flex items-start">
          <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1 underline">
            Address:
          </span>
          <span className="break-words font-semibold text-[#021f4b] dark:text-white text-[0.95rem]">
            {fullAddress}
          </span>
        </div>
      ) : null;
    })()}

    {/* Phone row only */}
    {y.phone && (
      <div className="flex items-start">
        <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1 underline">
          Phone:
        </span>
        <span className="font-semibold text-[#021f4b] dark:text-white ml-1">
          {y.phone}
        </span>
      </div>
    )}

    {/* Email & Fax row(s) below phone */}
    {(y.email || y.faxNo) && (
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {y.email && (
          <div className="flex items-start">
            <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1 underline">
              Email:
            </span>
            <a
              href={`mailto:${y.email}`}
              className="font-semibold text-blue-600 hover:underline break-all dark:text-blue-300"
            >
              {y.email}
            </a>
          </div>
        )}
        {y.faxNo && (
          <div className="flex items-start">
            <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1 underline">
              Fax:
            </span>
            <span className="font-semibold text-[#021f4b] dark:text-white ml-1">
              {y.faxNo}
            </span>
          </div>
        )}
      </div>
    )}

    {/* Agent - separate row, bold value */}
    {y.agentName && (
      <div className="flex items-start">
        <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1 underline">
          Agent:
        </span>
        <span className="font-semibold text-[#021f4b] dark:text-white ml-1">
          {y.agentName}
        </span>
      </div>
    )}
  </div>
</div>


      {hasAnyDetail ? (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 text-sm">
          {fields.map((f, i) => (
            <Field key={i} label={f.label}>
              {f.isCheckbox ? (
                <div className="w-full rounded-lg px-3 py-2 bg-gray-50 border border-gray-300 flex items-center dark:bg-white/10 dark:border-white/30 dark:text-white">
                  <input
                    type="checkbox"
                    readOnly
                    checked={!!f.checked}
                    className="h-4 w-4 accent-[#2b2d68] cursor-default"
                  />
                </div>
              ) : (
                <Input readOnly value={f.value} />
              )}
            </Field>
          ))}
        </div>
      ) : (
        <div className="text-sm text-[#09325d]/80 dark:text-white/70">
          No details available for this yard.
        </div>
      )}

      {/* Label void screenshot (link only; image opens in new tab when clicked) */}
      {y.voidLabelScreenshot && (
        <div className="mt-4">
          <div className="text-sm font-semibold mb-1">
            Label void screenshot
          </div>
          <a
            href={y.voidLabelScreenshot}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-xs text-blue-700 underline dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-200"
          >
            View screenshot
          </a>
        </div>
      )}

      {/* General yard images – list as Yard image 1, 2, ... */}
      {Array.isArray(y.yardImages) && y.yardImages.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-semibold mb-1">Yard images</div>
          <div className="flex flex-col gap-1">
            {y.yardImages.map((url, idx) => (
              <a
                key={`${url}-${idx}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs text-blue-700 underline dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-200"
              >
                {`View image ${idx + 1}`}
              </a>
            ))}
          </div>
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
          onAddYardImage={onEditStatus}
        />
      </div>
    </div>
  );
}
