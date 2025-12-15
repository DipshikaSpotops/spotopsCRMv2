// src/pages/CancelledRefundedReport.jsx
import React, { useCallback, useMemo, useState, useEffect } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

const TZ = "America/Chicago";

/* ---------- Columns ---------- */
const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "orderDate", label: "Order Date" },
  { key: "cancelledDate", label: "Cancelled Date" },
  { key: "custRefundDate", label: "Refunded Date" },
  { key: "cancellationReason", label: "Cancellation Reason" },
  { key: "custRefAmount", label: "Refund Amount" },
];

/* ---------- Helpers ---------- */
function formatDateSafe(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}

// try to pull an ISO date out of a history line like “… on 7 Oct, 2025”
function extractDateFromHistoryLine(line = "") {
  const m = line.match(/on (\d{1,2}) (\w+), (\d{4})/i);
  if (!m) return null;
  const [, day, mon, year] = m;
  const tryDate = new Date(`${day} ${mon} ${year}`);
  return isNaN(tryDate) ? null : tryDate.toISOString();
}

// if refunded date missing, infer it from orderHistory
function maybeInferRefundDate(order) {
  if (order.custRefundDate) return order.custRefundDate;
  const hist = Array.isArray(order.orderHistory) ? order.orderHistory : [];
  const hit = hist.find((h) => /refunded/i.test(h));
  const iso = extractDateFromHistoryLine(hit || "");
  return iso || null;
}

/* ---------- Merge fetch (no endpoint changes) ---------- */
async function fetchCancelledAndRefunded(params, headers) {
  const [cancelledRes, refundedRes] = await Promise.all([
    API.get(`/orders/cancelled-by-date`, { params, headers }),
    API.get(`/orders/refunded-by-date`, { params, headers }),
  ]);

  const cancelled = Array.isArray(cancelledRes.data) ? cancelledRes.data : [];
  const refunded = Array.isArray(refundedRes.data) ? refundedRes.data : [];
  const combined = [...cancelled, ...refunded];

  const map = new Map();

  for (const o of combined) {
    const id =
      o.orderNo ||
      o._id ||
      `${o.email || "unknown"}:${o.cancelledDate || o.custRefundDate || ""}`;

    const curr = map.get(id);

    const next = {
      _id: o._id || id,
      orderNo: o.orderNo || id,
      orderDate: o.orderDate ?? curr?.orderDate ?? null,
      cancelledDate: o.cancelledDate ?? curr?.cancelledDate ?? null,
      // keep present value, else new, else infer later
      custRefundDate: curr?.custRefundDate ?? o.custRefundDate ?? null,
      // IMPORTANT: avoid double counting; take the max non-NaN amount
      custRefAmount: Math.max(
        Number.isFinite(parseFloat(curr?.custRefAmount)) ? parseFloat(curr.custRefAmount) : 0,
        Number.isFinite(parseFloat(o?.custRefAmount)) ? parseFloat(o.custRefAmount) : 0
      ),
      cancellationReason: curr?.cancellationReason || o.cancellationReason || "",
      customerName:
        curr?.customerName ||
        o.customerName ||
        ((o.fName || o.lName) ? `${o.fName || ""} ${o.lName || ""}`.trim() : ""),
      email: curr?.email || o.email || "",
      pReq: curr?.pReq || o.pReq,
      partName: curr?.partName || o.partName,
      desc: curr?.desc || o.desc,
      partNo: curr?.partNo || o.partNo,
      vin: curr?.vin || o.vin,
      warranty: curr?.warranty || o.warranty,
      orderHistory: [...(curr?.orderHistory || []), ...(o.orderHistory || [])],
    };

    map.set(id, next);
  }

  // second pass: infer missing refunded dates from history
  for (const [id, v] of map) {
    const inferred = maybeInferRefundDate(v);
    if (inferred && !v.custRefundDate) {
      map.set(id, { ...v, custRefundDate: inferred });
    }
  }

  return Array.from(map.values());
}

/* ---------- Extra totals for the modal ---------- */
const extraTotals = (rows) => {
  const refundedRows = rows.filter((r) => !!r.custRefundDate);
  const totalRefundAmt = refundedRows.reduce(
    (s, o) => s + (parseFloat(o.custRefAmount) || 0),
    0
  );
  const reasons = new Set(rows.map((r) => r.cancellationReason || ""));
  return [
    { name: "Total Cancelled + Refunded Orders", value: rows.length },
    { name: "Total Refunded Amount (with Refunded Date)", value: `$${totalRefundAmt.toFixed(2)}` },
    { name: "Distinct Reasons", value: reasons.size },
  ];
};

/* ---------- Page ---------- */
export default function CancelledRefundedReport() {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [totalLabel, setTotalLabel] = useState("Total Orders: 0 | Refunded: $0.00");

  /* cell renderer (unchanged) */
  const renderCell = useCallback(
    (row, key) => {
      const isExpanded = expandedIds.has(row.orderNo);
      switch (key) {
        case "orderNo":
          return row.orderNo || "—";
        case "orderDate":
          return formatDateSafe(row.orderDate);
        case "cancelledDate":
          return formatDateSafe(row.cancelledDate);
        case "custRefundDate":
          return formatDateSafe(row.custRefundDate);
        case "cancellationReason":
          return (
            <div>
              <div className="flex justify-between items-center">
                <span>{row.cancellationReason || "—"}</span>
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
                  {isExpanded ? "Show Details" : "Show Details"}
                </button>
              </div>
              {isExpanded && (
                <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1 text-white/90">
                  <div><b>Customer:</b> {row.customerName || "—"}</div>
                  <div><b>Email:</b> {row.email || "—"}</div>
                  <div><b>Part:</b> {row.pReq || row.partName || "—"}</div>
                  {row.desc && <div><b>Desc:</b> {row.desc}</div>}
                  {row.partNo && <div><b>Part No:</b> {row.partNo}</div>}
                  {row.vin && <div><b>VIN:</b> {row.vin}</div>}
                  {row.warranty && <div><b>Warranty:</b> {row.warranty} days</div>}
                </div>
              )}
            </div>
          );
        case "custRefAmount":
          return `$${Number(row.custRefAmount || 0).toFixed(2)}`;
        default:
          return row[key] ?? "—";
      }
    },
    [expandedIds]
  );

  /* build params for the two endpoints */
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

  /* let OrdersTable FETCH for us by merging both endpoints */
  const fetchOverride = useCallback(async ({ filter }) => {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const params = paramsBuilder({ filter });
    const merged = await fetchCancelledAndRefunded(params, headers);
    return merged;
  }, [paramsBuilder]);

  /* Update the inline label whenever the visible rows change */
  const onRowsChange = useCallback((sortedVisibleRows) => {
    const refundedOnly = sortedVisibleRows.filter((r) => !!r.custRefundDate);
    const totalRefunded = refundedOnly.reduce(
      (s, o) => s + (parseFloat(o.custRefAmount) || 0),
      0
    );
    setTotalLabel(
      `Total Orders: ${sortedVisibleRows.length} | Refunded: $${totalRefunded.toFixed(2)}`
    );
  }, []);

  // Realtime: refetch cancelled + refunded report when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.cancelledRefunds?.refetch) {
        window.__ordersTableRefs.cancelledRefunds.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.cancelledRefunds?.refetch) {
        window.__ordersTableRefs.cancelledRefunds.refetch();
      }
    },
  });

  return (
    <OrdersTable
      title="Cancellations / Refunds"
      endpoint="/orders/cancelled-by-date"            // kept as-is; we override the fetch
      storageKeys={{
        page: "cancelledRefundsPage",
        search: "cancelledRefundsSearch",
        filter: "cancelledRefundsFilter_v1",
        hilite: "cancelledRefundsHighlightedOrderNo",
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
      tableId="cancelledRefunds"
    />
  );
}
