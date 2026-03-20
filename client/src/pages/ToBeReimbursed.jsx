import React, { useCallback, useEffect } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

const columns = [
  { key: "orderDate", label: "Order Date" },
  { key: "orderNo", label: "Order No" },
  { key: "customerName", label: "Customer Name" },
  { key: "salesAgent", label: "Sales Agent" },
  { key: "reimbursementAmount", label: "Amount ($)" },
  { key: "reimbursementDate", label: "Reimbursed Date" },
  { key: "orderStatus", label: "Order Status" },
];

async function fetchAllMonthlyOrders(params, headers) {
  const first = await API.get("/orders/monthlyOrders", {
    params: { ...params, page: 1 },
    headers,
  });
  const { orders: firstOrders = [], totalPages = 1 } = first.data || {};
  let allOrders = [...firstOrders];

  if (totalPages > 1) {
    const requests = [];
    for (let p = 2; p <= totalPages; p++) {
      requests.push(
        API.get("/orders/monthlyOrders", {
          params: { ...params, page: p },
          headers,
        })
      );
    }
    const results = await Promise.all(requests);
    results.forEach((r) => {
      const arr = Array.isArray(r.data?.orders) ? r.data.orders : [];
      allOrders = allOrders.concat(arr);
    });
  }
  return allOrders;
}

export default function ToBeReimbursed() {
  const brand = useBrand();

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
      return all.filter(
        (o) => o?.toBeReimbursed === true || o?.toBeReimbursed === "true"
      );
    },
    [paramsBuilder, brand]
  );

  const renderCell = useCallback((row, key, formatDateSafe, currency) => {
    switch (key) {
      case "orderDate":
        return formatDateSafe(row.orderDate);
      case "orderNo":
        return row.orderNo || "—";
      case "customerName":
        return row.customerName || [row.fName, row.lName].filter(Boolean).join(" ") || "—";
      case "salesAgent":
        return row.salesAgent || "—";
      case "reimbursementAmount":
        return currency(row.reimbursementAmount || 0);
      case "reimbursementDate":
        return row.reimbursementDate ? formatDateSafe(row.reimbursementDate) : "—";
      case "orderStatus":
        return row.orderStatus || "—";
      default:
        return row[key] ?? "—";
    }
  }, []);

  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.toBeReimbursed?.refetch) {
        window.__ordersTableRefs.toBeReimbursed.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.toBeReimbursed?.refetch) {
        window.__ordersTableRefs.toBeReimbursed.refetch();
      }
    },
  });

  useEffect(() => {
    if (window.__ordersTableRefs?.toBeReimbursed?.refetch) {
      window.__ordersTableRefs.toBeReimbursed.refetch();
    }
  }, [brand]);

  return (
    <OrdersTable
      title="To Be Reimbursed"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page: "toBeReimbursedPage",
        search: "toBeReimbursedSearch",
        filter: "toBeReimbursedFilter",
        hilite: "toBeReimbursedHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showGP={false}
      showTotalsButton={false}
      paramsBuilder={paramsBuilder}
      fetchOverride={fetchOverride}
      tableId="toBeReimbursed"
    />
  );
}
