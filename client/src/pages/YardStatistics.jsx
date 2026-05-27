import React, { useCallback } from "react";
import OrdersTable from "../components/OrdersTable";

const columns = [
  { key: "yardName", label: "Yard Name" },
  { key: "noOrderPlaced", label: "No Order Placed" },
  { key: "orderCancelled", label: "Order Cancelled" },
  { key: "junkedParts", label: "Junked Parts" },
  { key: "yardStoreCredit", label: "Yard Store Credit" },
  { key: "failedOrders", label: "Failed Orders" },
  { key: "successRate", label: "Success Rate" },
];

const currency = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export default function YardStatistics() {
  const renderCell = useCallback((row, key) => {
    switch (key) {
      case "yardName":
        return row.yardName || "—";
      case "noOrderPlaced":
      case "orderCancelled":
      case "junkedParts":
      case "failedOrders":
        return row[key] ?? 0;
      case "yardStoreCredit":
        return currency(row.yardStoreCredit);
      case "successRate": {
        const rate = Number(row.successRate);
        return Number.isFinite(rate) ? `${rate.toFixed(2)}%` : "—";
      }
      default:
        return row[key] ?? "—";
    }
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
      showAgentFilter
      showGP={false}
      hideDefaultActions
      tableId="yardStatistics"
      defaultSortBy="yardName"
      defaultSortOrder="asc"
    />
  );
}
