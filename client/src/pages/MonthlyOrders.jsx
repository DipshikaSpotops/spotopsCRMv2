// /src/pages/MonthlyOrders.jsx
import React, { useCallback, useState } from "react";
import OrdersTable from "../components/OrdersTable";

/* ---------- Columns (order matters) ---------- */
const columns = [
  { key: "orderDate",     label: "Order Date" },
  { key: "orderNo",       label: "Order No" },          // single Show/Hide lives here
  { key: "pReq",          label: "Part Name" },         // expands using the same row toggle
  { key: "salesAgent",    label: "Sales Agent" },
  { key: "customerName",  label: "Customer Name" },     // expands using the same row toggle
  { key: "yardName",      label: "Yard Details" },      // expands using the same row toggle
  { key: "grossProfit",   label: "Est GP" },            // numeric, shown as currency
  { key: "_actualGP",     label: "Actual GP" },         // derived by OrdersTable, numeric
  { key: "orderStatus",   label: "Order Status" },
];

/* ---------- tiny helpers for yard math display ---------- */
function parseShippingCost(field) {
  if (!field || typeof field !== "string") return 0;
  const n = parseFloat(field.split(":")[1]?.trim());
  return Number.isFinite(n) ? n : 0;
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

export default function MonthlyOrders() {
  /* one toggle per row; used by ALL columns */
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

  const renderCell = useCallback((row, key, formatDateSafe, currency) => {
    console.log("row",row);
    const open = isOpenId(row);

    switch (key) {
      case "orderDate":
        return formatDateSafe(row.orderDate);

      case "orderNo": {
        return (
          <div className="flex items-center justify-between gap-2">
            <span>{row.orderNo || "—"}</span>
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(row); }}
              className="text-blue-400 text-xs underline hover:text-blue-300 shrink-0"
            >
              {open ? "Hide Details" : "Show Details"}
            </button>
          </div>
        );
      }

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

      case "salesAgent":
        return row.salesAgent || "—";

      case "customerName":
        return (
          <div>
            <div>{row.fName && row.lName ? `${row.fName} ${row.lName}` : (row.customerName || "—")}</div>
            {open && (
              <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                <div><b>Email:</b> {row.email}</div>
                <div><b>Phone:</b> {row.phone}</div>
                <div>
                  <b>Address:</b> {row.sAddressStreet}, {row.sAddressCity}, {row.sAddressState}, {row.sAddressZip}
                </div>
              </div>
            )}
          </div>
        );

      case "yardName": {
        const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
        const hasAnyYard = yards.some(y => (y?.yardName || "").trim().length > 0);
        if (!hasAnyYard) return <span className="font-medium whitespace-nowrap"></span>;

        return (
          <div className="space-y-2">
            <div className="flex-1 text-white">
              {yards.map((y, idx) => (
                <div key={idx} className="font-medium whitespace-nowrap">
                  {y?.yardName || ""}
                </div>
              ))}
            </div>

            {open && (
              <div className="whitespace-nowrap mt-2 text-sm text-white/80 space-y-2">
                {yards.map((yard, i) => {
                  const d = computeYardDerived(yard);
                  return (
                    <div key={i} className="border-t border-white/15 pt-2">
                      <div><b>Yard:</b> {yard?.yardName || "N/A"}</div>
                      <div><b>Part Price:</b> {currency(d.partPrice)}</div>
                      <div><b>Shipping:</b> {currency(d.shippingCost)}</div>
                      <div><b>Others:</b> {currency(d.others)}</div>
                      <div><b>Yard refund:</b> {currency(d.refundedAmount)}</div>
                      <div><b>Esc spending:</b> {currency(d.escSpending)}</div>
                      <div><b>Yard spending:</b> {currency(d.yardSpendTotal)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      case "grossProfit": // Est GP
        return <span className="block">{currency(row.grossProfit)}</span>;

      case "_actualGP":   // Actual GP (computed in OrdersTable)
        return <span className="block">{currency(row.actualGP)}</span>;

      case "orderStatus":
        return row.orderStatus || "";

      default:
        return row[key] ?? "—";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedIds]);

  return (
    <OrdersTable
      title="Monthly Orders"
      endpoint="/api/orders/monthlyOrders"
      storageKeys={{
        page:   "monthlyOrdersPage",
        search: "monthlyOrdersSearch",
        filter: "mo_filter_v2",
        hilite: "highlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}     // Admin can narrow by agent; Sales is narrowed server-side
      showGP={false}             // no GP totals modal needed
      showTotalsButton={false}   // hides the eye button entirely
    />
  );
}
