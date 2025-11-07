import React, { useCallback, useState } from "react";
import OrdersTable from "../components/OrdersTable";

const columns = [
  { key: "orderDate",    label: "Order Date" },
  { key: "orderNo",      label: "Order No" },
  { key: "pReq",         label: "Part Name" },
  { key: "customerName", label: "Customer Name" },
  { key: "yardName",     label: "Yard Details" },
  { key: "lastComment",  label: "Last Comment" },
  { key: "orderStatus",  label: "Order Status" },
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
      case "pReq":         return row.pReq || row.partName || "—";
      case "customerName": return row.customerName || (row.fName && row.lName ? `${row.fName} ${row.lName}` : "—");
      case "yardName": {
        const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
        if (!yards.length) return "—";
        return (
          <div className="space-y-2">
            {yards.map((y, idx) => (
              <div key={idx} className="whitespace-nowrap font-medium">{y?.yardName || "N/A"}</div>
            ))}
            {open && (
              <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-2 whitespace-nowrap">
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
        w-full md:w-[32rem]
        [overflow-wrap:anywhere] /* handles VeryLongUnbrokenStrings */
      "
    >
      {text || "N/A"}
    </div>
  );
}
      case "orderStatus":  return row.orderStatus || "—";
      default:             return row[key] ?? "—";
    }
  }, [expandedIds, toggleExpand]);

  return (
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
      // 👇 Make the query look like your original working page
      paramsBuilder={({ filter, /* query, sortBy, sortOrder */ }) => {
        const params = {};
        if (filter?.start && filter?.end) {
          params.start = filter.start;
          params.end   = filter.end;
        } else if (filter?.month && filter?.year) {
          params.month = filter.month;
          params.year  = filter.year;
        }
        // DO NOT send limit=all — this endpoint 500s on it.
        // If your API *requires* page/sort/q, uncomment the lines below:
        // params.page = 1;
        // if (query) params.q = query;
        // if (sortBy) params.sortBy = sortBy;
        // if (sortOrder) params.sortOrder = sortOrder;
        return params;
      }}
    />
  );
}
