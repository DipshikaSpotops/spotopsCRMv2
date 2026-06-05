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
  return String(status);
}

function safeText(value, fallback = "-") {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getSalesAgentFirstName(salesAgent) {
  if (!salesAgent) return "-";
  return String(salesAgent).trim().split(" ")[0] || String(salesAgent);
}

function parseShippingCost(field) {
  if (!field || typeof field !== "string") return 0;
  const match = field.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
  return match ? Number(match[1]) || 0 : 0;
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

  return {
    shippingCost,
    partPrice,
    others,
    refundedAmount,
    escSpending: yardOwnShipping + custOwnShippingReturn + custOwnShipReplacement,
    yardSpendTotal,
  };
}

export default function YardNotFound() {
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const brand = useBrand();

  const tableId = "yardNotFoundOrders";

  const toggleExpand = useCallback((row) => {
    const id = row._id || row.orderNo || `${row.orderDate || ""}-${Math.random()}`;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const isOpenId = useCallback(
    (row) => {
      const id = row._id || row.orderNo || `${row.orderDate || ""}-fallback`;
      return expandedIds.has(id);
    },
    [expandedIds]
  );

  const renderCell = useCallback(
    (row, key, formatDateSafe, currency) => {
      const open = isOpenId(row);

      switch (key) {
        case "orderDate":
          return formatDateSafe(row.orderDate);

        case "orderNo":
          return (
            <div className="flex items-center justify-between gap-2">
              <span>{safeText(row.orderNo)}</span>
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
              <div>{safeText(row.pReq || row.partName)}</div>
              {open && (
                <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                  <b>{safeText(`${row.year || ""} ${row.make || ""} ${row.model || ""}`.trim())}</b>
                  <div><b>Desc:</b> {safeText(row.desc)}</div>
                  <div><b>Part No:</b> {safeText(row.partNo)}</div>
                  <div><b>VIN:</b> {safeText(row.vin)}</div>
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
                  : safeText(row.customerName)}
              </div>
              {open && (
                <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                  <div><b>Email:</b> {safeText(row.email)}</div>
                  <div><b>Phone:</b> {safeText(row.phone)}</div>
                </div>
              )}
            </div>
          );

        case "yardName": {
          const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
          if (!yards.length) return "";

          return (
            <div className="space-y-2">
              {yards.map((yard, idx) => {
                const d = computeYardDerived(yard);
                return (
                  <div key={idx} className="font-medium whitespace-nowrap">
                    <div>{safeText(yard?.yardName, "")}</div>
                    <div className="text-xs text-white/80">
                      <b>Payment status:</b> {safeText(yard?.paymentStatus || yard?.pamentStatus, "")}
                    </div>

                    {open && (
                      <div className="mt-2 border-t border-white/15 pt-2 text-xs text-white/80 space-y-1">
                        <div><b>Part Price:</b> {currency(d.partPrice)}</div>
                        <div><b>Shipping:</b> {currency(d.shippingCost)}</div>
                        <div><b>Others:</b> {currency(d.others)}</div>
                        <div><b>Yard refund:</b> {currency(d.refundedAmount)}</div>
                        <div><b>Esc spending:</b> {currency(d.escSpending)}</div>
                        <div><b>Yard spending:</b> {currency(d.yardSpendTotal)}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }

        case "soldP":
          return currency(row.soldP);

        case "grossProfit":
          return currency(row.grossProfit);

        case "_actualGP":
          return currency(row.actualGP);

        case "orderStatus":
          return formatOrderStatus(row.orderStatus);

        default:
          return safeText(row[key]);
      }
    },
    [expandedIds, isOpenId, toggleExpand]
  );

  const paramsBuilder = useCallback(({ filter }) => {
    const params = { orderStatus: "Yard Not Found" };

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
    onOrderCreated: () => window.__ordersTableRefs?.[tableId]?.refetch?.(),
    onOrderUpdated: () => window.__ordersTableRefs?.[tableId]?.refetch?.(),
  });

  useEffect(() => {
    window.__ordersTableRefs?.[tableId]?.refetch?.();
  }, [brand]);

  return (
    <OrdersTable
      title="Yard Not Found Orders"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page: "yardNotFoundOrdersPage",
        search: "yardNotFoundOrdersSearch",
        filter: "yard_not_found_filter_v1",
        hilite: "yardNotFoundHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showAddressTypeFilter={true}
      showGP={false}
      showTotalsButton={true}
      paramsBuilder={paramsBuilder}
      tableId={tableId}
    />
  );
}