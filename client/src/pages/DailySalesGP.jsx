// Daily Sales GP — same table UX as Monthly Orders; Admin & Sales only; defaults to today (Chicago).
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

const TZ = "America/Chicago";

const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "orderDate", label: "Order Date" },
  { key: "salesAgent", label: "Sales Agent" },
  { key: "grossProfit", label: "Est GP" },
  { key: "customerName", label: "Customer Info" },
  { key: "orderStatus", label: "Order Status" },
];

function formatOrderStatus(status) {
  if (!status) return "";
  if (status === "Dispute 2") return "Dispute AC";
  return status;
}

function buildDailyDefaultFilter() {
  const now = new Date();
  const day = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  return { start: day, end: day, limit: "all" };
}

async function fetchAllDailySalesGp(params, headers) {
  const first = await API.get(`/orders/dailySalesGp`, {
    params: { ...params, page: 1 },
    headers,
  });

  const { orders: firstOrders = [], totalPages = 1 } = first.data || {};
  let allOrders = [...firstOrders];

  if (totalPages > 1) {
    const requests = [];
    for (let p = 2; p <= totalPages; p++) {
      requests.push(API.get(`/orders/dailySalesGp`, { params: { ...params, page: p }, headers }));
    }
    const results = await Promise.all(requests);
    results.forEach((r) => {
      const arr = Array.isArray(r.data?.orders) ? r.data.orders : [];
      allOrders = allOrders.concat(arr);
    });
  }

  return allOrders;
}

export default function DailySalesGP() {
  const brand = useBrand();
  const [totalLabel, setTotalLabel] = useState(
    "Total Orders: 0 | Est GP: $0.00"
  );

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
      return fetchAllDailySalesGp(params, headers);
    },
    [paramsBuilder]
  );

  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      window.__ordersTableRefs?.dailySalesGp?.refetch?.();
    },
    onOrderUpdated: () => {
      window.__ordersTableRefs?.dailySalesGp?.refetch?.();
    },
  });

  useEffect(() => {
    window.__ordersTableRefs?.dailySalesGp?.refetch?.();
  }, [brand]);

  const renderCell = useCallback((row, key, formatDateSafe, currency) => {
    switch (key) {
      case "orderDate":
        return formatDateSafe(row.orderDate);
      case "orderNo":
        return row.orderNo || "—";
      case "salesAgent":
        return row.salesAgent || "—";
      case "grossProfit":
        return <span className="block">{currency(row.grossProfit)}</span>;
      case "customerName":
        return (
          <div className="text-sm max-w-[220px]">
            <div>
              {row.fName && row.lName
                ? `${row.fName} ${row.lName}`
                : row.customerName || "—"}
            </div>
            {(row.email || row.phone) && (
              <div className="text-xs text-white/70 mt-0.5 break-all">
                {[row.email, row.phone].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        );
      case "orderStatus":
        return formatOrderStatus(row.orderStatus) || "";
      default:
        return row[key] ?? "—";
    }
  }, []);

  const gpTotals = useCallback((rows = []) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [
        { name: "Total Orders", value: 0 },
        { name: "Est GP", value: "$0.00", isTotal: true },
      ];
    }
    let est = 0;
    rows.forEach((r) => {
      est += parseFloat(r?.grossProfit) || 0;
    });
    return [
      { name: "Total Orders", value: rows.length },
      { name: "Est GP", value: `$${est.toFixed(2)}`, isTotal: true },
    ];
  }, []);

  const onRowsChange = useCallback((rows) => {
    const est = rows.reduce(
      (s, r) => s + (parseFloat(r?.grossProfit) || 0),
      0
    );
    setTotalLabel(
      `Total Orders: ${rows.length} | Est GP: $${est.toFixed(2)}`
    );
  }, []);

  const defaultFilter = useMemo(() => buildDailyDefaultFilter(), []);

  return (
    <OrdersTable
      title="Daily Sales GP"
      endpoint="/orders/dailySalesGp"
      defaultFilter={defaultFilter}
      storageKeys={{
        page: "dailySalesGpPage",
        search: "dailySalesGpSearch",
        filter: "dailySalesGpFilter",
        hilite: "dailySalesGpHilite",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showGP={false}
      showTotalsButton={true}
      extraTotals={gpTotals}
      paramsBuilder={paramsBuilder}
      fetchOverride={fetchOverride}
      onRowsChange={onRowsChange}
      totalLabel={totalLabel}
      showTotalsNearPill={true}
      tableId="dailySalesGp"
    />
  );
}
