// src/pages/CardCharged.jsx
import React, { useCallback, useMemo, useState, useEffect } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import useBrand from "../hooks/useBrand";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

const TZ = "America/Chicago";

/* ---------- Columns ---------- */
const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "orderDate", label: "Order Date" },
  { key: "yardName", label: "Yard Name" },
  { key: "totalCharged", label: "Total Charged" },
  { key: "orderStatus", label: "Order Status" },
  { key: "refundInfo", label: "Refund Details" },
];

/* ---------- Helpers ---------- */
function formatDateSafe(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}

function formatDateTimeSafe(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy HH:mm");
}

/* ---------- Page ---------- */
export default function CardCharged() {
  const brand = useBrand();
  const [totalLabel, setTotalLabel] = useState("Total Charged: $0.00");

  /* cell renderer */
  const renderCell = useCallback((row, key) => {
    switch (key) {
      case "orderNo":
        return row.orderNo || "—";
      case "orderDate":
        return formatDateSafe(row.orderDate);
      case "yardName":
        const yards = row.yards || [];
        if (yards.length === 0) return "—";
        return (
          <div className="space-y-2">
            {yards.map((yard, idx) => (
              <div key={idx} className={idx > 0 ? "border-t border-white/20 pt-2 mt-2" : ""}>
                <div className="font-medium">{yard.yardName || "—"}</div>
                <div className="text-xs text-white/70 mt-1">Yard #{yard.yardIndex}</div>
              </div>
            ))}
          </div>
        );
      case "totalCharged":
        const allYards = row.yards || [];
        if (allYards.length === 0) return "—";
        return (
          <div className="space-y-2">
            {allYards.map((yard, idx) => (
              <div key={idx} className={idx > 0 ? "border-t border-white/20 pt-2 mt-2" : ""}>
                <div className="font-semibold">${Number(yard.totalCharged || 0).toFixed(2)}</div>
                <div className="text-xs text-white/70 mt-1">
                  Part: ${Number(yard.partPrice || 0).toFixed(2)} | 
                  Shipping: ${Number(yard.shippingCost || 0).toFixed(2)} | 
                  Others: ${Number(yard.others || 0).toFixed(2)}
                </div>
                {yard.cardChargedDate && (
                  <div className="text-xs text-white/60 mt-1">
                    Charged: {formatDateTimeSafe(yard.cardChargedDate)}
                  </div>
                )}
              </div>
            ))}
            {allYards.length > 1 && (
              <div className="border-t border-white/30 pt-2 mt-2 font-bold">
                Total: ${Number(row.totalCharged || 0).toFixed(2)}
              </div>
            )}
          </div>
        );
      case "orderStatus":
        return (
          <div>
            <div>{row.orderStatus || "—"}</div>
            {row.isCancelled && (
              <div className="text-xs text-red-300 mt-1">
                Cancelled: {formatDateSafe(row.cancelledDate)}
              </div>
            )}
            {row.cancellationReason && (
              <div className="text-xs text-white/70 mt-1">
                Reason: {row.cancellationReason}
              </div>
            )}
          </div>
        );
      case "refundInfo":
        const orderYards = row.yards || [];
        if (orderYards.length === 0) return "—";
        
        return (
          <div className="space-y-2">
            {orderYards.map((yard, idx) => {
              const refund = yard.refundInfo || {};
              const hasAnyRefundInfo = refund.isRefunded || refund.isPOCancelled || refund.isCollectRefundChecked || (refund.refundedAmount > 0) || refund.refundStatus;
              
              return (
                <div key={idx} className={idx > 0 ? "border-t border-white/20 pt-2 mt-2" : ""}>
                  <div className="text-xs text-white/60 mb-1">Yard #{yard.yardIndex}: {yard.yardName || "—"}</div>
                  {row.isCancelled && (
                    <>
                      {refund.isRefunded && refund.hasCustRefAmount && (
                        <div className="text-green-300 text-sm">
                          ✓ Order Refunded: ${Number(row.custRefAmount || 0).toFixed(2)}
                        </div>
                      )}
                      {refund.isPOCancelled && (
                        <div className="text-yellow-300 text-sm">
                          ⚠ PO Cancelled
                        </div>
                      )}
                      {refund.isCollectRefundChecked && (
                        <div className="text-blue-300 text-sm">
                          ✓ Collect Refund Checked
                        </div>
                      )}
                      {(refund.refundedAmount > 0 || refund.refundedAmount === 0) && (
                        <div className="text-sm font-semibold">
                          Yard Refunded: ${(refund.refundedAmount || 0).toFixed(2)}
                        </div>
                      )}
                      {refund.refundStatus && (
                        <div className="text-xs text-white/70">
                          Status: {refund.refundStatus}
                        </div>
                      )}
                      {!hasAnyRefundInfo && (
                        <div className="text-white/50 text-sm">No refund info</div>
                      )}
                    </>
                  )}
                  {!row.isCancelled && (
                    <div className="text-white/50 text-sm">Not cancelled</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      default:
        return row[key] ?? "—";
    }
  }, []);

  /* build params for the endpoint */
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
  }, [brand]);

  /* Update the inline label whenever the visible rows change */
  const onRowsChange = useCallback((sortedVisibleRows) => {
    const totalCharged = sortedVisibleRows.reduce(
      (sum, row) => sum + (Number(row.totalCharged) || 0),
      0
    );
    const totalOrders = sortedVisibleRows.length;
    setTotalLabel(`Total Orders: ${totalOrders} | Total Charged: $${totalCharged.toFixed(2)}`);
  }, []);

  // Realtime: refetch card charged when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.cardCharged?.refetch) {
        window.__ordersTableRefs.cardCharged.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.cardCharged?.refetch) {
        window.__ordersTableRefs.cardCharged.refetch();
      }
    },
  });

  // Auto-refetch when brand changes
  useEffect(() => {
    if (window.__ordersTableRefs?.cardCharged?.refetch) {
      window.__ordersTableRefs.cardCharged.refetch();
    }
  }, [brand]);

  return (
    <OrdersTable
      title="Card Charged"
      endpoint="/orders/card-charged"
      storageKeys={{
        page: "cardChargedPage",
        search: "cardChargedSearch",
        filter: "cardChargedFilter_v1",
        hilite: "cardChargedHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={false}
      showTotalsButton={false}
      paramsBuilder={paramsBuilder}
      onRowsChange={onRowsChange}
      totalLabel={totalLabel}
      showTotalsNearPill={true}
      tableId="cardCharged"
    />
  );
}
