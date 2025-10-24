import Stat from "../ui/Stat";
import { formatDallasDate } from "../../../../shared/utils/timeUtils";

export default function OrderSummaryStats({ order, actualGPOverride }) {
  // use nullish coalescing so 0 doesn't become "—"
  const salesAgent = order?.salesAgent ?? "—";
  const quotedNum   = Number(order?.soldP ?? 0);
  const estGpNum    = Number(order?.grossProfit ?? 0);
  const taxNum      = Number(order?.salestax ?? 0);

  // prefer the live override; fall back to server value; default 0
  const actualGpNum =
    actualGPOverride != null
      ? Number(actualGPOverride)
      : Number(order?.actualGP ?? 0);

  const quoted   = `$${quotedNum.toFixed(2)}`;
  const estGP    = `$${estGpNum.toFixed(2)}`;
  const tax      = `$${taxNum.toFixed(2)}`;
  const actualGP = `$${actualGpNum.toFixed(2)}`;

  const orderDate = order?.orderDate;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mt-4">
      <Stat label="Sales Agent" value={salesAgent} />
      <Stat label="Quoted" value={quoted} />
      <Stat label="Est. GP" value={estGP} />
      <Stat label="Tax" value={tax} />
      <Stat label="Actual GP" value={actualGP} />
      <Stat label="Date" value={formatDallasDate(orderDate)} />

      {/* keep a hidden input if other code reads #actualGP directly */}
      <input id="actualGP" type="hidden" value={actualGpNum.toFixed(2)} readOnly />

      <div className="hidden xl:block" />
      <div className="hidden xl:block" />
      <div className="hidden xl:block" />
      <div className="hidden xl:block" />
    </div>
  );
}
