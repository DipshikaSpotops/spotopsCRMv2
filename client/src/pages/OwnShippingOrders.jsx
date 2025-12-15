import React, { useCallback, useMemo, useState } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

const columns = [
  { key: "orderDate",    label: "Order Date" },
  { key: "orderNo",      label: "Order No" },
  { key: "pReq",         label: "Part Info" },
  { key: "customerName", label: "Customer Info" },
  { key: "yardName",     label: "Yard Details" },
];

const wrap5 = (str = "") =>
  !str ? "N/A" : str.trim().split(/\s+/)
    .reduce((acc, w, i) => acc + w + ((i + 1) % 5 === 0 ? "\n" : " "), "")
    .trim();

export default function OwnShippingOrders() {
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
            {/* <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(row); }}
              className="text-blue-400 text-xs underline hover:text-blue-300 whitespace-nowrap shrink-0"
            >
              {open ? "Hide Details" : "Show Details"}
            </button> */}
          </div>
        );
      case "pReq":
        return (
          <div>
            <div>{row.pReq || row.partName || "—"}</div>
            {/* {open && (
              <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                <b>{row.year} {row.make} {row.model}</b>
                <div><b>Desc:</b> {row.desc}</div>
                <div><b>Part No:</b> {row.partNo}</div>
                <div><b>VIN:</b> {row.vin}</div>
                <div><b>Warranty:</b> {row.warranty} days</div>
                <div><b>Programming:</b> {row.programmingRequired ? "Yes" : "No"}</div>
              </div>
            )} */}
          </div>
        );
      case "customerName":
        return (
          <div>
            <div>{row.customerName || (row.fName && row.lName ? `${row.fName} ${row.lName}` : "—")}</div>
            <div className="mt-1 text-sm text-white/80">
              {(() => {
                const addressParts = [
                  row.sAddressStreet,
                  row.sAddressCity,
                  row.sAddressState,
                  row.sAddressZip,
                  row.sAddressAcountry
                ].filter(part => part && String(part).trim().length > 0);
                return addressParts.length > 0 ? addressParts.join(", ") : "—";
              })()}
            </div>
            {/* {open && (
              <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                <div><b>Email:</b> {row.email}</div>
                <div><b>Phone:</b> {row.phone}</div>
                <div>
                  <b>Shipping Address:</b> {row.sAddressStreet || "—"}, {row.sAddressCity || "—"}, {row.sAddressState || "—"} {row.sAddressZip || ""}
                </div>
              </div>
            )} */}
          </div>
        );
      case "yardName": {
        const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
        // Filter to only show yards with "Yard PO sent" status (case-insensitive) and "Own shipping: 0" exactly
        const ownShippingYards = yards.filter(y => {
          const status = String(y?.status || "").trim();
          const isYardPOSent = /^Yard PO sent$/i.test(status);
          const shippingDetails = String(y?.shippingDetails || "");
          // Check if shippingDetails contains "Own shipping: 0" exactly (not other numbers)
          // Match "Own shipping: 0" followed by end of string, space, comma, or pipe
          const hasOwnShippingZero = /Own shipping:\s*0(?:\s|$|,|\|)/i.test(shippingDetails);
          return isYardPOSent && hasOwnShippingZero;
        });
        if (!ownShippingYards.length) return "—";
        return (
          <div className="space-y-2 max-w-full">
            {ownShippingYards.map((y, idx) => {
              const yardName = y?.yardName || "N/A";
              // Build address from street, city, state (exclude zipcode as per requirement)
              // Trim each part and remove trailing commas to prevent double commas
              const street = String(y?.street || "").trim().replace(/,\s*$/, "");
              const city = String(y?.city || "").trim().replace(/,\s*$/, "");
              const state = String(y?.state || "").trim().replace(/,\s*$/, "");
              const addressParts = [street, city, state].filter(part => part.length > 0);
              const address = addressParts.length > 0 ? addressParts.join(", ") : null;
              
              return (
                <div key={idx} className="break-words overflow-wrap-anywhere space-y-1">
                  <div className="font-medium text-white">{yardName}</div>
                  {address ? (
                    <div className="text-sm text-white/80">{address}</div>
                  ) : (
                    <div className="text-sm text-white/50 italic">No address</div>
                  )}
                </div>
              );
            })}
            {/* {open && (
              <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-2">
                {ownShippingYards.map((y, idx) => (
                  <div key={`yd-${idx}`}>
                    <div><b>Status:</b> {y?.status || "N/A"}</div>
                    <div><b>Shipping:</b> {y?.shippingDetails || "N/A"}</div>
                    <div><b>Expected Ship:</b> {y?.expShipDate || "N/A"}</div>
                    <div><b>Expedite:</b> {String(y?.expediteShipping) === "true" ? "Yes" : "No"}</div>
                  </div>
                ))}
              </div>
            )} */}
          </div>
        );
      }
      default:             return row[key] ?? "—";
    }
  }, [expandedIds, toggleExpand]);

  // Role-based access: only Admin and Service accounts can view this page
  const userRole = useMemo(() => {
    try {
      const raw = localStorage.getItem("auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.user?.role || null;
      }
    } catch {}
    return localStorage.getItem("role") || null;
  }, []);

  const roleOk = (() => {
    const r = (userRole || "").toLowerCase();
    return r === "admin" || r === "service" || r === "service account";
  })();

  // Realtime: refetch own-shipping table when relevant orders change
  useOrdersRealtime({
    enabled: roleOk,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.ownShipping?.refetch) {
        window.__ordersTableRefs.ownShipping.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.ownShipping?.refetch) {
        window.__ordersTableRefs.ownShipping.refetch();
      }
    },
  });

  if (!roleOk) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/80">
        You do not have access to view Own Shipping Orders.
      </div>
    );
  }

  return (
    <div className="own-shipping-table-wrapper">
      <style>{`
        /* Make Yard Details column wider */
        .own-shipping-table-wrapper table {
          table-layout: fixed;
          width: 100%;
        }
        /* Table headers should stay on one line */
        .own-shipping-table-wrapper table th {
          white-space: nowrap !important;
          overflow: hidden !important;
        }
        /* Table body cells should wrap text to prevent overflow */
        .own-shipping-table-wrapper table td {
          overflow: hidden !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          white-space: normal !important;
        }
        /* Yard Details - wider */
        .own-shipping-table-wrapper table th:nth-child(5),
        .own-shipping-table-wrapper table td:nth-child(5) {
          width: 25% !important;
          min-width: 25% !important;
        }
        /* Order No column - wider to show "Show Det" button */
        .own-shipping-table-wrapper table th:nth-child(2),
        .own-shipping-table-wrapper table td:nth-child(2) {
          width: 12% !important;
        }
        /* Order Date and Part Name columns */
        .own-shipping-table-wrapper table th:nth-child(1),
        .own-shipping-table-wrapper table td:nth-child(1),
        .own-shipping-table-wrapper table th:nth-child(3),
        .own-shipping-table-wrapper table td:nth-child(3) {
          width: 10% !important;
        }
        /* Customer Name column - wider for header */
        .own-shipping-table-wrapper table th:nth-child(4),
        .own-shipping-table-wrapper table td:nth-child(4) {
          width: 18% !important;
        }
        /* Actions column - narrower */
        .own-shipping-table-wrapper table th:last-child,
        .own-shipping-table-wrapper table td:last-child {
          width: 6% !important;
          min-width: 6% !important;
        }
      `}</style>
      <OrdersTable
        title="Own Shipping Orders"
        endpoint="/orders/ownShippingOrders"
        storageKeys={{
          page:   "ownShippingPage",
          search: "ownShippingSearch",
          filter: "oso_filter_v2",
          hilite: "ownShippingHighlightedOrderNo",
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
        tableId="ownShipping"
      />
    </div>
  );
}

