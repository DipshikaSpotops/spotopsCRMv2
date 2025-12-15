// src/pages/Purchases.jsx
import React, { useCallback, useMemo, useState } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

/* ---------- Columns ---------- */
const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "orderDate", label: "Order Date" },
  { key: "yardDetails", label: "Yard Details" },
  { key: "totals", label: "Totals ($)" },
];

/* ---------- Helpers ---------- */
function parseMoney(n) {
  const x = Number.parseFloat(n);
  return Number.isFinite(x) ? x : 0;
}
function parseShippingDetails(s) {
  if (!s || typeof s !== "string") return { type: "", amount: 0 };
  const [typePart, amountPart] = s.split(":");
  const amount = parseMoney((amountPart || "").trim());
  return { type: (typePart || "").trim(), amount };
}

/* ---------- Multi-page fetch ---------- */
async function fetchAllMonthlyOrders(params, headers) {
  const first = await API.get(`/orders/monthlyOrders`, {
    params: { ...params, page: 1 },
    headers,
  });

  const { orders: firstOrders = [], totalPages = 1 } = first.data || {};
  let allOrders = [...firstOrders];

  if (totalPages > 1) {
    const reqs = [];
    for (let p = 2; p <= totalPages; p++) {
      reqs.push(API.get(`/orders/monthlyOrders`, { params: { ...params, page: p }, headers }));
    }
    const results = await Promise.all(reqs);
    results.forEach((res) => {
      const arr = Array.isArray(res.data?.orders) ? res.data.orders : [];
      allOrders = allOrders.concat(arr);
    });
  }

  return allOrders;
}

/* ---------- Filter + compute ---------- */
function parseAmountAfterColon(s) {
  if (!s || typeof s !== "string") return 0;
  const idx = s.indexOf(":");
  if (idx === -1) return 0;
  const n = parseFloat(s.slice(idx + 1).trim());
  return isNaN(n) ? 0 : n;
}

/* compute total for card-charged orders */
function computeGrandCardChargedUSD(orders) {
  let total = 0;
  for (const o of orders) {
    const addl = Array.isArray(o.additionalInfo) ? o.additionalInfo : [];
    for (const info of addl) {
      if (info?.paymentStatus === "Card charged") {
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

/* ---------- Extra totals for modal ---------- */
const extraTotals = (rows) => {
  const totalUSD = rows.reduce(
    (sum, o) => sum + (parseFloat(o._totalCardCharged || 0) || 0),
    0
  );
  return [
    { name: "Total Orders (Card Charged)", value: rows.length },
    { name: "Total Card Charged ($)", value: `$${totalUSD.toFixed(2)}` },
  ];
};

/* ---------- Page ---------- */
export default function Purchases() {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [totalLabel, setTotalLabel] = useState("Total Orders: 0 | Card Charged: $0.00");

  /* Yard qualifies if paymentStatus === Card charged */
  const yardQualifies = (info) => info?.paymentStatus === "Card charged";

  /* Compute per-order derived */
  const processOrders = (orders) =>
    orders
      .map((order) => {
        const infos = (order.additionalInfo || []).filter(yardQualifies);
        if (!infos.length) return null;

        let totalCardCharged = 0;
        infos.forEach((info) => {
          const { amount: ship } = parseShippingDetails(info.shippingDetails);
          const part = parseMoney(info.partPrice);
          const others = parseMoney(info.others);
          const refunded = parseMoney(info.refundedAmount);
          totalCardCharged += Math.max(0, part + ship + others - refunded);
        });

        return {
          ...order,
          yardDetails: infos,
          _totalCardCharged: Number(totalCardCharged.toFixed(2)),
        };
      })
      .filter(Boolean);

  /* render cell */
  const renderCell = useCallback(
    (row, key, formatDateSafe) => {
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
                      next.has(row.orderNo) ? next.delete(row.orderNo) : next.add(row.orderNo);
                      return next;
                    });
                  }}
                  className="text-blue-400 text-xs underline hover:text-blue-300"
                >
                  {isExpanded ? "Hide Details" : "Show Details"}
                </button>
              </div>
              {isExpanded && (
                <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1 text-white/90">
                  {row.yardDetails.map((y, i) => (
                    <div key={i} className="mb-2 pb-1 border-b border-white/10 last:border-0">
                      <div><b>Yard:</b> {y.yardName || "—"}</div>
                      <div><b>Status:</b> {y.status || "—"}</div>
                      <div><b>Payment:</b> {y.paymentStatus || "—"}</div>
                      <div><b>Stock No:</b> {y.stockNo || "—"}</div>
                      <div><b>Shipping:</b> {y.shippingDetails || "—"}</div>
                      <div><b>Part Price:</b> ${Number(y.partPrice || 0).toFixed(2)}</div>
                      <div><b>Others:</b> ${Number(y.others || 0).toFixed(2)}</div>
                      <div><b>Refunded:</b> ${Number(y.refundedAmount || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );

        case "totals":
          return `$${Number(row._totalCardCharged || 0).toFixed(2)}`;

        default:
          return row[key] ?? "—";
      }
    },
    [expandedIds]
  );

  /* ---------- params + fetch override ---------- */
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

      const yardOrders = (all || []).filter(
        (o) =>
          Array.isArray(o.additionalInfo) &&
          o.additionalInfo.some((ai) => ai?.paymentStatus === "Card charged")
      );
      return processOrders(yardOrders);
    },
    [paramsBuilder]
  );

  const onRowsChange = useCallback((rows) => {
    const totalUSD = rows.reduce(
      (s, o) => s + (parseFloat(o._totalCardCharged) || 0),
      0
    );
    setTotalLabel(
      `Total Orders: ${rows.length} | Card Charged: $${totalUSD.toFixed(2)}`
    );
  }, []);

  // Realtime: refetch purchases when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.purchases?.refetch) {
        window.__ordersTableRefs.purchases.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.purchases?.refetch) {
        window.__ordersTableRefs.purchases.refetch();
      }
    },
  });

  return (
    <OrdersTable
      title="Purchases (Card Charged)"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page: "purchasesPage",
        search: "purchasesSearch",
        filter: "purchasesFilter_v1",
        hilite: "purchasesHilite",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showTotalsButton={true}
      extraTotals={extraTotals}
      paramsBuilder={paramsBuilder}
      fetchOverride={fetchOverride}
      onRowsChange={onRowsChange}
      totalLabel={totalLabel}
      showTotalsNearPill={true}
      tableId="purchases"
    />
  );
}
