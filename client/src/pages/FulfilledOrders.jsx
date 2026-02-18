// src/pages/FulfilledOrders.jsx
import React, { useCallback, useEffect, useState } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

/* ---------- Columns (order matters) ---------- */
const columns = [
  { key: "orderDate",       label: "Order Date" },
  { key: "orderNo",         label: "Order No" },       // includes Show/Hide Details (part + customer)
  { key: "pReq",            label: "Part Name" },
  { key: "salesAgent",      label: "Sales Agent" },
  { key: "customerName",    label: "Customer Name" },
  { key: "escalationStatus",label: "Escalation Status" },
  { key: "orderStatus",     label: "Order Status" },
];

/* ---------- Helpers ---------- */
function isEscalated(order) {
  // mirrors your old logic: look at the first yard's escTicked
  const esc = order?.additionalInfo?.[0]?.escTicked;
  return String(esc).toLowerCase() === "yes";
}

const FulfilledOrders = () => {
  // one toggle per row; expands details under Order No
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const brand = useBrand(); // 50STARS / PROLANE
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

      case "orderNo": {
        const id = row._id || row.orderNo || `${row.orderDate || ""}-${Math.random()}`;
        const isOpen = expandedIds.has(id);
        return (
          <div className="min-w-[220px]">
            <div className="flex items-center justify-between gap-2">
              <span className="whitespace-nowrap">{row.orderNo || "—"}</span>
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(id); }}
                className="text-blue-400 text-xs underline hover:text-blue-300"
              >
                {isOpen ? "Hide Details" : "Show Details"}
              </button>
            </div>

            {isOpen && (
              <div className="mt-2 border-t border-white/15 pt-2 text-xs text-white/90 space-y-1">
                {/* Part block (mirrors your previous details) */}
                <div className="font-semibold">
                  {row.year ? `${row.year} ` : ""}
                  {row.make ? `${row.make} ` : ""}
                  {row.model || ""}
                </div>
                {row.desc && <div><b>Desc:</b> {row.desc}</div>}
                {row.partNo && <div><b>Part No:</b> {row.partNo}</div>}
                {row.vin && <div><b>VIN:</b> {row.vin}</div>}
                {row.warranty != null && <div><b>Warranty:</b> {row.warranty} days</div>}
                {row.programmingRequired != null && (
                  <div><b>Programming:</b> {row.programmingRequired ? "Yes" : "No"}</div>
                )}

                {/* Customer block */}
                <div className="border-t border-white/10 pt-2">
                  <div><b>Email:</b> {row.email || "—"}</div>
                  <div><b>Phone:</b> {row.phone || "—"}</div>
                  {(row.sAddressStreet || row.sAddressCity || row.sAddressState || row.sAddressZip || row.sAddressAcountry) && (
                    <div>
                      <b>Address:</b>{" "}
                      {[row.sAddressStreet, row.sAddressCity, row.sAddressState, row.sAddressZip, row.sAddressAcountry]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }

      case "pReq":
        return row.pReq || row.partName || "—";

      case "salesAgent":
        return row.salesAgent || "—";

      case "customerName":
        return row.customerName ||
               (row.fName && row.lName ? `${row.fName} ${row.lName}` : "—");

      case "escalationStatus": {
        const yes = isEscalated(row);
        return yes ? (
          <span className="px-2 py-0.5 rounded bg-green-200/40 text-green-900 font-medium">
            Yes
          </span>
        ) : (
          <span className="text-white/80">—</span>
        );
      }

      case "orderStatus":
        return row.orderStatus || "";

      default:
        return row[key] ?? "—";
    }
  }, [expandedIds, toggleExpand]);

  // Realtime: refetch fulfilled orders when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.fulfilledOrders?.refetch) {
        window.__ordersTableRefs.fulfilledOrders.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.fulfilledOrders?.refetch) {
        window.__ordersTableRefs.fulfilledOrders.refetch();
      }
    },
  });

  // Refetch when brand changes
  useEffect(() => {
    if (window.__ordersTableRefs?.fulfilledOrders?.refetch) {
      window.__ordersTableRefs.fulfilledOrders.refetch();
    }
  }, [brand]);

  return (
    <OrdersTable
      title="Fulfilled Orders"
      endpoint="/orders/fulfilledOrders"
      storageKeys={{
        page:   "fulfilledOrdersPage",
        search: "fulfilledOrdersSearch",
        filter: "fulfilledOrdersFilter_v1",
        hilite: "fulfilledOrdersHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showGP={false}
      /* Hide the totals Eye button on this page */
      showTotalsButton={false}
      /* No totals needed for this page */
      showOrdersCountInTotals={false}
      tableId="fulfilledOrders"
    />
  );
};

export default FulfilledOrders;
