// /src/pages/POReport.jsx
import React, { useCallback, useMemo, useState } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

const TZ = "America/Chicago";

/* ---------- Columns (use a single Yard Details col instead of dynamic yardN) ---------- */
const columns = [
  { key: "orderNo",              label: "Order No" },
  { key: "orderDate",            label: "Order Date" },
  { key: "yardDetails",          label: "Yard Details" },
  { key: "totalPart",            label: "Total Part ($)" },
  { key: "totalShipping",        label: "Total Shipping ($)" },
  { key: "others",               label: "Other Charges ($)" },
  { key: "refunds",              label: "Refunds ($)" },
  { key: "overallAfterRefund",   label: "Overall Purchase Cost ($)" },
];

/* ---------- Helpers ---------- */
const parseMoney = (n) => {
  const x = Number.parseFloat(n);
  return Number.isFinite(x) ? x : 0;
};
const parseShippingDetails = (s) => {
  if (!s || typeof s !== "string") return { type: "", amount: 0 };
  const [typePart, amountPart] = s.split(":");
  const amount = parseMoney((amountPart || "").trim());
  return { type: (typePart || "").trim(), amount };
};
const formatDateSafe = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
};

/* compute row aggregates + keep yard list for details panel */
function buildRow(order) {
  const addl = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];
  let totalPart = 0,
    totalShip = 0,
    totalOthers = 0,
    totalRefunds = 0,
    totalOverallAfterRefund = 0;

  addl.forEach((info) => {
    const { amount: ship } = parseShippingDetails(info.shippingDetails);
    const part = parseMoney(info.partPrice);
    const others = parseMoney(info.others);
    const refunds = parseMoney(info.refundedAmount);
    totalPart += part;
    totalShip += ship;
    totalOthers += others;
    totalRefunds += refunds;
    totalOverallAfterRefund += part + ship + others - refunds;
  });

  return {
    _id: order._id,
    orderNo: order.orderNo,
    orderDate: order.orderDate,
    // used by the Yard Details column expand
    yardDetails: addl,
    // flattened totals for visible columns
    totalPart: Number(totalPart.toFixed(2)),
    totalShipping: Number(totalShip.toFixed(2)),
    others: Number(totalOthers.toFixed(2)),
    refunds: Number(totalRefunds.toFixed(2)),
    overallAfterRefund: Number(totalOverallAfterRefund.toFixed(2)),
  };
}

/* grand “Card charged” amount for the label */
function computeGrandCardChargedUSD(rows) {
  let total = 0;
  for (const r of rows) {
    const addl = Array.isArray(r.yardDetails) ? r.yardDetails : [];
    for (const info of addl) {
      if ((info?.paymentStatus || "") === "Card charged") {
        const { amount: ship } = parseShippingDetails(info.shippingDetails);
        const part = parseMoney(info.partPrice);
        const others = parseMoney(info.others);
        const ref = parseMoney(info.refundedAmount);
        total += Math.max(0, part + ship + others - ref);
      }
    }
  }
  return total;
}

/* ---------- Multi-page fetch (Fix 1) ---------- */
async function fetchAllMonthlyOrders(params, headers) {
  // 1) first page (to get totalPages)
  const first = await API.get(`/orders/monthlyOrders`, {
    params: { ...params, page: 1 },
    headers,
  });

  const { orders: firstOrders = [], totalPages = 1 } = first.data || {};
  let allOrders = [...firstOrders];

  // 2) remaining pages
  if (totalPages > 1) {
    const reqs = [];
    for (let p = 2; p <= totalPages; p++) {
      reqs.push(
        API.get(`/orders/monthlyOrders`, {
          params: { ...params, page: p },
          headers,
        })
      );
    }
    const results = await Promise.all(reqs);
    results.forEach((res) => {
      const arr = Array.isArray(res.data?.orders) ? res.data.orders : [];
      allOrders = allOrders.concat(arr);
    });
  }

  // 3) shape rows for the table
  return allOrders
    .filter((o) => Array.isArray(o.additionalInfo) && o.additionalInfo.length > 0)
    .map(buildRow);
}

/* ---------- Extra totals for the modal ---------- */
const extraTotals = (rows) => {
  const totals = rows.reduce(
    (acc, r) => {
      acc.part += r.totalPart || 0;
      acc.ship += r.totalShipping || 0;
      acc.others += r.others || 0;
      acc.refunds += r.refunds || 0;
      acc.overall += r.overallAfterRefund || 0;
      return acc;
    },
    { part: 0, ship: 0, others: 0, refunds: 0, overall: 0 }
  );

  return [
    { name: "Total Orders (with Yards)", value: rows.length },
    { name: "Parts", value: `$${totals.part.toFixed(2)}` },
    { name: "Shipping", value: `$${totals.ship.toFixed(2)}` },
    { name: "Others", value: `$${totals.others.toFixed(2)}` },
    { name: "Refunds", value: `$${totals.refunds.toFixed(2)}` },
    { name: "Overall Purchase Cost", value: `$${totals.overall.toFixed(2)}` },
  ];
};

/* ---------- Page ---------- */
export default function POReport() {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [totalLabel, setTotalLabel] = useState(
    "Total Orders: 0 | Card Charged: $0.00"
  );

  /* cell renderer */
  const renderCell = useCallback(
    (row, key) => {
      const isExpanded = expandedIds.has(row.orderNo);

      switch (key) {
        case "orderNo":
          return row.orderNo || "—";

        case "orderDate":
          return formatDateSafe(row.orderDate);

        case "yardDetails":
          return (
            <div>
              <div className="flex justify-between items-center">
                <span>{row.yardDetails?.length || 0} yards</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedIds((prev) => {
                      const next = new Set(prev);
                      next.has(row.orderNo)
                        ? next.delete(row.orderNo)
                        : next.add(row.orderNo);
                      return next;
                    });
                  }}
                  className="text-blue-400 text-xs underline hover:text-blue-300"
                >
                  {isExpanded ? "Hide Details" : "Show Details"}
                </button>
              </div>
              {isExpanded && (
                <div className="mt-2 border-top border-white/20 pt-2 text-xs space-y-1 text-white/90">
                  {row.yardDetails.map((ai, i) => {
                    const { type, amount } = parseShippingDetails(ai.shippingDetails);
                    return (
                      <div
                        key={i}
                        className="mb-2 pb-1 border-b border-white/10 last:border-0"
                      >
                        <div><b>Yard:</b> {ai.yardName || "—"}</div>
                        {(ai.phone || ai.email) && (
                          <div className="text-xs">
                            {ai.phone || "—"} {ai.phone && ai.email ? "|" : ""} {ai.email || ""}
                          </div>
                        )}
                        <div><b>Payment Status:</b> {ai.paymentStatus || "—"}</div>
                        <div className="text-xs">
                          <b>Part:</b> ${parseMoney(ai.partPrice).toFixed(2)} {" | "}
                          <b>{type || "Shipping"}:</b> ${amount.toFixed(2)} {" | "}
                          <b>Others:</b> ${parseMoney(ai.others).toFixed(2)} {" | "}
                          <b>Refund:</b> ${parseMoney(ai.refundedAmount).toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );

        case "totalPart":
          return `$${Number(row.totalPart || 0).toFixed(2)}`;

        case "totalShipping":
          return `$${Number(row.totalShipping || 0).toFixed(2)}`;

        case "others":
          return `$${Number(row.others || 0).toFixed(2)}`;

        case "refunds":
          return `$${Number(row.refunds || 0).toFixed(2)}`;

        case "overallAfterRefund":
          return `$${Number(row.overallAfterRefund || 0).toFixed(2)}`;

        default:
          return row[key] ?? "—";
      }
    },
    [expandedIds]
  );

  /* params for /orders/monthlyOrders */
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

  /* Fix 1: fetch all pages and return rows for OrdersTable */
  const fetchOverride = useCallback(
    async ({ filter }) => {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const params = paramsBuilder({ filter });
      const rows = await fetchAllMonthlyOrders(params, headers);
      return rows;
    },
    [paramsBuilder]
  );

  /* update the running label when visible rows change (after sort/search/filter) */
  const onRowsChange = useCallback((visibleRows) => {
    const grand = computeGrandCardChargedUSD(visibleRows);
    setTotalLabel(
      `Total Orders: ${visibleRows.length} | Card Charged: $${grand.toFixed(2)}`
    );
  }, []);

  // Realtime: refetch PO report when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.poReport?.refetch) {
        window.__ordersTableRefs.poReport.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.poReport?.refetch) {
        window.__ordersTableRefs.poReport.refetch();
      }
    },
  });

  return (
    <OrdersTable
      title="All Purchase Orders"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page: "poreport_page",
        search: "poreport_search",
        filter: "poreport_filter_v2",
        hilite: "poreport_highlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showTotalsButton={true}
      extraTotals={extraTotals}
      paramsBuilder={paramsBuilder}
      fetchOverride={fetchOverride}    // 👈 Fix 1 here
      onRowsChange={onRowsChange}
      totalLabel={totalLabel}
      showTotalsNearPill={true}
      tableId="poReport"
    />
  );
}
