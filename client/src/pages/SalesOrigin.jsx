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
  { key: "grossProfit", label: "Est GP" },
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

const ORIGIN_COLUMNS = [
  { key: "call", label: "Call" },
  { key: "chat", label: "Chat" },
  { key: "lead", label: "Lead" },
];

const getOriginKey = (row = {}) => {
  const origin = String(getSalesOrigin(row) || "").trim().toLowerCase();
  return ORIGIN_COLUMNS.some((column) => column.key === origin) ? origin : "";
};

const toNumber = (value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const toCurrency = (value) => `$${toNumber(value).toFixed(2)}`;

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
      case "grossProfit":
        return currency(row?.grossProfit);
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
    const createRow = (salesAgent) => ({
      salesAgent,
      call: 0,
      chat: 0,
      lead: 0,
      overall: 0,
      estGP: 0,
      actualGP: 0,
    });

    const grouped = new Map();
    const overall = createRow("Overall");

    rows.forEach((row) => {
      const salesAgent = getSalesAgent(row);
      const originKey = getOriginKey(row);
      const estGP = toNumber(row?.grossProfit);
      const actualGP = toNumber(row?.actualGP);
      const current = grouped.get(salesAgent) || createRow(salesAgent);

      if (originKey) {
        current[originKey] += 1;
        overall[originKey] += 1;
      }

      current.overall += 1;
      current.estGP += estGP;
      current.actualGP += actualGP;
      grouped.set(salesAgent, current);

      overall.overall += 1;
      overall.estGP += estGP;
      overall.actualGP += actualGP;
    });

    const formatRow = (item, isTotal = false) => ({
      id: isTotal ? "overall" : item.salesAgent,
      salesAgent: item.salesAgent,
      call: item.call,
      chat: item.chat,
      lead: item.lead,
      overall: item.overall,
      estGP: toCurrency(item.estGP),
      actualGP: toCurrency(item.actualGP),
      isTotal,
    });

    const totalRows = Array.from(grouped.values())
      .sort((a, b) => a.salesAgent.localeCompare(b.salesAgent))
      .map((item) => ({
        ...formatRow(item),
      }));

    totalRows.push(formatRow(overall, true));

    return {
      columns: [
        { key: "salesAgent", label: "Sales Agent", align: "left" },
        ...ORIGIN_COLUMNS,
        { key: "overall", label: "Overall" },
        { key: "estGP", label: "Est GP" },
        { key: "actualGP", label: "Actual GP" },
      ],
      rows: totalRows,
    };
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
      showOrdersCountInTotals={false}
      extraTotals={salesOriginTotals}
      paramsBuilder={paramsBuilder}
      fetchOverride={fetchOverride}
      tableId="salesOrigin"
    />
  );
}
