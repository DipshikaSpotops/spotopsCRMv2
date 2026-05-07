import React, { useCallback, useEffect } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";
import API from "../api";

const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "orderDate", label: "Order Date" },
  { key: "salesAgent", label: "Sales Agent" },
  { key: "salesOrigin", label: "Sales Origin" },
  { key: "actualGP", label: "Actual GP" },
  { key: "orderStatus", label: "Order Status" },
];

const STORAGE_KEYS = {
  page: "salesOrigin_page",
  search: "salesOrigin_search",
  filter: "salesOrigin_filter",
  hilite: "salesOrigin_hilite",
};

const getSalesOrigin = (row = {}) =>
  row?.leadOrigin || row?.salesOrigin || row?.saleOrigin || "—";

const getSalesAgent = (row = {}) => row?.salesAgent || "—";

export default function SalesOrigin() {
  const brand = useBrand();

  const renderCell = useCallback((row, key, _formatDateSafe, currency) => {
    switch (key) {
      case "orderNo":
        return row?.orderNo || "—";
      case "orderDate":
        return _formatDateSafe(row?.orderDate);
      case "salesAgent":
        return getSalesAgent(row);
      case "salesOrigin":
        return getSalesOrigin(row);
      case "actualGP":
        return currency(row?.actualGP);
      case "orderStatus":
        return row?.orderStatus || "—";
      default:
        return row?.[key] ?? "—";
    }
  }, []);

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
    async ({ filter, query, sortBy, sortOrder, selectedAgent, userRole }) => {
      const params = {
        ...paramsBuilder({ filter }),
        q: query || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
        page: 1,
        limit: 200,
      };

      if (
        (userRole || "").toLowerCase() === "admin" &&
        selectedAgent &&
        selectedAgent !== "Select" &&
        selectedAgent !== "All"
      ) {
        params.salesAgent = selectedAgent;
      }

      const first = await API.get("/orders/monthlyOrders", { params });
      const firstOrders = Array.isArray(first?.data?.orders) ? first.data.orders : [];
      const totalPages = Number(first?.data?.totalPages) || 1;

      let allOrders = [...firstOrders];
      if (totalPages > 1) {
        const requests = [];
        for (let page = 2; page <= totalPages; page += 1) {
          requests.push(
            API.get("/orders/monthlyOrders", { params: { ...params, page } })
          );
        }
        const responses = await Promise.all(requests);
        responses.forEach((res) => {
          const next = Array.isArray(res?.data?.orders) ? res.data.orders : [];
          allOrders = allOrders.concat(next);
        });
      }

      // Return rows only; this keeps client-side pagination/totals over full dataset.
      return allOrders;
    },
    [paramsBuilder]
  );

  const salesOriginTotals = useCallback((rows = []) => {
    const grouped = new Map();
    let overallActualGP = 0;
    let overallCount = 0;

    rows.forEach((row) => {
      const salesAgent = getSalesAgent(row);
      const salesOrigin = getSalesOrigin(row);
      const actualGP = Number(row?.actualGP) || 0;
      const groupKey = `${salesAgent}||${salesOrigin}`;

      const current = grouped.get(groupKey) || {
        salesAgent,
        salesOrigin,
        count: 0,
        totalActualGP: 0,
      };

      current.count += 1;
      current.totalActualGP += actualGP;
      grouped.set(groupKey, current);

      overallCount += 1;
      overallActualGP += actualGP;
    });

    const items = Array.from(grouped.values())
      .sort((a, b) => {
        const byAgent = a.salesAgent.localeCompare(b.salesAgent);
        if (byAgent !== 0) return byAgent;
        return a.salesOrigin.localeCompare(b.salesOrigin);
      })
      .map((item) => ({
        name: `${item.salesAgent} — ${item.salesOrigin}`,
        value: `$${item.totalActualGP.toFixed(2)}`,
        count: item.count,
      }));

    items.push({
      name: "Overall",
      value: `$${overallActualGP.toFixed(2)}`,
      count: overallCount,
      isTotal: true,
    });

    return items;
  }, []);

  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.salesOrigin?.refetch) {
        window.__ordersTableRefs.salesOrigin.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.salesOrigin?.refetch) {
        window.__ordersTableRefs.salesOrigin.refetch();
      }
    },
  });

  useEffect(() => {
    if (window.__ordersTableRefs?.salesOrigin?.refetch) {
      window.__ordersTableRefs.salesOrigin.refetch();
    }
  }, [brand]);

  return (
    <OrdersTable
      title="Sales Origin"
      endpoint="/orders/monthlyOrders"
      storageKeys={STORAGE_KEYS}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showGP={false}
      showTotalsButton={true}
      extraTotals={salesOriginTotals}
      paramsBuilder={paramsBuilder}
      fetchOverride={fetchOverride}
      tableId="salesOrigin"
    />
  );
}
