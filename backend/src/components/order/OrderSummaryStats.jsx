import Stat from "../ui/Stat";
import { formatDate } from "../../utils/formatter";

export default function OrderSummaryStats({ order }) {
  const salesAgent = order?.salesAgent || "—";
  const quoted = order?.soldP ? `$${Number(order?.soldP).toFixed(2)}` : "—";
  const estGP = order?.grossProfit ? `$${Number(order?.grossProfit).toFixed(2)}` : "—";
  const tax = order?.salestax ? `$${Number(order?.salestax).toFixed(2)}` : "—";
  const actualGP = order?.actualGP ? `$${Number(order?.actualGP).toFixed(2)}` : "—";
  const orderDate = order?.orderDate;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mt-4">
      <Stat label="Sales Agent" value={salesAgent} />
      <Stat label="Quoted" value={quoted} />
      <Stat label="Est. GP" value={estGP} />
      <Stat label="Tax" value={tax} />
      <Stat label="Actual GP" value={actualGP} />
      <Stat label="Date" value={formatDate(orderDate)} />
      <div className="hidden xl:block" />
      <div className="hidden xl:block" />
      <div className="hidden xl:block" />
      <div className="hidden xl:block" />
    </div>
  );
}