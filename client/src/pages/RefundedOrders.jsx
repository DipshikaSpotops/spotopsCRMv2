// src/pages/RefundedOrders.jsx
import React, { useMemo, useState, useCallback } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

/** Table columns (order matters) */
const columns = [
  { key: "orderDate",      label: "Order Date" },
  { key: "orderNo",        label: "Order No." },
  { key: "pReq",           label: "Part Name" },
  { key: "salesAgent",     label: "Sales Agent" },
  { key: "customerName",   label: "Customer Name" },
  { key: "yardName",       label: "Yard Details" },       // shows all yard names + Show/Hide
  { key: "refundedBy",     label: "Refunded By" },
  { key: "custRefundDate", label: "Refunded Date" },
  { key: "custRefAmount",  label: "Refunded" },
  { key: "totalYardSpend", label: "Total Yard Spend" },   // per-yard spends listed
  { key: "orderStatus",    label: "Order Status" },
];

/** Parse shipping cost from "X: 12.34" */
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

/** Yard-level derived numbers (your formulas) */
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

function getRefundedByFromHistory(order) {
  const hist = Array.isArray(order?.orderHistory) ? order.orderHistory : [];
  const names = new Set();
  hist.forEach((entry = "") => {
    if (entry.includes("Order status changed to Refunded")) {
      const parts = entry.split(" by ");
      console.log("parts",parts);
      const who = parts[1]?.split(" on ")[0]?.trim();
      if (who) names.add(who);
    }
  });
  return [...names].join(", ");
}

/** Totals modal: sum of refunded amounts */
const extraTotals = (rows) => {
  const totalRefunded = rows.reduce(
    (sum, r) => sum + (parseFloat(r?.custRefAmount) || 0),
    0
  );
  return [{ name: "Total Refunded Amount", value: `$${totalRefunded.toFixed(2)}` }];
};

const RefundedOrders = () => {
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

        // stable row id for expand/collapse
        const id = row._id || row.orderNo || `${row.orderDate || ""}-${Math.random()}`;
        const isOpen = expandedIds.has(id);

        // list ALL yard names in collapsed state (row-wise)
        const yardNamesList = hasAnyYard
          ? (
            <div className="flex-1 text-white">
              {yards.map((y, idx) => (
                <div key={idx} className="font-medium whitespace-nowrap">
                  {y?.yardName || "N/A"}
                </div>
              ))}
            </div>
          )
          : <span className="font-medium whitespace-nowrap">N/A</span>;

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

      case "refundedBy":
        return getRefundedByFromHistory(row) || row.refundedBy || "—";

      case "custRefundDate":
        return row.custRefundDate ? formatDateSafe(row.custRefundDate) : "—";

      case "custRefAmount":
        return currency(row.custRefAmount || 0);

      case "totalYardSpend": {
        const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
        if (!yards.length) return currency(0);
        return (
          <div className="space-y-1">
            {yards.map((y, i) => {
              const { yardSpendTotal } = computeYardDerived(y);
              return (
                <div key={i} className="whitespace-nowrap">
                  <b>Yard {i + 1} Spend:</b> {currency(yardSpendTotal)}
                </div>
              );
            })}
          </div>
        );
      }

      case "orderStatus":
        return row.orderStatus || "";

      default:
        return row[key] ?? "—";
    }
  }, [expandedIds, toggleExpand]);

  // Realtime: refetch refunded orders when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.refundedOrders?.refetch) {
        window.__ordersTableRefs.refundedOrders.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.refundedOrders?.refetch) {
        window.__ordersTableRefs.refundedOrders.refetch();
      }
    },
  });

  return (
    <OrdersTable
      title="Refunded Orders"
      endpoint="/orders/refundedOrders"
      storageKeys={{
        page:   "refundedOrdersPage",
        search: "refundedOrdersSearch",
        filter: "refundedOrdersFilter_v1",
        hilite: "refundedOrdersHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}           // Admin gets AgentDropdown; Sales/Support rules handled inside OrdersTable
      showGP={false}
      extraTotals={extraTotals}        // Totals modal shows total refunded amount
      showOrdersCountInTotals={false}
      tableId="refundedOrders"
    />
  );
};

export default RefundedOrders;
