// src/pages/SalesData.jsx
import React, { useCallback } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

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

/* ---------- Multi-page fetch ---------- */
async function fetchAllMonthlyOrders(params, headers) {
  // 1️⃣ first request
  const first = await API.get(`/orders/monthlyOrders`, {
    params: { ...params, page: 1 },
    headers,
  });

  const { orders: firstOrders = [], totalPages = 1 } = first.data || {};
  let allOrders = [...firstOrders];

  // 2️⃣ remaining pages
  if (totalPages > 1) {
    const requests = [];
    for (let p = 2; p <= totalPages; p++) {
      requests.push(API.get(`/orders/monthlyOrders`, { params: { ...params, page: p }, headers }));
    }
    const results = await Promise.all(requests);
    results.forEach((r) => {
      const arr = Array.isArray(r.data?.orders) ? r.data.orders : [];
      allOrders = allOrders.concat(arr);
    });
  }

  return allOrders;
}

const SalesData = () => {
  /* ---------- Params + Fetch override ---------- */
  const paramsBuilder = useCallback(({ filter }) => {
    const params = {};
    if (filter?.start && filter?.end) {
      params.start = filter.start;
      params.end = filter.end;
    } else {
      params.month = filter?.month;
      params.year = filter?.year;
    }
    return params;
  }, []);

  const fetchOverride = useCallback(
    async ({ filter }) => {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const params = paramsBuilder({ filter });
      const all = await fetchAllMonthlyOrders(params, headers);
      return all;
    },
    [paramsBuilder]
  );

  // Realtime: refetch sales data when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.salesDataMonthly?.refetch) {
        window.__ordersTableRefs.salesDataMonthly.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.salesDataMonthly?.refetch) {
        window.__ordersTableRefs.salesDataMonthly.refetch();
      }
    },
  });

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
      paramsBuilder={paramsBuilder}
      fetchOverride={fetchOverride}
      tableId="salesDataMonthly"
    />
  );
};

export default SalesData;
