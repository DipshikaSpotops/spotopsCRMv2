import Stat from "../ui/Stat";
import { formatDallasDate } from "@spotops/shared";

export default function OrderSummaryStats({ order, actualGPOverride }) {
  // use nullish coalescing so 0 doesn't become "—"
  const salesAgent = order?.salesAgent ?? "—";
  const quotedNum   = Number(order?.soldP ?? 0);
  const estGpNum    = Number(order?.grossProfit ?? 0);
  const taxNum      = Number(order?.salestax ?? 0);

  // Mirror the logic used in Actual GP calc: prefer any of the customer refund fields
  const hasCustRefundRaw =
    order &&
    (order.custRefundedAmount != null ||
      order.cancelledRefAmount != null ||
      order.custRefAmount != null);
  const custRefundNum = hasCustRefundRaw
    ? Number(
        order.custRefundedAmount ??
          order.cancelledRefAmount ??
          order.custRefAmount ??
          0
      )
    : 0;
  const hasCustRefund =
    hasCustRefundRaw && Number.isFinite(custRefundNum) && Math.abs(custRefundNum) > 0.0001;

  // prefer the live override; fall back to server value; default 0
  const actualGpNum =
    actualGPOverride != null
      ? Number(actualGPOverride)
      : Number(order?.actualGP ?? 0);

  const quoted   = `$${quotedNum.toFixed(2)}`;
  const estGP    = `$${estGpNum.toFixed(2)}`;
  const tax      = `$${taxNum.toFixed(2)}`;
  const actualGP = `$${actualGpNum.toFixed(2)}`;

  // For customer refund, only show decimal places if they exist (e.g. $100 vs $100.50)
  const formatCustRefund = (num) => {
    if (!Number.isFinite(num)) return "$0";
    return Number.isInteger(num) ? `$${num}` : `$${num.toFixed(2)}`;
  };
  const custRefund = hasCustRefund ? formatCustRefund(custRefundNum) : "";

  const orderDate = order?.orderDate;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mt-3">
      <Stat label="Sales Agent" value={salesAgent} compact />
      <Stat label="Quoted" value={quoted} compact />
      <Stat label="Est. GP" value={estGP} compact />
      <Stat label="Tax" value={tax} compact />
      <Stat label="Actual GP" value={actualGP} compact />
      {hasCustRefund && (
        <Stat label="Cust Refund" value={custRefund} compact />
      )}
      <Stat label="Date" value={formatDallasDate(orderDate)} compact />

      {/* keep a hidden input if other code reads #actualGP directly */}
      <input id="actualGP" type="hidden" value={actualGpNum.toFixed(2)} readOnly />

      <div className="hidden xl:block" />
      <div className="hidden xl:block" />
      <div className="hidden xl:block" />
      <div className="hidden xl:block" />
    </div>
  );
}
