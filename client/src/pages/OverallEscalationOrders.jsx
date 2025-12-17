// src/pages/OverallEscalationOrders.jsx
import React from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

/* ---------- Helpers ---------- */
/**
 * Format order status for display
 * Transforms "Dispute 2" to "Dispute AC"
 */
function formatOrderStatus(status) {
  if (!status) return "";
  if (status === "Dispute 2") return "Dispute AC";
  return status;
}

// Unique storage keys for this page
const STORAGE_KEYS = {
  page:   "overallEsc_page",
  search: "overallEsc_search",
  filter: "overallEsc_filter",
  hilite: "overallEsc_hilite",
};

// Column definitions for this page
const COLUMNS = [
  { key: "orderDate",        label: "Order Date" },
  { key: "orderNo",          label: "Order No" },
  { key: "pReq",             label: "Part Name" },
  { key: "salesAgent",       label: "Sales Agent" },
  { key: "customerName",     label: "Customer Name" },
  { key: "escalationStatus", label: "Escalation Status" },
  { key: "orderStatus",      label: "Order Status" },
];

// Cell renderer to compute page-specific display values
function renderCell(row, key, formatDateSafe /*, currency */) {
  switch (key) {
    case "orderDate":
      return formatDateSafe(row.orderDate);

    case "customerName": {
      const name = row.customerName || `${row.fName || ""} ${row.lName || ""}`.trim();
      return name || "N/A";
    }

    case "pReq":
      return row.pReq || row.partName || "N/A";

    case "salesAgent":
      return row.salesAgent || "N/A";

    case "escalationStatus": {
      // derive from first yard’s escTicked flag
      const esc = Array.isArray(row.additionalInfo)
        ? (row.additionalInfo[0]?.escTicked === "Yes" ? "Yes" : "")
        : "";
      return esc;
    }

    case "orderStatus":
      return formatOrderStatus(row.orderStatus) || "";

    case "orderNo":
      return row.orderNo || "—";

    default:
      return row[key] ?? "—";
  }
}

// Optional: keep your View navigation consistent
const navigateTo = (row) => `/order-details?orderNo=${encodeURIComponent(row.orderNo)}`;

export default function OverallEscalationOrders() {
  // Realtime: refetch overall escalation list when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.overallEscalations?.refetch) {
        window.__ordersTableRefs.overallEscalations.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.overallEscalations?.refetch) {
        window.__ordersTableRefs.overallEscalations.refetch();
      }
    },
  });

  return (
    <OrdersTable
      title="Overall Escalations"
      endpoint="/orders/overallEscalationOrders"
      storageKeys={STORAGE_KEYS}
      columns={COLUMNS}
      renderCell={renderCell}
      // This page doesn't need GP totals; hide the eye button
      showTotalsButton={false}
      // If you later want agent narrowing, flip this to true (Admin only)
      showAgentFilter={false}
      // If you ever compute GP here, enable:
      showGP={false}
      navigateTo={navigateTo}
      tableId="overallEscalations"
    />
  );
}
