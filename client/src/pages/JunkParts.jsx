// src/pages/JunkParts.jsx
import React, { useCallback, useEffect, useState } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";
import { useNavigate } from "react-router-dom";

/* ---------- Columns (order matters) ---------- */
const columns = [
  { key: "orderDate", label: "Order Date" },
  { key: "orderNo", label: "Order No" },
  { key: "yardDetails", label: "Yard Details" },
  { key: "escalationDetails", label: "Escalation Details" },
  { key: "actions", label: "Action" },
];

function isJunkYard(yard) {
  const process = (yard?.escalationProcess || "").trim();
  const reason = (yard?.custReason || "").trim();
  return process === "Junk" || (process === "Replacement" && reason === "Junked");
}

/**
 * Extract numeric shipping value from shippingDetails string
 * Handles both "Own shipping: X" and "Yard shipping: X" formats
 */
function parseShippingCost(field) {
  if (!field || typeof field !== "string") return 0;
  const match = field.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
  if (match) {
    const num = parseFloat(match[1]);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

/**
 * Extract shipping method from shippingDetails string
 * Returns "Own" or "Yard" when possible, otherwise empty string.
 */
function parseShippingMethod(field) {
  if (!field || typeof field !== "string") return "";
  const lower = field.toLowerCase();
  if (lower.includes("own shipping")) return "Own";
  if (lower.includes("yard shipping")) return "Yard";
  return "";
}

function computeYardDerived(yard) {
  const shippingCost = parseShippingCost(yard?.shippingDetails);
  const shippingMethod = parseShippingMethod(yard?.shippingDetails);
  const partPrice = parseFloat(yard?.partPrice || 0) || 0;
  const others = parseFloat(yard?.others || 0) || 0;
  const refundedAmount = parseFloat(yard?.refundedAmount || 0) || 0;
  const custOwnShipReplacement = parseFloat(yard?.custOwnShipReplacement || 0) || 0;
  const yardOwnShipping = parseFloat(yard?.yardOwnShipping || 0) || 0;
  const custOwnShippingReturn = parseFloat(yard?.custOwnShippingReturn || 0) || 0;

  const yardSpendTotal =
    partPrice +
    shippingCost +
    others -
    refundedAmount +
    yardOwnShipping +
    custOwnShippingReturn -
    custOwnShipReplacement;

  const escSpending =
    yardOwnShipping + custOwnShippingReturn + custOwnShipReplacement;

  return {
    shippingCost,
    shippingMethod,
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

export default function JunkParts() {
  const brand = useBrand(); // 50STARS / PROLANE
  const navigate = useNavigate();
  const [totalLabel, setTotalLabel] = useState("Total Orders: 0 | Total Yard Spending: $0.00");

  const renderCell = useCallback(
    (row, key, formatDateSafe, currency) => {
      const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
      const junkYards = yards.filter(isJunkYard);
      const hasJunk = junkYards.length > 0;

      switch (key) {
        case "orderDate":
          return formatDateSafe(row.orderDate);

        case "orderNo":
          return <span>{row.orderNo || "—"}</span>;

        case "yardDetails": {
          if (!hasJunk) return "—";
          return (
            <div className="space-y-2">
              <div className="flex-1 text-white">
                {junkYards.map((y, idx) => (
                  <div key={idx} className="font-medium whitespace-nowrap">
                    {y?.yardName || ""}
                  </div>
                ))}
              </div>

              <div className="whitespace-nowrap mt-2 text-sm text-white/80 space-y-2">
                {junkYards.map((yard, i) => {
                  const d = computeYardDerived(yard);

                  const primaryLineParts = [];
                  if (d.partPrice) {
                    primaryLineParts.push(
                      <span key="part">
                        <b>Part Price:</b> {currency(d.partPrice)}
                      </span>
                    );
                  }
                  if (d.shippingCost) {
                    primaryLineParts.push(
                      <span key="ship">
                        <b>Shipping:</b> {currency(d.shippingCost)}
                        {d.shippingMethod && (
                          <span className="ml-1 text-xs text-white/70">
                            | Method: {d.shippingMethod} shipping
                          </span>
                        )}
                      </span>
                    );
                  }
                  if (d.others) {
                    primaryLineParts.push(
                      <span key="others">
                        <b>Others:</b> {currency(d.others)}
                      </span>
                    );
                  }

                  const secondaryLineParts = [];
                  if (d.refundedAmount) {
                    secondaryLineParts.push(
                      <span key="refund">
                        <b>Yard refund:</b> {currency(d.refundedAmount)}
                      </span>
                    );
                  }
                  if (d.escSpending) {
                    secondaryLineParts.push(
                      <span key="esc">
                        <b>Esc spending:</b> {currency(d.escSpending)}
                      </span>
                    );
                  }
                  if (d.yardSpendTotal) {
                    secondaryLineParts.push(
                      <span key="spend">
                        <b>Yard spending:</b> {currency(d.yardSpendTotal)}
                      </span>
                    );
                  }

                  return (
                    <div key={i} className="border-t border-white/15 pt-2 space-y-1">
                      {primaryLineParts.length > 0 && (
                        <div>
                          {primaryLineParts.map((seg, idx) => (
                            <span key={idx}>
                              {idx > 0 && <span className="mx-1">| </span>}
                              {seg}
                            </span>
                          ))}
                        </div>
                      )}

                      {secondaryLineParts.length > 0 && (
                        <div>
                          {secondaryLineParts.map((seg, idx) => (
                            <span key={idx}>
                              {idx > 0 && <span className="mx-1">| </span>}
                              {seg}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        case "escalationDetails": {
          if (!hasJunk) return "—";
          return (
            <div className="space-y-1 text-xs text-white/90">
              {junkYards.map((y, idx) => {
                const process = (y.escalationProcess || "").trim();
                const reason = (y.custReason || "").trim();
                const replacementShipMethod = (y.customerShippingMethodReplacement || "").trim();
                const returnShipMethod = (y.customerShippingMethodReturn || "").trim();
                const customerTrackingRep = (y.customerTrackingNumberReplacement || "").trim();
                const returnTracking = (y.returnTrackingCust || "").trim();

                return (
                  <div
                    key={idx}
                    className="pb-1 border-b border-white/10 last:border-0 whitespace-normal"
                  >
                    {process && (
                      <div>
                        <b>Process:</b> {process}
                      </div>
                    )}
                    {reason && (
                      <div>
                        <b>Reason:</b> {reason}
                      </div>
                    )}
                    {replacementShipMethod && (
                      <div>
                        <b>Replacement Ship Method:</b> {replacementShipMethod}
                      </div>
                    )}
                    {returnShipMethod && (
                      <div>
                        <b>Return Ship Method:</b> {returnShipMethod}
                      </div>
                    )}
                    {customerTrackingRep && (
                      <div>
                        <b>Customer Tracking (Rep):</b> {customerTrackingRep}
                      </div>
                    )}
                    {returnTracking && (
                      <div>
                        <b>Return Tracking:</b> {returnTracking}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }

        case "actions":
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (row.orderNo) {
                  navigate(`/order-details?orderNo=${encodeURIComponent(row.orderNo)}`);
                }
              }}
              className="px-3 py-1 text-xs rounded bg-[#2c5d81] hover:bg-blue-700 text-white"
            >
              View
            </button>
          );

        default:
          return row[key] ?? "—";
      }
    },
    [navigate]
  );

  // Realtime: keep junk parts list up-to-date when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.junkParts?.refetch) {
        window.__ordersTableRefs.junkParts.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.junkParts?.refetch) {
        window.__ordersTableRefs.junkParts.refetch();
      }
    },
  });

  // Refetch when brand changes
  useEffect(() => {
    if (window.__ordersTableRefs?.junkParts?.refetch) {
      window.__ordersTableRefs.junkParts.refetch();
    }
  }, [brand]);

  /* Update the inline label whenever the visible rows change */
  const onRowsChange = useCallback((sortedVisibleRows) => {
    let totalYardSpending = 0;
    const totalOrders = sortedVisibleRows.length;

    sortedVisibleRows.forEach((row) => {
      const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
      const junkYards = yards.filter(isJunkYard);
      
      junkYards.forEach((yard) => {
        const d = computeYardDerived(yard);
        totalYardSpending += d.yardSpendTotal;
      });
    });

    setTotalLabel(
      `Total Orders: ${totalOrders} | Total Yard Spending: $${totalYardSpending.toFixed(2)}`
    );
  }, []);

  return (
    <OrdersTable
      title="Junk Parts"
      endpoint="/orders/junkPartsOrders"
      storageKeys={{
        page: "junkPartsPage",
        search: "junkPartsSearch",
        filter: "junkPartsFilter_v1",
        hilite: "junkPartsHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showGP={false}
      showTotalsButton={false}
      hideDefaultActions={true}
      onRowsChange={onRowsChange}
      totalLabel={totalLabel}
      showTotalsNearPill={true}
      tableId="junkParts"
    />
  );
}

