import React, { useCallback, useEffect, useState } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

const columns = [
  { key: "orderDate", label: "Order Date" },
  { key: "orderNo", label: "Order No" },
  { key: "pReq", label: "Part Name" },
  { key: "salesAgent", label: "Sales Agent" },
  { key: "customerName", label: "Customer Name" },
  { key: "yardName", label: "Yard Details" },
  { key: "soldP", label: "Sale Price" },
  { key: "paymentSource", label: "Payment Source" },
  { key: "grossProfit", label: "Est GP" },
  { key: "_actualGP", label: "Actual GP" },
  { key: "orderStatus", label: "Order Status" },
];

function formatOrderStatus(status) {
  if (!status) return "";
  if (status === "Dispute 2") return "Dispute AC";
  return status;
}

function getSalesAgentFirstName(salesAgent) {
  if (!salesAgent) return "—";
  const trimmed = String(salesAgent).trim();
  return trimmed.split(" ")[0] || trimmed;
}

function parseShippingCost(field) {
  if (!field || typeof field !== "string") return 0;
  const match = field.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
  if (match) {
    const num = parseFloat(match[1]);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function computeYardDerived(yard) {
  const shippingCost = parseShippingCost(yard?.shippingDetails);
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

  const escSpending = yardOwnShipping + custOwnShippingReturn + custOwnShipReplacement;

  return {
    shippingCost,
    partPrice,
    others,
    refundedAmount,
    yardSpendTotal,
    escSpending,
  };
}

export default function DeliveryReport() {
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const brand = useBrand();

  const toggleExpand = useCallback((row) => {
    const id = row._id || row.orderNo || `${row.orderDate || ""}-${Math.random()}`;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const isOpenId = (row) => {
    const id = row._id || row.orderNo || `${row.orderDate || ""}-fallback`;
    return expandedIds.has(id);
  };

  const renderCell = useCallback(
    (row, key, formatDateSafe, currency) => {
      const open = isOpenId(row);

      switch (key) {
        case "orderDate":
          return formatDateSafe(row.orderDate);
        case "orderNo":
          return (
            <div className="flex items-center justify-between gap-2">
              <span>{row.orderNo || "—"}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(row);
                }}
                className="text-blue-400 text-xs underline hover:text-blue-300 shrink-0"
              >
                {open ? "Hide Details" : "Show Details"}
              </button>
            </div>
          );
        case "pReq":
          return (
            <div>
              <div>{row.pReq || row.partName || "—"}</div>
              {open && (
                <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                  <b>
                    {row.year} {row.make} {row.model}
                  </b>
                  <div>
                    <b>Desc:</b> {row.desc}
                  </div>
                  <div>
                    <b>Part No:</b> {row.partNo}
                  </div>
                  <div>
                    <b>VIN:</b> {row.vin}
                  </div>
                  <div>
                    <b>Warranty:</b>{" "}
                    {(() => {
                      const warrantyField = (row?.warrantyField || "days")
                        .toString()
                        .toLowerCase()
                        .trim();
                      const warrantyValue = Number(row?.warranty) || 0;
                      let displayUnit;
                      if (warrantyField === "month" || warrantyField === "months") {
                        displayUnit = warrantyValue === 1 ? "Month" : "Months";
                      } else if (warrantyField === "year" || warrantyField === "years") {
                        displayUnit = warrantyValue === 1 ? "Year" : "Years";
                      } else {
                        displayUnit = warrantyValue === 1 ? "Day" : "Days";
                      }
                      return `${row.warranty || 0} ${displayUnit}`;
                    })()}
                  </div>
                  <div>
                    <b>Programming:</b> {row.programmingRequired ? "Yes" : "No"}
                  </div>
                </div>
              )}
            </div>
          );
        case "salesAgent":
          return getSalesAgentFirstName(row.salesAgent);
        case "customerName":
          return (
            <div>
              <div>
                {row.fName && row.lName
                  ? `${row.fName} ${row.lName}`
                  : row.customerName || "—"}
              </div>
              {open && (
                <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                  <div>
                    <b>Email:</b> {row.email}
                  </div>
                  <div>
                    <b>Phone:</b> {row.phone}
                  </div>
                  <div>
                    <b>Address:</b>{" "}
                    {(() => {
                      const addressParts = [
                        row.sAddressStreet,
                        row.sAddressCity,
                        row.sAddressState,
                        row.sAddressZip,
                        row.sAddressAcountry,
                      ].filter((part) => part && String(part).trim().length > 0);
                      return addressParts.length > 0 ? addressParts.join(", ") : "—";
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        case "yardName": {
          const yards = Array.isArray(row.additionalInfo)
            ? row.additionalInfo.filter(
                (y) => y?.yardExpedite === true || y?.yardExpedite === "true"
              )
            : [];
          if (!yards.length) return "";

          return (
            <div className="space-y-2">
              <div className="flex-1 text-white">
                {yards.map((y, idx) => (
                  <div key={idx} className="font-medium whitespace-nowrap">
                    <div>{y?.yardName || ""}</div>
                    <div className="text-xs text-white/80">
                      <b>Payment status:</b> {y?.pamentStatus || y?.paymentStatus || ""}
                    </div>
                  </div>
                ))}
              </div>

              {open && (
                <div className="whitespace-nowrap mt-2 text-sm text-white/80 space-y-2">
                  {yards.map((yard, i) => {
                    const d = computeYardDerived(yard);
                    return (
                      <div key={i} className="border-t border-white/15 pt-2">
                        <div>
                          <b>Yard:</b> {yard?.yardName || "N/A"}
                        </div>
                        <div>
                          <b>Part Price:</b> {currency(d.partPrice)}
                        </div>
                        <div>
                          <b>Shipping:</b> {currency(d.shippingCost)}
                        </div>
                        <div>
                          <b>Others:</b> {currency(d.others)}
                        </div>
                        <div>
                          <b>Yard refund:</b> {currency(d.refundedAmount)}
                        </div>
                        <div>
                          <b>Esc spending:</b> {currency(d.escSpending)}
                        </div>
                        <div>
                          <b>Yard spending:</b> {currency(d.yardSpendTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }
        case "soldP":
          return <span className="block">{currency(row.soldP)}</span>;
        case "paymentSource":
          return row.paymentSource || "—";
        case "grossProfit":
          return <span className="block">{currency(row.grossProfit)}</span>;
        case "_actualGP":
          return <span className="block">{currency(row.actualGP)}</span>;
        case "orderStatus":
          return formatOrderStatus(row.orderStatus) || "";
        default:
          return row[key] ?? "—";
      }
    },
    [expandedIds, toggleExpand]
  );

  const paramsBuilder = useCallback(({ filter }) => {
    const params = { yardExpediteOnly: "true" };
    if (filter?.start && filter?.end) {
      params.start = filter.start;
      params.end = filter.end;
    } else {
      params.month = filter?.month;
      params.year = filter?.year;
    }
    return params;
  }, []);

  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.yardExpedite?.refetch) {
        window.__ordersTableRefs.yardExpedite.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.yardExpedite?.refetch) {
        window.__ordersTableRefs.yardExpedite.refetch();
      }
    },
  });

  useEffect(() => {
    if (window.__ordersTableRefs?.yardExpedite?.refetch) {
      window.__ordersTableRefs.yardExpedite.refetch();
    }
  }, [brand]);

  return (
    <OrdersTable
      title="Yard Expedite"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page: "yardExpeditePage",
        search: "yardExpediteSearch",
        filter: "yard_expedite_filter_v1",
        hilite: "yardExpediteHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showGP={false}
      paramsBuilder={paramsBuilder}
      tableId="yardExpedite"
    />
  );
}
