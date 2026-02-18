// /src/pages/InTransitOrders.jsx
import React, { useCallback, useEffect, useState } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

/* ---------- Columns (order matters) ---------- */
const columns = [
  { key: "orderDate",     label: "Order Date" },
  { key: "orderNo",       label: "Order No" },
  { key: "salesAgent",    label: "Sales Agent" },
  { key: "pReq",          label: "Part Name" },
  { key: "customerName",  label: "Customer Info" },
  { key: "yardName",      label: "Yard Details" },
  // { key: "lastComment",   label: "Last Comment" }, // <- custom render below
  // { key: "orderStatus",   label: "Order Status" },
];

/* ---------- helpers for the yard details block ---------- */
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
    shippingCost, partPrice, others, refundedAmount,
    custOwnShipReplacement, yardOwnShipping, custOwnShippingReturn,
    yardSpendTotal, escSpending
  };
}

export default function InTransitOrders() {
  // one toggle per row; used by yard details + part/customer blocks
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const brand = useBrand(); // 50STARS / PROLANE
  const toggleExpand = useCallback((row) => {
    const id = row._id || row.orderNo || `${row.orderDate || ""}-${Math.random()}`;
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const isOpenId = (row) => {
    const id = row._id || row.orderNo || `${row.orderDate || ""}-fallback`;
    return expandedIds.has(id);
  };

  /** Custom cell renderer */
  const renderCell = useCallback((row, key, formatDateSafe, currency) => {
    const open = isOpenId(row);

    switch (key) {
      case "orderDate":
        return <div className="text-base">{formatDateSafe(row.orderDate)}</div>;

      case "orderNo":
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="whitespace-nowrap text-base">{row.orderNo || "—"}</span>
            {/* <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(row); }}
              className="text-blue-400 text-xs underline hover:text-blue-300 whitespace-nowrap shrink-0"
            >
              {open ? "Hide Details" : "Show Details"}
            </button> */}
          </div>
        );

      case "salesAgent":
        return row.salesAgent || "—";

      case "pReq":
        return (
          <div className="text-base">
            {row.pReq || row.partName || "—"}
          </div>
        );

      case "customerName":
        const customerName = row.fName && row.lName 
          ? `${row.fName} ${row.lName}` 
          : row.customerName || "—";
        const addressParts = [
          row.sAddressStreet,
          row.sAddressCity,
          row.sAddressState,
          row.sAddressZip,
          row.sAddressAcountry
        ].filter(part => part && part.trim().length > 0);
        const address = addressParts.length > 0 ? addressParts.join(", ") : "—";
        return (
          <div className="text-base space-y-1">
            <div className="border-b border-white/20 pb-0.5 inline-block">{customerName}</div>
            <div>{address}</div>
          </div>
        );

      case "yardName": {
        const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
        const hasAnyYard = yards.some(y => (y?.yardName || "").trim().length > 0);
        if (!hasAnyYard) return <span className="font-medium text-base">—</span>;

        return (
          <div className="space-y-2 max-w-full">
            <div className="flex-1 text-white text-base">
              {yards.map((y, idx) => {
                const trackingNo = Array.isArray(y?.trackingNo) && y.trackingNo.length > 0
                  ? y.trackingNo.filter(t => t && String(t).trim()).join(", ") || "N/A"
                  : y?.trackingNo && String(y.trackingNo).trim()
                    ? String(y.trackingNo)
                    : "N/A";
                
                return (
                  <div key={idx} className="font-medium break-words overflow-wrap-anywhere space-y-1">
                    <div className="border-b border-white/20 pb-0.5 inline-block">{y?.yardName || ""}</div>
                    <div className="text-sm opacity-90">
                      <b>Tracking No:</b> {trackingNo}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      // case "lastComment": {
      //   // last note from the last additionalInfo item
      //   const ai = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
      //   const lastAI = ai.length ? ai[ai.length - 1] : null;
      //   const n = lastAI?.notes;
      //   const text = Array.isArray(n)
      //     ? String(n[n.length - 1] ?? "").trim()
      //     : String(n ?? "").trim();

      //   return (
      //     <div
      //       className="
      //         text-sm leading-snug
      //         whitespace-normal break-words
      //         max-w-full
      //         [overflow-wrap:anywhere]
      //       "
      //     >
      //       {text || "N/A"}
      //     </div>
      //   );
      // }

      // case "orderStatus":
      //   return row.orderStatus || "";

      default:
        return row[key] ?? "—";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedIds]);

  // Realtime: when any order is created or updated, ask OrdersTable to refetch.
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.inTransit?.refetch) {
        window.__ordersTableRefs.inTransit.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.inTransit?.refetch) {
        window.__ordersTableRefs.inTransit.refetch();
      }
    },
  });

  // When brand changes, force the table to refetch with the new brand
  useEffect(() => {
    if (window.__ordersTableRefs?.inTransit?.refetch) {
      window.__ordersTableRefs.inTransit.refetch();
    }
  }, [brand]);

  return (
    <div className="in-transit-table-wrapper">
      <style>{`
        /* Make Yard Details and Last Comment columns wider and equal width */
        .in-transit-table-wrapper table {
          table-layout: fixed;
          width: 100%;
        }
        /* Table headers should stay on one line */
        .in-transit-table-wrapper table th {
          white-space: nowrap !important;
          overflow: hidden !important;
        }
        /* Table body cells should wrap text to prevent overflow */
        .in-transit-table-wrapper table td {
          overflow: hidden !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          white-space: normal !important;
          font-size: 0.9rem !important; /* Slightly smaller font size */
        }
        /* Yard Details - wider */
        .in-transit-table-wrapper table th:nth-child(6),
        .in-transit-table-wrapper table td:nth-child(6) {
          width: 26% !important;
          min-width: 26% !important;
        }
        /* Order Date column - narrower */
        .in-transit-table-wrapper table th:nth-child(1),
        .in-transit-table-wrapper table td:nth-child(1) {
          width: 8% !important;
        }
        /* Order No column - narrower */
        .in-transit-table-wrapper table th:nth-child(2),
        .in-transit-table-wrapper table td:nth-child(2) {
          width: 10% !important;
        }
        /* Sales Agent column */
        .in-transit-table-wrapper table th:nth-child(3),
        .in-transit-table-wrapper table td:nth-child(3) {
          width: 10% !important;
        }
        /* Part Name column - wider to use the space */
        .in-transit-table-wrapper table th:nth-child(4),
        .in-transit-table-wrapper table td:nth-child(4) {
          width: 18% !important;
        }
        /* Customer Info column - wider for header */
        .in-transit-table-wrapper table th:nth-child(5),
        .in-transit-table-wrapper table td:nth-child(5) {
          width: 22% !important;
        }
        /* Actions column - narrower */
        .in-transit-table-wrapper table th:last-child,
        .in-transit-table-wrapper table td:last-child {
          width: 10% !important;
          min-width: 10% !important;
        }
      `}</style>
      <OrdersTable
        title="In Transit Orders"
        endpoint="/orders/inTransitOrders"
        storageKeys={{
          page:   "inTransit_orders_page",
          search: "inTransit_orders_search",
          filter: "ito_filter_v2",
          hilite: "inTransit_highlightedOrderNo",
        }}
        columns={columns}
        renderCell={renderCell}
        showAgentFilter={true}       // Admin can narrow; Sales is auto-narrowed by OrdersTable
        showGP={false}               // no GP totals here
        showTotalsButton={false}     // hide eye button
        rowsPerPage={25}
        tableId="inTransit"
        paramsBuilder={({ filter, query, sortBy, sortOrder }) => {
          const params = {};
          if (filter?.start && filter?.end) {
            params.start = filter.start;
            params.end   = filter.end;
          } else if (filter?.month && filter?.year) {
            params.month = filter.month;
            params.year  = filter.year;
          }
          // Send a very large limit to fetch all orders (backend defaults to 25)
          params.limit = 10000;
          params.page = 1; // Always get first page from backend, then paginate client-side
          if (query) params.q = query;
          if (sortBy) params.sortBy = sortBy;
          if (sortOrder) params.sortOrder = sortOrder;
          return params;
        }}
      />
    </div>
  );
}
