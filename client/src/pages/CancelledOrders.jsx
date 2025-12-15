// src/pages/CancelledOrders.jsx
import React, { useState, useCallback } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

/* ---------- Columns ---------- */
const columns = [
  { key: "orderDate",          label: "Order Date" },
  { key: "orderNo",            label: "Order No." },
  { key: "pReq",               label: "Part Name" },
  { key: "salesAgent",         label: "Sales Agent" },
  { key: "customerName",       label: "Customer Name" },
  { key: "yardName",           label: "Yard Details" }, // all yard names + Show/Hide
  { key: "cancelledBy",        label: "Cancelled By" },
  { key: "cancelledDate",      label: "Cancelled Date" },
  { key: "cancellationReason", label: "Reason" },
  { key: "orderStatus",        label: "Order Status" },
];

/* ---------- Yard helpers (same math style you use on Refunded) ---------- */
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

  return { shippingCost, partPrice, others, refundedAmount, custOwnShipReplacement,
           yardOwnShipping, custOwnShippingReturn, yardSpendTotal, escSpending };
}

/* ---------- Robust “Cancelled By” extractor ---------- */
/* Supports string or object entries; first (earliest) match wins */
function getCancelledByFromHistory(order) {
  console.log("order",order);
  const hist = Array.isArray(order?.orderHistory) ? order.orderHistory : [];
  console.log("hist",hist);
  const names = new Set();
  hist.forEach((entry = "") => {
    if (entry.includes("Order Cancelled") || entry.includes("Order status updated to Order Cancelled")) {
      const parts = entry.split(" by ");
      console.log("parts",parts);
      if (parts[1]) {
        const who = parts[1].split(" on ")[0]?.trim();
        if (who) names.add(who);
      }
    }
  });
  return [...names].join(", ");
}

/* ---------- Totals modal: (Cancelled + Refunded + Dispute)/Total ---------- */
const extraTotals = (_rows, { denomCount, badCount }) => {
  const denom = Number(denomCount) || 0;
  const bad   = Number(badCount)   || 0;
  const rate  = denom > 0 ? ((bad / denom) * 100).toFixed(2) : "0.00";
  return [
    { name: "Cancelled / Refunded / Disputed", value: String(bad) },
    { name: "Total Orders (scope)",            value: String(denom) },
    { name: "Cancellation Rate",               value: `${rate}%` },
  ];
};

const CancelledOrders = () => {
  // One toggle per row; expands ALL yards for that row
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderCell = useCallback((row, key, formatDateSafe) => {
    switch (key) {
      case "orderDate":
        return formatDateSafe(row.orderDate);

      case "orderNo":
        return row.orderNo || "—";

      case "pReq":
        return row.pReq || row.partName || "—";

      case "salesAgent":
        return row.salesAgent || "—";

      case "customerName":
        return row.fName && row.lName
          ? `${row.fName} ${row.lName}`
          : (row.customerName || "—");

      case "yardName": {
        const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
        const hasAnyYard = yards.some(y => (y?.yardName || "").trim().length > 0);
        const id = row._id || row.orderNo || `${row.orderDate || ""}-${Math.random()}`;
        const isOpen = expandedIds.has(id);

        const yardNamesList = hasAnyYard ? (
          <div className="flex-1 text-white">
            {yards.map((y, idx) => (
              <div key={idx} className="font-medium whitespace-nowrap">
                {y?.yardName || ""}
              </div>
            ))}
          </div>
        ) : (
          <span className="font-medium whitespace-nowrap"></span>
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

      case "cancelledBy":
        return getCancelledByFromHistory(row) || row._cancelledBy || row.cancelledBy || "—";

      case "cancelledDate":
        return row.cancelledDate ? formatDateSafe(row.cancelledDate) : "—";

      case "cancellationReason":
        return row.cancellationReason || "—";

      case "orderStatus":
        return row.orderStatus || "";

      default:
        return row[key] ?? "—";
    }
  }, [expandedIds, toggleExpand]);

  // Realtime: refetch cancelled orders when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.cancelledOrders?.refetch) {
        window.__ordersTableRefs.cancelledOrders.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.cancelledOrders?.refetch) {
        window.__ordersTableRefs.cancelledOrders.refetch();
      }
    },
  });

  return (
    <OrdersTable
      title="Cancelled Orders"
      endpoint="/orders/cancelledOrders"
      storageKeys={{
        page:   "cancelledOrdersPage",
        search: "cancelledOrdersSearch",
        filter: "cancelledOrdersFilter_v1",
        hilite: "cancelledOrdersHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      computeCancellationRate={true}
      denominatorEndpoint="/orders/monthlyOrders"
      extraTotals={extraTotals}
      tableId="cancelledOrders"
    />
  );
};

export default CancelledOrders;
