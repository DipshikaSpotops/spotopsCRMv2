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

async function fetchMonthlyOrdersPage(params, headers) {
  const res = await API.get("/orders/monthlyOrders", { params, headers });
  return {
    orders: Array.isArray(res.data?.orders) ? res.data.orders : [],
    meta: res.data || {},
  };
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
    async ({ filter, page, limit, query, sortBy, sortOrder, selectedAgent, userRole }) => {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const params = {
        ...paramsBuilder({ filter }),
        page,
        limit,
        q: query || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
        toBeReimbursed: "true",
      };
      if (
        (userRole || "").toLowerCase() === "admin" &&
        selectedAgent &&
        selectedAgent !== "Select" &&
        selectedAgent !== "All"
      ) {
        params.salesAgent = selectedAgent;
      }
      const { orders, meta } = await fetchMonthlyOrdersPage(params, headers);
      return {
        orders,
        meta: {
          ...meta,
          totalOrders: Number(meta?.totalOrders) || 0,
          totalPages: Number(meta?.totalPages) || 1,
          currentPage: Number(meta?.currentPage) || Number(page) || 1,
        },
      };
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
