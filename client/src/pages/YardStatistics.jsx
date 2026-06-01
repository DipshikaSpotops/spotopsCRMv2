import React, { useCallback } from "react";
import OrdersTable from "../components/OrdersTable";

/** Green used on yard miles badge / positive indicators */
const REFUND_COLLECTED_GREEN = "bg-[#16a34a] text-white";

const columns = [
  { key: "yardName", label: "Yard Name" },
  { key: "yardPoSent", label: "Yard PO Sent" },
  { key: "orderCancelled", label: "PO Cancelled" },
  { key: "junkedParts", label: "Junked Parts" },
  { key: "cardCharged", label: "Card Charged" },
  { key: "refundToBeCollected", label: "Refund to Be Collected" },
  { key: "refundCollected", label: "Refund Collected" },
  { key: "storeCredit", label: "Store Credit" },
  { key: "failedOrders", label: "Failed Orders" },
  { key: "successRate", label: "Success Rate" },
];

const currency = (n) => `$${(Number(n) || 0).toFixed(2)}`;

/** Eye-icon totals: all yards in the filtered range (not just the current page). */
function yardStatisticsTotals(_rows, { responseMeta } = {}) {
  const t = responseMeta?.grandTotals || {};
  return [
    { name: "Total Yards", value: String(t.yardCount ?? responseMeta?.totalCount ?? 0) },
    {
      name: "Overall Placed Orders",
      value: String(t.yardPoSent ?? 0),
    },
    { name: "Overall PO Cancelled", value: String(t.orderCancelled ?? 0) },
    { name: "Overall Junked", value: String(t.junkedParts ?? 0) },
    { name: "Overall Card Charged", value: currency(t.cardCharged) },
    { name: "Overall Refund Collected", value: currency(t.refundCollected) },
    { name: "Overall Store Credit", value: currency(t.storeCredit) },
  ];
}

export default function YardStatistics() {
  const renderCell = useCallback((row, key) => {
    switch (key) {
      case "yardName":
        return row.yardName || "—";
      case "yardPoSent":
        return Number(row.yardPoSent ?? row.ordersPlaced ?? 0);
      case "orderCancelled":
      case "junkedParts":
      case "failedOrders":
        return row[key] ?? 0;
      case "cardCharged":
      case "refundToBeCollected":
      case "refundCollected":
      case "storeCredit":
        return currency(row[key]);
      case "successRate": {
        const rate = Number(row.successRate);
        return Number.isFinite(rate) ? `${rate.toFixed(2)}%` : "—";
      }
      default:
        return row[key] ?? "—";
    }
  }, []);

  const getCellClassName = useCallback((row, key) => {
    if (key === "refundCollected" && Number(row.refundCollected) > 0) {
      return REFUND_COLLECTED_GREEN;
    }
    return "";
  }, []);

  return (
    <OrdersTable
      title="Yard Statistics"
      endpoint="/orders/yardStatistics"
      storageKeys={{
        page: "yardStatisticsPage",
        search: "yardStatisticsSearch",
        filter: "yardStatisticsFilter",
        hilite: "yardStatisticsHighlight",
      }}
      columns={columns}
      renderCell={renderCell}
      getCellClassName={getCellClassName}
      showAgentFilter={false}
      showGP={false}
      hideDefaultActions
      tableId="yardStatistics"
      defaultSortBy="yardName"
      defaultSortOrder="asc"
      showOrdersCountInTotals={false}
      extraTotals={yardStatisticsTotals}
    />
  );
}
