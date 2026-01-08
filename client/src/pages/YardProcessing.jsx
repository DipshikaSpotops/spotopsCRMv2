import React, { useCallback, useState } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

const columns = [
  { key: "orderDate",    label: "Order Date" },
  { key: "orderNo",      label: "Order No" },
  { key: "salesAgent",   label: "SalesAgent" },
  { key: "pReq",         label: "Part Info" },
  { key: "customerName", label: "Customer Info" },
  { key: "yardName",     label: "Yard Details" },
  { key: "lastComment",  label: "Last Comment" },
  // { key: "orderStatus",  label: "Order Status" },
];

const wrap5 = (str = "") =>
  !str ? "N/A" : str.trim().split(/\s+/)
    .reduce((acc, w, i) => acc + w + ((i + 1) % 5 === 0 ? "\n" : " "), "")
    .trim();

export default function YardProcessingOrders() {
  const [expandedIds, setExpandedIds] = useState(() => new Set());
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

  const renderCell = useCallback((row, key, formatDateSafe) => {
    const open = isOpenId(row);
    switch (key) {
      case "orderDate":    return formatDateSafe(row.orderDate);
      case "orderNo":
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="whitespace-nowrap">{row.orderNo || "—"}</span>
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(row); }}
              className="text-blue-400 text-xs underline hover:text-blue-300 whitespace-nowrap shrink-0"
            >
              {open ? "Hide Details" : "Show Details"}
            </button>
          </div>
        );
      case "salesAgent":
        return row.salesAgent || "—";
      case "pReq":
        return (
          <div>
            <div>{row.pReq || row.partName || "—"}</div>
            {open && (
              <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                <b>{row.year} {row.make} {row.model}</b>
                <div><b>Desc:</b> {row.desc}</div>
                <div><b>Part No:</b> {row.partNo}</div>
                <div><b>VIN:</b> {row.vin}</div>
                <div><b>Warranty:</b> {row.warranty} days</div>
                <div><b>Programming:</b> {row.programmingRequired ? "Yes" : "No"}</div>
              </div>
            )}
          </div>
        );
      case "customerName":
        return (
          <div>
            <div>{row.customerName || (row.fName && row.lName ? `${row.fName} ${row.lName}` : "—")}</div>
            {open && (
              <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                <div><b>Email:</b> {row.email}</div>
                <div><b>Phone:</b> {row.phone}</div>
                <div>
                  <b>Address:</b> {(() => {
                    const addressParts = [
                      row.sAddressStreet,
                      row.sAddressCity,
                      row.sAddressState,
                      row.sAddressZip,
                      row.sAddressAcountry
                    ].filter(part => part && part.trim().length > 0);
                    return addressParts.length > 0 ? addressParts.join(", ") : "—";
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      case "yardName": {
        const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
        if (!yards.length) return "—";
        return (
          <div className="space-y-2 max-w-full">
            {yards.map((y, idx) => (
              <div key={idx} className="font-medium break-words overflow-wrap-anywhere">{y?.yardName || "N/A"}</div>
            ))}
            {open && (
              <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-2">
                {yards.map((y, idx) => (
                  <div key={`yd-${idx}`}>
                    <div><b>Status:</b> {y?.status || "N/A"}</div>
                    <div><b>Expected Ship:</b> {y?.expShipDate || "N/A"}</div>
                    <div><b>Expedite:</b> {String(y?.expediteShipping) === "true" ? "Yes" : "No"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      case "lastComment": {
  const ai = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
  const lastAI = ai.length ? ai[ai.length - 1] : null;

  const n = lastAI?.notes;
  const text = Array.isArray(n)
    ? String(n[n.length - 1] ?? "").trim()
    : String(n ?? "").trim();

  return (
    <div
      className="
        text-sm leading-snug
        whitespace-normal
        break-words
        max-w-full
        [overflow-wrap:anywhere] /* handles VeryLongUnbrokenStrings */
      "
    >
      {text || "N/A"}
    </div>
  );
}
      // case "orderStatus":  return row.orderStatus || "—";
      default:             return row[key] ?? "—";
    }
  }, [expandedIds, toggleExpand]);

  // Realtime: refetch yard-processing table when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.yardProcessing?.refetch) {
        window.__ordersTableRefs.yardProcessing.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.yardProcessing?.refetch) {
        window.__ordersTableRefs.yardProcessing.refetch();
      }
    },
  });

  return (
    <div className="yard-processing-table-wrapper">
      <style>{`
        /* Increase font size for better readability */
        .yard-processing-table-wrapper {
          font-size: 1rem !important;
        }
        .yard-processing-table-wrapper table {
          font-size: 1rem !important;
        }
        /* Make Yard Details and Last Comment columns wider and equal width */
        .yard-processing-table-wrapper table {
          table-layout: fixed;
          width: 100%;
        }
        /* Table headers should stay on one line */
        .yard-processing-table-wrapper table th {
          white-space: nowrap !important;
          overflow: hidden !important;
          font-size: 1rem !important;
        }
        /* Table body cells should wrap text to prevent overflow */
        .yard-processing-table-wrapper table td {
          overflow: hidden !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          white-space: normal !important;
          font-size: 1rem !important;
        }
        /* Increase font size for expanded details */
        .yard-processing-table-wrapper .text-xs {
          font-size: 0.9rem !important;
        }
        /* Yard Details and Last Comment - wider and equal */
        .yard-processing-table-wrapper table th:nth-child(5),
        .yard-processing-table-wrapper table td:nth-child(5) {
          width: 23% !important;
          min-width: 23% !important;
        }
        .yard-processing-table-wrapper table th:nth-child(6),
        .yard-processing-table-wrapper table td:nth-child(6) {
          width: 23% !important;
          min-width: 23% !important;
        }
        /* Order No column - wider to show "Show Det" button */
        .yard-processing-table-wrapper table th:nth-child(2),
        .yard-processing-table-wrapper table td:nth-child(2) {
          width: 12% !important;
        }
        /* Order Date and Part Name columns */
        .yard-processing-table-wrapper table th:nth-child(1),
        .yard-processing-table-wrapper table td:nth-child(1),
        .yard-processing-table-wrapper table th:nth-child(3),
        .yard-processing-table-wrapper table td:nth-child(3) {
          width: 8% !important;
        }
        /* Customer Name column - wider for header */
        .yard-processing-table-wrapper table th:nth-child(4),
        .yard-processing-table-wrapper table td:nth-child(4) {
          width: 11% !important;
        }
        /* Actions column - narrower */
        .yard-processing-table-wrapper table th:last-child,
        .yard-processing-table-wrapper table td:last-child {
          width: 6% !important;
          min-width: 6% !important;
        }
      `}</style>
      <OrdersTable
        title="Yard Processing Orders"
        endpoint="/orders/yardProcessingOrders"
        storageKeys={{
          page:   "yardProcessingPage",
          search: "yardProcessingSearch",
          filter: "ypo_filter_v2",
          hilite: "yardProcessingHighlightedOrderNo",
        }}
        columns={columns}
        renderCell={renderCell}
        showAgentFilter={false}
        showGP={false}
        showTotalsButton={false}
        rowsPerPage={25}
        // 👇 Fetch all orders, then paginate client-side
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
        tableId="yardProcessing"
      />
    </div>
  );
}
