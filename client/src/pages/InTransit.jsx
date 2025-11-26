// /src/pages/InTransitOrders.jsx
import React, { useCallback, useState } from "react";
import OrdersTable from "../components/OrdersTable";

/* ---------- Columns (order matters) ---------- */
const columns = [
  { key: "orderDate",     label: "Order Date" },
  { key: "orderNo",       label: "Order No" },
  { key: "pReq",          label: "Part Name" },
  { key: "salesAgent",    label: "Sales Agent" },
  { key: "customerName",  label: "Customer Name" },
  { key: "yardName",      label: "Yard Details" },
  { key: "lastComment",   label: "Last Comment" }, // <- custom render below
  // { key: "orderStatus",   label: "Order Status" },
];

/* ---------- helpers for the yard details block ---------- */
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

export default function InTransitOrders() {
  // one toggle per row; used by yard details + part/customer blocks
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

  /** Custom cell renderer */
  const renderCell = useCallback((row, key, formatDateSafe, currency) => {
    const open = isOpenId(row);

    switch (key) {
      case "orderDate":
        return formatDateSafe(row.orderDate);

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
        if (!hasAnyYard) return <span className="font-medium">—</span>;

        return (
          <div className="space-y-2 max-w-full">
            <div className="flex-1 text-white">
              {yards.map((y, idx) => (
                <div key={idx} className="font-medium break-words overflow-wrap-anywhere">
                  {y?.yardName || ""}
                </div>
              ))}
            </div>

            {open && (
              <div className="mt-2 text-sm text-white/80 space-y-2">
                {yards.map((yard, i) => {
                  const d = computeYardDerived(yard);
                  return (
                    <div key={i} className="border-t border-white/15 pt-2">
                      <div><b>Yard:</b> {yard?.yardName || "N/A"}</div>
                      <div><b>Status:</b> {yard?.status || "N/A"}</div>
                      <div><b>Expected Ship:</b> {yard?.expShipDate || "N/A"}</div>
                      <div><b>Expedite:</b> {yard?.expediteShipping === "true" ? "Yes" : "No"}</div>
                      <div className="text-xs opacity-80 pt-1">
                        <b>Part Price:</b> {currency(d.partPrice)} • <b>Shipping:</b> {currency(d.shippingCost)} • <b>Others:</b> {currency(d.others)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      case "lastComment": {
        // last note from the last additionalInfo item
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
              whitespace-normal break-words
              max-w-full
              [overflow-wrap:anywhere]
            "
          >
            {text || "N/A"}
          </div>
        );
      }

      // case "orderStatus":
      //   return row.orderStatus || "";

      default:
        return row[key] ?? "—";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedIds]);

  return (
    <div className="in-transit-table-wrapper">
      <style>{`
        /* Make Yard Details and Last Comment columns wider and equal width */
        .in-transit-table-wrapper table {
          table-layout: fixed;
          width: 100%;
        }
        /* All table cells should wrap text to prevent overflow */
        .in-transit-table-wrapper table th,
        .in-transit-table-wrapper table td {
          overflow: hidden !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          white-space: normal !important;
        }
        /* Yard Details and Last Comment - wider and equal */
        .in-transit-table-wrapper table th:nth-child(6),
        .in-transit-table-wrapper table td:nth-child(6) {
          width: 23% !important;
          min-width: 23% !important;
        }
        .in-transit-table-wrapper table th:nth-child(7),
        .in-transit-table-wrapper table td:nth-child(7) {
          width: 23% !important;
          min-width: 23% !important;
        }
        /* Order No column - wider to show "Show Det" button */
        .in-transit-table-wrapper table th:nth-child(2),
        .in-transit-table-wrapper table td:nth-child(2) {
          width: 11% !important;
        }
        /* Other columns get smaller equal widths */
        .in-transit-table-wrapper table th:nth-child(1),
        .in-transit-table-wrapper table td:nth-child(1),
        .in-transit-table-wrapper table th:nth-child(3),
        .in-transit-table-wrapper table td:nth-child(3),
        .in-transit-table-wrapper table th:nth-child(4),
        .in-transit-table-wrapper table td:nth-child(4),
        .in-transit-table-wrapper table th:nth-child(5),
        .in-transit-table-wrapper table td:nth-child(5) {
          width: 7% !important;
        }
        /* Actions column - narrower */
        .in-transit-table-wrapper table th:last-child,
        .in-transit-table-wrapper table td:last-child {
          width: 6% !important;
          min-width: 6% !important;
        }
      `}</style>
      <OrdersTable
        title="In Transit Orders"
        endpoint="/orders/inTransitOrders"      // ← server should return full list for the filter (no server paging)
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
      />
    </div>
  );
}
