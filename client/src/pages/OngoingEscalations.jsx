// src/pages/OngoingEscalationOrders.jsx
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

// Unique storage keys for this page so it doesn't collide with others
const STORAGE_KEYS = {
  page:   "ongoingEsc_page",
  search: "ongoingEsc_search",
  filter: "ongoingEsc_filter",
  hilite: "ongoingEsc_hilite",
};

// Columns for this page
const COLUMNS = [
  { key: "orderDate",        label: "Order Date" },
  { key: "orderNo",          label: "Order No" },
  { key: "pReq",             label: "Part Name" },
  { key: "salesAgent",       label: "Sales Agent" },
  { key: "customerName",     label: "Customer Name" },
  { key: "escalationStatus", label: "Escalation Status" },
  { key: "orderStatus",      label: "Order Status" },
];

// Page-specific cell rendering (derive a couple of fields)
function renderCell(row, key, formatDateSafe /*, currency */) {
  switch (key) {
    case "orderDate":
      return formatDateSafe(row.orderDate);

    case "orderNo":
      return row.orderNo || "—";

    case "pReq":
      return row.pReq || row.partName || "N/A";

    case "salesAgent":
      return row.salesAgent || "N/A";

    case "customerName": {
      const name = row.customerName || `${row.fName || ""} ${row.lName || ""}`.trim();
      return name || "N/A";
    }

    case "escalationStatus": {
      // derive from first yard’s escTicked flag
      const esc =
        Array.isArray(row.additionalInfo) && row.additionalInfo[0]?.escTicked === "Yes"
          ? "Yes"
          : "";
      return esc;
    }

    case "orderStatus":
      return formatOrderStatus(row.orderStatus) || "";

    default:
      return row[key] ?? "—";
  }
}

// Keep View button behavior consistent with other pages
const navigateTo = (row) => `/order-details?orderNo=${encodeURIComponent(row.orderNo)}`;

export default function OngoingEscalationOrders() {
  // Realtime: refetch ongoing escalation list when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.ongoingEscalations?.refetch) {
        window.__ordersTableRefs.ongoingEscalations.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.ongoingEscalations?.refetch) {
        window.__ordersTableRefs.ongoingEscalations.refetch();
      }
    },
  });

  return (
    <OrdersTable
      title="Ongoing Escalations"
      endpoint="/orders/ongoingEscalationOrders"
      storageKeys={STORAGE_KEYS}
      columns={COLUMNS}
      renderCell={renderCell}
      showTotalsButton={false}   // hide totals eye for this page
      showAgentFilter={false}    // flip to true if you want Admin agent narrowing
      showGP={false}             // no GP math needed here
      navigateTo={navigateTo}
      tableId="ongoingEscalations"
    />
  );
}
