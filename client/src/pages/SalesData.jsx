// src/pages/SalesData.jsx
import React from "react";
import OrdersTable from "../components/OrdersTable";

// Columns (order matters)
const columns = [
  { key: "orderDate",   label: "Order Date" },
  { key: "orderNo",     label: "Order No." },
  { key: "salesAgent",  label: "Agent Name" },
  { key: "customerName",label: "Customer Name" },
  { key: "partName",    label: "Part Name" },
  { key: "orderStatus", label: "Order Status" },
  { key: "soldP",       label: "Sale Price" },
  { key: "grossProfit", label: "Est GP" },
  { key: "_currentGP",  label: "Current GP" },
  { key: "_actualGP",   label: "Actual GP" },
];

// Custom cell renderer to match your existing UI rules
const renderCell = (row, key, formatDateSafe, currency) => {
  switch (key) {
    case "orderDate":
      return formatDateSafe(row.orderDate);
    case "orderNo":
      return row.orderNo || "—";
    case "salesAgent":
      return row.salesAgent || "—";
    case "customerName":
      return row._customerName || row.customerName || "—";
    case "partName":
      return row.pReq || row.partName || "—";
    case "orderStatus":
      return row.orderStatus || "";
    case "soldP":
      return currency(row.soldP);
    case "grossProfit":
      return currency(row.grossProfit);
    case "_currentGP":
      return currency(row._currentGP);
    case "_actualGP":
      return currency(row._actualGP);
    default:
      return row[key] ?? "—";
  }
};

// Extra totals (adds Cancellation Rate to the eye modal)
const extraTotals = (rows) => {
  if (!rows?.length) {
    return [
      { name: "Cancellation Rate", value: "0.00%" },
      { name: "Cancelled+Refunded+Disputed", value: "0 / 0" },
    ];
  }
  let cancelled = 0, refunded = 0, disputed = 0;
  rows.forEach((r) => {
    const s = (r.orderStatus || "").toLowerCase();
    if (s === "order cancelled" || s === "cancelled") cancelled += 1;
    else if (s === "refunded") refunded += 1;
    else if (s === "dispute" || s === "disputed") disputed += 1;
  });
  const bad = cancelled + refunded + disputed;
  const rate = ((bad / rows.length) * 100) || 0;
  return [
    { name: "Cancellation Rate", value: `${rate.toFixed(2)}%` },
    { name: "Cancelled+Refunded+Disputed", value: `${bad} / ${rows.length}` },
  ];
};

const SalesData = () => {
  return (
    <OrdersTable
      title="Sales Data—Monthly"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page:   "salesDataMonthlyPage",
        search: "salesDataMonthlySearch",
        filter: "salesDataMonthlyFilter_v1",
        hilite: "salesDataMonthlyHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}   // Admin-only inside component
      showGP={true}
    />
  );
};

export default SalesData;
