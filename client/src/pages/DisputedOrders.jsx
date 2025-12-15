// src/pages/DisputedOrders.jsx
import React, { useCallback, useMemo, useState } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

/* ---------- Columns (order matters) ---------- */
const columns = [
  { key: "orderDate",     label: "Order Date" },
  { key: "orderNo",       label: "Order No" },
  { key: "salePrice",     label: "Sale Price" },
  { key: "salesAgent",    label: "Sales Agent" },
  { key: "customerName",  label: "Customer Name" },
  { key: "pReq",          label: "Part Name" },
  { key: "yardName",      label: "Yard Details" }, // all yard names + Show/Hide
  { key: "disputedBy",    label: "Change to Dispute by" },
  { key: "disputeDate",   label: "Disputed Date" },
  { key: "disputeReason", label: "Reason" },
  { key: "orderStatus",   label: "Order Status" },
];

/* ---------- Helpers (same style as Refunded/Cancelled) ---------- */
/**
 * Extract numeric shipping value from shippingDetails string
 * Handles both "Own shipping: X" and "Yard shipping: X" formats
 * Always extracts from shippingDetails, never from ownShipping/yardShipping fields
 */
function parseShippingCost(field) {
  if (!field || typeof field !== "string") return 0;
  // Match "Own shipping: X" or "Yard shipping: X" (case-insensitive, handles decimals)
  const match = field.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
  if (match) {
    const num = parseFloat(match[1]);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}
function computeYardDerived(yard) {
  const shippingCost           = parseShippingCost(yard?.shippingDetails);
  const partPrice              = parseFloat(yard?.partPrice || 0) || 0;
  const others                 = parseFloat(yard?.others || 0) || 0;
  const refundedAmount         = parseFloat(yard?.refundedAmount || 0) || 0;
  const custOwnShipReplacement = parseFloat(yard?.custOwnShipReplacement || 0) || 0;
  const yardOwnShipping        = parseFloat(yard?.yardOwnShipping || 0) || 0;
  const custOwnShippingReturn  = parseFloat(yard?.custOwnShippingReturn || 0) || 0;

  const yardSpendTotal =
    partPrice +
    shippingCost +
    others -
    refundedAmount +
    yardOwnShipping +
    custOwnShippingReturn -
    custOwnShipReplacement;

  const escSpending =
    yardOwnShipping +
    custOwnShippingReturn +
    custOwnShipReplacement;

  return {
    shippingCost,
    partPrice,
    others,
    refundedAmount,
    custOwnShipReplacement,
    yardOwnShipping,
    custOwnShippingReturn,
    yardSpendTotal,
    escSpending,
  };
}

/* Robust “Disputed By” extractor (tolerant to formats) */
function getDisputedByFromHistory(order = {}) {
  const hist = Array.isArray(order?.orderHistory) ? order.orderHistory : [];
  // earliest match wins if history is newest-first
  for (let i = hist.length - 1; i >= 0; i--) {
    const entry = hist[i];
    const text =
      typeof entry === "string"
        ? entry
        : (entry?.message || entry?.text || entry?.note || entry?.status || entry?.title || "");

    if (!text || typeof text !== "string") continue;

    const norm = text.replace(/\u2014|\u2013/g, "-");
    // Matches:
    // "Order status changed to Dispute by NAME on ...",
    // "Dispute by: NAME", "Changed to Dispute by - NAME", etc.
    const m =
      norm.match(
        /(?:order\s*status\s*(?:changed|updated)\s*to\s*)?dispute\s*by\s*[:\-]?\s+(.+?)(?:\s+on\s+|[.;,)]|$)/i
      ) ||
      norm.match(/changed\s*to\s*dispute\s*by\s*[:\-]?\s+(.+?)(?:\s+on\s+|[.;,)]|$)/i);

    if (m && m[1]) return m[1].trim();
  }
  return "";
}

const DisputedOrders = () => {
  // one toggle per row (expands ALL yards for that row)
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderCell = useCallback((row, key, formatDateSafe, currency) => {
    switch (key) {
      case "orderDate":
        return formatDateSafe(row.orderDate);

      case "orderNo":
        return row.orderNo || "—";

      case "salePrice":
        return currency(row.soldP || row.salePrice || 0);

      case "salesAgent":
        return row.salesAgent || "—";

      case "customerName":
        return row.fName && row.lName
          ? `${row.fName} ${row.lName}`
          : (row.customerName || "—");

      case "pReq":
        return row.pReq || row.partName || "—";

      case "yardName": {
        const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
        const hasAnyYard = yards.some(y => (y?.yardName || "").trim().length > 0);

        // stable id per row
        const id = row._id || row.orderNo || `${row.orderDate || ""}-${Math.random()}`;
        const isOpen = expandedIds.has(id);

        const yardNamesList = hasAnyYard ? (
          <div className="flex-1 text-white">
            {yards.map((y, idx) => (
              <div key={idx} className="font-medium whitespace-nowrap">
                {y?.yardName || "N/A"}
              </div>
            ))}
          </div>
        ) : (
          <span className="font-medium whitespace-nowrap">N/A</span>
        );

        return (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              {yardNamesList}
              {hasAnyYard && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(id); }}
                  className="text-blue-400 text-xs underline hover:text-blue-300 shrink-0"
                >
                  {isOpen ? "Hide Details" : "Show Details"}
                </button>
              )}
            </div>

            {isOpen && hasAnyYard && (
              <div className="whitespace-nowrap mt-2 text-sm text-white/80 space-y-2">
                {yards.map((yard, i) => {
                  const d = computeYardDerived(yard);
                  return (
                    <div key={i} className="border-t border-white/15 pt-2">
                      <div><b>Yard:</b> {yard?.yardName || "N/A"}</div>
                      <div><b>Part Price:</b> ${d.partPrice.toFixed(2)}</div>
                      <div><b>Shipping:</b> ${d.shippingCost.toFixed(2)}</div>
                      <div><b>Others:</b> ${d.others.toFixed(2)}</div>
                      <div><b>Yard refund:</b> ${d.refundedAmount.toFixed(2)}</div>
                      <div><b>Esc spending:</b> ${d.escSpending.toFixed(2)}</div>
                      <div><b>Yard spending:</b> ${d.yardSpendTotal.toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      case "disputedBy":
        // history first; then any explicit field if backend supplies it
        return getDisputedByFromHistory(row) || row.disputedBy || "—";

      case "disputeDate":
        return row.disputedDate ? formatDateSafe(row.disputedDate) : "—";

      case "disputeReason":
        return row.disputeReason || "—";

      case "orderStatus":
        return row.orderStatus || "";

      default:
        return row[key] ?? "—";
    }
  }, [expandedIds, toggleExpand]);

  // Realtime: refetch disputed orders when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.disputedOrders?.refetch) {
        window.__ordersTableRefs.disputedOrders.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.disputedOrders?.refetch) {
        window.__ordersTableRefs.disputedOrders.refetch();
      }
    },
  });

  return (
    <OrdersTable
      title="Disputed Orders"
      endpoint="/orders/disputedOrders"
      storageKeys={{
        page:   "disputedOrdersPage",
        search: "disputedOrdersSearch",
        filter: "disputedOrdersFilter_v1",
        hilite: "disputedOrdersHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showGP={false}
      /* Hide the eye/totals button on this page */
      showTotalsButton={false}
      /* No custom totals for this page */
      showOrdersCountInTotals={false}
      tableId="disputedOrders"
    />
  );
};

export default DisputedOrders;
