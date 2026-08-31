import { useState } from "react";
import Field from "../../ui/Field";
import Input from "../../ui/Input";
import YardActionButtons from "../YardActionButtons";
import { extractOwn, extractYard } from "../../../utils/yards";
import {
  yardStoreCreditBaseKey,
  yardStoreCreditMatchKey,
} from "@spotops/shared/utils/yardName.js";
import { openS3ObjectUrl } from "../../../utils/s3View";
import API from "../../../api";
import TrashCanIcon from "../../ui/TrashCanIcon";

export default function YardCard({
  yard,
  index,
  orderNo,
  onEditStatus,
  onEditDetails,
  onCardCharged,
  onRefundStatus,
  onEscalation,
  storeCreditApplied = [],
  onYardImagesChanged,
}) {
  const y = yard || {};
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState(null);
  const [deletingImage, setDeletingImage] = useState(false);

  const matchingStoreCredits = (() => {
    if (!Array.isArray(storeCreditApplied) || !storeCreditApplied.length) {
      return [];
    }
    const yardKey = yardStoreCreditMatchKey(y.yardName, y.city, y.state);
    const yardBaseKey = yardStoreCreditBaseKey(y.yardName, y.city, y.state);
    if (!yardKey && !yardBaseKey) return [];

    const bySource = new Map();
    for (const entry of storeCreditApplied) {
      if (!entry) continue;

      // Prefer explicit target yard from Store Credit "Use" flow
      const hasTargetIndex =
        entry.targetYardIndex !== undefined &&
        entry.targetYardIndex !== null &&
        Number.isFinite(Number(entry.targetYardIndex));
      if (hasTargetIndex) {
        if (Number(entry.targetYardIndex) !== Number(index)) continue;
      } else {
        const exact =
          yardKey && entry.matchKey && entry.matchKey === yardKey;
        const loose =
          yardBaseKey &&
          (entry.baseKey === yardBaseKey || entry.matchKey === yardBaseKey);
        if (!exact && !loose) continue;
      }

      const source = String(entry.sourceOrderNo || "").trim();
      const amount = Number(entry.amount) || 0;
      if (!source || amount <= 0) continue;
      bySource.set(source, (bySource.get(source) || 0) + amount);
    }

    return Array.from(bySource.entries()).map(([sourceOrderNo, amount]) => ({
      sourceOrderNo,
      amount,
    }));
  })();

  const confirmDeleteYardImage = async () => {
    if (pendingDeleteIdx == null || deletingImage) return;
    if (!orderNo) return;
    try {
      setDeletingImage(true);
      const firstName = localStorage.getItem("firstName");
      await API.delete(
        `/orders/${encodeURIComponent(orderNo)}/additionalInfo/${index + 1}/yardImages/${pendingDeleteIdx}`,
        { params: { firstName } }
      );
      setPendingDeleteIdx(null);
      await onYardImagesChanged?.();
    } catch (err) {
      console.error("Failed to delete yard image:", err);
      alert(err?.response?.data?.message || "Failed to delete image. Please try again.");
    } finally {
      setDeletingImage(false);
    }
  };

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

  const rawExpediteValue =
    y?.yardExpedite !== undefined && y?.yardExpedite !== null
      ? y.yardExpedite
      : y?.expediteShipping;

  const isExpediteChecked =
    rawExpediteValue === true ||
    rawExpediteValue === "true" ||
    rawExpediteValue === 1 ||
    rawExpediteValue === "1";

  const milesValue = Number(y.miles);
  const hasMiles =
    y.miles !== undefined &&
    y.miles !== null &&
    String(y.miles).trim() !== "" &&
    Number.isFinite(milesValue);

  const milesBadgeStyle = (() => {
    if (!hasMiles) return null;
    const base = { color: "#ffffff" };
    if (milesValue < 200) {
      return { ...base, backgroundColor: "#16a34a", borderColor: "#15803d" };
    }
    if (milesValue < 500) {
      return { ...base, backgroundColor: "#ea580c", borderColor: "#c2410c" };
    }
    return { ...base, backgroundColor: "#b91c1c", borderColor: "#991b1b" };
  })();

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
    makeField("Escalation Process", y.escalationProcess),
    makeField("Yard Refund", y.refundedAmount),
  ].filter(Boolean);

  const hasAnyDetail = fields.length > 0;

  return (
    <div className="text-[#09325d] dark:text-white">
     <div className="mb-3">
  {/* Yard name (left); Expedite - tick floated right, no background */}
  <div className="mb-1 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
    <div className="min-w-0 text-base font-semibold text-[#09325d] dark:text-white/90">
      Yard {index + 1}:{" "}
      <span className="text-[#09325d] dark:text-white">{y.yardName || "—"}</span>
    </div>
    {isExpediteChecked && (
      <label className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[#09325d] dark:text-white/85 cursor-default select-none">
        <span>Expedite -</span>
        <input
          type="checkbox"
          readOnly
          checked
          aria-label={`Yard ${index + 1} expedite`}
          className="h-4 w-4 accent-green-600 cursor-default"
        />
      </label>
    )}
  </div>

  {/* Responsive Contact Info */}
  <div className="text-sm text-[#09325d]/90 dark:text-white/80 leading-relaxed space-y-1">
    {/* Address - its own row, bolder & slightly larger (especially in light mode) */}
    {(() => {
      const fullAddress = buildAddress();
      return fullAddress ? (
        <div className="flex items-start">
          <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1">
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
        <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1">
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
            <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1">
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
            <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1">
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
        <span className="font-semibold text-[#09325d] dark:text-white/80 mr-1">
          Agent:
        </span>
        <span className="font-semibold text-[#021f4b] dark:text-white ml-1">
          {y.agentName}
        </span>
      </div>
    )}

  </div>

  {hasMiles && milesBadgeStyle && (
    <div
      className="yard-miles-badge mt-2 inline-block rounded-md border px-2.5 py-1 text-sm font-semibold shadow-sm"
      style={milesBadgeStyle}
    >
      Miles: {milesValue}
    </div>
  )}
  {matchingStoreCredits.length > 0 && (
    <div className={`${hasMiles ? "mt-1.5" : "mt-2"} space-y-0.5`}>
      {matchingStoreCredits.map(({ sourceOrderNo, amount }) => (
        <div
          key={sourceOrderNo}
          className="text-sm font-normal text-green-600 dark:text-green-400"
        >
          Store Credit ${amount.toFixed(2)} used from {sourceOrderNo}
        </div>
      ))}
    </div>
  )}
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openS3ObjectUrl(y.voidLabelScreenshot);
            }}
            className="inline-flex w-fit max-w-full items-center self-start text-xs text-blue-700 underline dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-200"
          >
            View screenshot
          </a>
        </div>
      )}

      {/* General yard images – list as Yard image 1, 2, ... */}
      {Array.isArray(y.yardImages) && y.yardImages.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-semibold mb-1">Yard images</div>
          <div className="flex flex-col items-start gap-1">
            {y.yardImages.map((url, idx) => (
              <div key={`${url}-${idx}`} className="flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openS3ObjectUrl(url);
                  }}
                  className="inline-flex w-fit max-w-full items-center text-xs text-blue-700 underline dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-200"
                >
                  {`View image ${idx + 1}`}
                </a>
                <button
                  type="button"
                  title="Delete image"
                  aria-label={`Delete yard image ${idx + 1}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPendingDeleteIdx(idx);
                  }}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-black text-white hover:bg-black/80"
                >
                  <TrashCanIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingDeleteIdx != null && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-[90vw] max-w-md rounded-2xl border border-gray-200 bg-blue-50 text-[#09325d] shadow-2xl overflow-hidden dark:border-white/15 dark:bg-[#0b1c34]/90 dark:text-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/10">
              <h3 className="text-lg font-semibold">Delete image?</h3>
              <button
                type="button"
                disabled={deletingImage}
                onClick={() => setPendingDeleteIdx(null)}
                className="h-8 w-8 grid place-items-center rounded-md bg-blue-200 hover:bg-blue-300 border border-blue-300 text-blue-800 dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/15 dark:text-white"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="leading-relaxed">
                Delete yard image {pendingDeleteIdx + 1}? This cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-white/10">
              <button
                type="button"
                disabled={deletingImage}
                onClick={() => setPendingDeleteIdx(null)}
                className="px-4 py-2 rounded-lg bg-blue-200 hover:bg-blue-300 border border-blue-300 text-blue-800 dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingImage}
                onClick={confirmDeleteYardImage}
                className="px-5 py-2 rounded-lg bg-red-600 text-white font-medium border border-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deletingImage ? "Deleting…" : "Delete"}
              </button>
            </div>
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
