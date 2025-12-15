// src/pages/CollectRefund.jsx
import React, { useCallback, useState } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

const TZ = "America/Chicago";

/* ---------- Columns ---------- */
const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "orderDate", label: "Order Date" },
  { key: "yardDetails", label: "Yard Details" },
  { key: "refundToCollect", label: "Refund to Collect ($)" },
];

/* ---------- Helpers ---------- */
function formatDateSafe(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}

function parseAmountAfterColon(s) {
  if (!s || typeof s !== "string") return 0;
  const idx = s.indexOf(":");
  if (idx === -1) return 0;
  const n = parseFloat(s.slice(idx + 1).trim());
  return isNaN(n) ? 0 : n;
}

/* ---------- Fetch override ---------- */
async function fetchCollectRefund(params, headers) {
  const first = await API.get(`/orders/monthlyOrders`, { params: { ...params, page: 1 }, headers });
  const { orders: firstOrders = [], totalPages = 1 } = first.data || {};
  let allOrders = [...firstOrders];

  // fetch remaining pages
  if (totalPages > 1) {
    const requests = [];
    for (let p = 2; p <= totalPages; p++) {
      requests.push(API.get(`/orders/monthlyOrders`, { params: { ...params, page: p }, headers }));
    }
    const results = await Promise.all(requests);
    results.forEach(r => {
      const arr = Array.isArray(r.data?.orders) ? r.data.orders : [];
      allOrders = allOrders.concat(arr);
    });
  }

  // --- filter those with collectRefundCheckbox === "Ticked"
  const filtered = [];
  allOrders.forEach((order) => {
    const infos = Array.isArray(order.additionalInfo)
      ? order.additionalInfo.filter(i => i?.collectRefundCheckbox === "Ticked")
      : [];
    if (infos.length === 0) return;

    let totalRefundToCollect = 0;
    infos.forEach((info) => {
      const toCollect = parseFloat(info.refundToCollect || 0) || 0;
      const refunded = parseFloat(info.refundedAmount || 0) || 0;
      if (refunded === 0 && toCollect > 0) {
        totalRefundToCollect += toCollect;
      }
    });

    filtered.push({
      ...order,
      yardDetails: infos,
      refundToCollect: Number(totalRefundToCollect.toFixed(2)),
    });
  });

  return filtered;
}

/* ---------- Extra totals for modal ---------- */
const extraTotals = (rows) => {
  const totalCollect = rows.reduce(
    (s, o) => s + (parseFloat(o.refundToCollect) || 0),
    0
  );
  return [
    { name: "Total Orders with Refunds to Collect", value: rows.length },
    { name: "Total Refund Amount to Collect", value: `$${totalCollect.toFixed(2)}` },
  ];
};

/* ---------- Page ---------- */
export default function CollectRefund() {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [totalLabel, setTotalLabel] = useState(
    "Total Orders: 0 | To be Collected: $0.00"
  );

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
                <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1 text-white/90">
                  {row.yardDetails.map((y, i) => (
                    <div key={i} className="mb-2 pb-1 border-b border-white/10 last:border-0">
                      <div><b>Yard:</b> {y.yardName || "—"}</div>
                      <div><b>Status:</b> {y.status || "—"}</div>
                      <div><b>Stock No:</b> {y.stockNo || "—"}</div>
                      <div><b>Part Price:</b> ${Number(y.partPrice || 0).toFixed(2)}</div>
                      <div><b>Shipping:</b> {y.shippingDetails || "—"}</div>
                      <div><b>Others:</b> ${Number(y.others || 0).toFixed(2)}</div>
                      <div><b>Refund to Collect:</b> ${Number(y.refundToCollect || 0).toFixed(2)}</div>
                      <div><b>Refunded:</b> ${Number(y.refundedAmount || 0).toFixed(2)}</div>
                      <div><b>Return Tracking:</b> {y.returnTrackingCust || "—"}</div>
                      <div><b>Payment Status:</b> {y.paymentStatus || "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        case "refundToCollect":
          return `$${Number(row.refundToCollect || 0).toFixed(2)}`;
        default:
          return row[key] ?? "—";
      }
    },
    [expandedIds]
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
      const merged = await fetchCollectRefund(params, headers);
      return merged;
    },
    [paramsBuilder]
  );

  const onRowsChange = useCallback((rows) => {
    const totalCollect = rows.reduce(
      (s, o) => s + (parseFloat(o.refundToCollect) || 0),
      0
    );
    setTotalLabel(
      `Total Orders: ${rows.length} | To be Collected: $${totalCollect.toFixed(2)}`
    );
  }, []);

  return (
    <OrdersTable
      title="Collect Refund"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page: "collectRefundPage",
        search: "collectRefundSearch",
        filter: "collectRefundFilter_v1",
        hilite: "collectRefundHilite",
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
      tableId="collectRefund"
    />
  );
}
