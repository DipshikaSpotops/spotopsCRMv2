import React, { useCallback, useEffect, useState } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

const columns = [
  { key: "orderDate",    label: "Order Date", minWidth: 120 },
  { key: "orderNo",      label: "Order No", minWidth: 150 },
  { key: "salesAgent",   label: "SalesAgent", minWidth: 100 },
  { key: "pReq",         label: "Part Info", minWidth: 160, wrap: true },
  { key: "customerName", label: "Customer Info", minWidth: 160, wrap: true },
  { key: "yardName",     label: "Yard Data", minWidth: 220, wrap: true },
  { key: "lastComment",  label: "Last Comment", minWidth: 240, wrap: true },
];

const wrap5 = (str = "") =>
  !str ? "N/A" : str.trim().split(/\s+/)
    .reduce((acc, w, i) => acc + w + ((i + 1) % 5 === 0 ? "\n" : " "), "")
    .trim();

export default function YardProcessingOrders() {
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
              <div key={idx} className="font-medium break-words overflow-wrap-anywhere">
                <div>{y?.yardName || "N/A"}</div>
                <div className="text-xs text-white/80">
                  <b>Payment status:</b> {y?.pamentStatus || y?.paymentStatus || ""}
                </div>
              </div>
            ))}
            {open && (
              <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-2">
                {yards.map((y, idx) => (
                  <div key={`yd-${idx}`}>
                    <div><b>Status:</b> {y?.status || "N/A"}</div>
                    <div><b>Payment status:</b> {y?.pamentStatus || y?.paymentStatus || ""}</div>
                    <div><b>Expected Ship:</b> {y?.expShipDate || "N/A"}</div>
                    <div>
                      <b>Expedite:</b>{" "}
                      {(y?.yardExpedite === true ||
                        y?.yardExpedite === "true" ||
                        y?.expediteShipping === true ||
                        y?.expediteShipping === "true")
                        ? "Yes"
                        : "No"}
                    </div>
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

  // When brand changes, force the table to refetch with the new brand
  useEffect(() => {
    if (window.__ordersTableRefs?.yardProcessing?.refetch) {
      window.__ordersTableRefs.yardProcessing.refetch();
    }
  }, [brand]);

  return (
    <div className="yard-processing-table-wrapper">
      <style>{`
        .yard-processing-table-wrapper {
          font-size: 1rem !important;
        }
        .yard-processing-table-wrapper table {
          font-size: 1rem !important;
          table-layout: auto;
          width: max-content;
          min-width: 100%;
        }
        .yard-processing-table-wrapper table th,
        .yard-processing-table-wrapper table td {
          font-size: 1rem !important;
          vertical-align: top;
        }
        /* Yard Data + Last Comment: keep readable width, allow wrap (no clipping) */
        .yard-processing-table-wrapper table th[data-col="yardName"],
        .yard-processing-table-wrapper table td[data-col="yardName"],
        .yard-processing-table-wrapper table th[data-col="lastComment"],
        .yard-processing-table-wrapper table td[data-col="lastComment"] {
          min-width: 240px !important;
          max-width: 320px !important;
          white-space: normal !important;
          overflow: visible !important;
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
        }
        .yard-processing-table-wrapper .text-xs {
          font-size: 0.9rem !important;
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
        paramsBuilder={({ filter, query, sortBy, sortOrder }) => {
          const params = {};
          if (filter?.start && filter?.end) {
            params.start = filter.start;
            params.end   = filter.end;
          } else if (filter?.month && filter?.year) {
            params.month = filter.month;
            params.year  = filter.year;
          }
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
