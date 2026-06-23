// /src/pages/ReturnInTransit.jsx
import React, { useCallback, useEffect } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

const columns = [
  { key: "orderDate", label: "Order Date" },
  { key: "orderNo", label: "Order No" },
  { key: "salesAgent", label: "Sales Agent" },
  { key: "pReq", label: "Part Name" },
  { key: "customerName", label: "Customer Info" },
  { key: "yardName", label: "Yard Details" },
];

function hasText(val) {
  return val != null && String(val).trim().length > 0;
}

export default function ReturnInTransitOrders() {
  const brand = useBrand();

  const renderCell = useCallback((row, key, formatDateSafe) => {
    switch (key) {
      case "orderDate":
        return <div className="text-base">{formatDateSafe(row.orderDate)}</div>;

      case "orderNo":
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="whitespace-nowrap text-base">{row.orderNo || "—"}</span>
          </div>
        );

      case "salesAgent":
        return row.salesAgent || "—";

      case "pReq":
        return <div className="text-base">{row.pReq || row.partName || "—"}</div>;

      case "customerName": {
        const customerName =
          row.fName && row.lName
            ? `${row.fName} ${row.lName}`
            : row.customerName || "—";
        const addressParts = [
          row.sAddressStreet,
          row.sAddressCity,
          row.sAddressState,
          row.sAddressZip,
          row.sAddressAcountry,
        ].filter((part) => part && part.trim().length > 0);
        const address = addressParts.length > 0 ? addressParts.join(", ") : "—";
        return (
          <div className="text-base space-y-1">
            <div className="border-b border-white/20 pb-0.5 inline-block">{customerName}</div>
            <div>{address}</div>
          </div>
        );
      }

      case "yardName": {
        const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
        const relevantYards = yards.filter(
          (y) =>
            hasText(y?.returnTrackingCust) ||
            hasText(y?.customerTrackingNumberReplacement) ||
            hasText(y?.yardTrackingNumber)
        );
        if (relevantYards.length === 0) {
          return <span className="font-medium text-base">—</span>;
        }

        return (
          <div className="space-y-2 max-w-full">
            <div className="flex-1 text-white text-base">
              {relevantYards.map((y, idx) => {
                const returnTracking = hasText(y?.returnTrackingCust)
                  ? String(y.returnTrackingCust).trim()
                  : null;
                const replacementCust = hasText(y?.customerTrackingNumberReplacement)
                  ? String(y.customerTrackingNumberReplacement).trim()
                  : null;
                const replacementYard = hasText(y?.yardTrackingNumber)
                  ? String(y.yardTrackingNumber).trim()
                  : null;

                return (
                  <div key={idx} className="font-medium break-words overflow-wrap-anywhere space-y-1">
                    <div className="border-b border-white/20 pb-0.5 inline-block">
                      {y?.yardName || `Yard ${idx + 1}`}
                    </div>
                    <div className="text-sm opacity-90">
                      <b>Payment status:</b> {y?.pamentStatus || y?.paymentStatus || "—"}
                    </div>
                    {returnTracking && (
                      <div className="yard-tracking-row opacity-90">
                        <span className="yard-tracking-label">Return Tracking:</span>{" "}
                        <span className="yard-tracking-value">{returnTracking}</span>
                      </div>
                    )}
                    {replacementYard && (
                      <div className="yard-tracking-row opacity-90">
                        <span className="yard-tracking-label">Replacement Tracking (Yard):</span>{" "}
                        <span className="yard-tracking-value">{replacementYard}</span>
                      </div>
                    )}
                    {replacementCust && (
                      <div className="yard-tracking-row opacity-90">
                        <span className="yard-tracking-label">Replacement Tracking (Cust):</span>{" "}
                        <span className="yard-tracking-value">{replacementCust}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      default:
        return row[key] ?? "—";
    }
  }, []);

  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      window.__ordersTableRefs?.returnInTransit?.refetch?.();
    },
    onOrderUpdated: () => {
      window.__ordersTableRefs?.returnInTransit?.refetch?.();
    },
  });

  useEffect(() => {
    window.__ordersTableRefs?.returnInTransit?.refetch?.();
  }, [brand]);

  return (
    <div className="return-in-transit-table-wrapper">
      <style>{`
        .return-in-transit-table-wrapper table {
          table-layout: fixed;
          width: 100%;
        }
        .return-in-transit-table-wrapper table th {
          white-space: nowrap !important;
          overflow: hidden !important;
        }
        .return-in-transit-table-wrapper table td {
          overflow: hidden !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          white-space: normal !important;
          font-size: 0.9rem !important;
        }
        .return-in-transit-table-wrapper .yard-tracking-label {
          font-size: 1.1rem !important;
          font-weight: 600;
          color: #4ade80;
        }
        .return-in-transit-table-wrapper .yard-tracking-value {
          font-size: 0.875rem !important;
        }
        .return-in-transit-table-wrapper .yard-tracking-row {
          font-size: 0.9rem !important;
        }
        .return-in-transit-table-wrapper table th:nth-child(6),
        .return-in-transit-table-wrapper table td:nth-child(6) {
          width: 28% !important;
          min-width: 28% !important;
        }
        .return-in-transit-table-wrapper table th:nth-child(1),
        .return-in-transit-table-wrapper table td:nth-child(1) {
          width: 8% !important;
        }
        .return-in-transit-table-wrapper table th:nth-child(2),
        .return-in-transit-table-wrapper table td:nth-child(2) {
          width: 10% !important;
        }
        .return-in-transit-table-wrapper table th:nth-child(3),
        .return-in-transit-table-wrapper table td:nth-child(3) {
          width: 10% !important;
        }
        .return-in-transit-table-wrapper table th:nth-child(4),
        .return-in-transit-table-wrapper table td:nth-child(4) {
          width: 18% !important;
        }
        .return-in-transit-table-wrapper table th:nth-child(5),
        .return-in-transit-table-wrapper table td:nth-child(5) {
          width: 22% !important;
        }
        .return-in-transit-table-wrapper table th:last-child,
        .return-in-transit-table-wrapper table td:last-child {
          width: 10% !important;
          min-width: 90px !important;
          white-space: nowrap !important;
        }
      `}</style>
      <OrdersTable
        title="Return-In-transit Orders"
        endpoint="/orders/returnInTransitOrders"
        storageKeys={{
          page: "returnInTransit_orders_page",
          search: "returnInTransit_orders_search",
          filter: "rito_filter_v2",
          hilite: "returnInTransit_highlightedOrderNo",
        }}
        columns={columns}
        renderCell={renderCell}
        showAgentFilter={true}
        showGP={false}
        showTotalsButton={false}
        rowsPerPage={25}
        tableId="returnInTransit"
        paramsBuilder={({ filter, query, sortBy, sortOrder }) => {
          const params = {};
          if (filter?.start && filter?.end) {
            params.start = filter.start;
            params.end = filter.end;
          } else if (filter?.month && filter?.year) {
            params.month = filter.month;
            params.year = filter.year;
          }
          if (query) params.q = query;
          if (sortBy) params.sortBy = sortBy;
          if (sortOrder) params.sortOrder = sortOrder;
          return params;
        }}
      />
    </div>
  );
}
