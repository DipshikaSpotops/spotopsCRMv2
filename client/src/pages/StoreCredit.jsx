// src/pages/StoreCredits.jsx
import React, { useCallback, useMemo, useState } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "America/Chicago";

/* ---------- Columns ---------- */
const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "orderDate", label: "Order Date" },
  { key: "salesAgent", label: "Sales Agent" },
  { key: "yardDetails", label: "Yard Details" },
  { key: "chargedAmount", label: "Charged Amount ($)" },
  { key: "storeCredit", label: "Store Credit ($)" },
];

/* ---------- Helpers ---------- */
function formatDateSafe(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}

function parseAmountAfterColon(s) {
  if (!s || typeof s !== "string") return 0;
  const idx = s.indexOf(":");
  if (idx === -1) return 0;
  const n = parseFloat(s.slice(idx + 1).trim());
  return isNaN(n) ? 0 : n;
}

function hasNumeric(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value));
}

/* ---------- Multi-page fetch + transformation ---------- */
async function fetchAllStoreCredits(params, headers) {
  // Step 1: get all pages from monthlyOrders
  const first = await API.get(`/orders/monthlyOrders`, {
    params: { ...params, page: 1 },
    headers,
  });
  const { orders: firstOrders = [], totalPages = 1 } = first.data || {};
  let allOrders = [...firstOrders];

  if (totalPages > 1) {
    const requests = [];
    for (let p = 2; p <= totalPages; p++) {
      requests.push(API.get(`/orders/monthlyOrders`, { params: { ...params, page: p }, headers }));
    }
    const results = await Promise.all(requests);
    results.forEach((r) => {
      if (Array.isArray(r.data?.orders)) allOrders = allOrders.concat(r.data.orders);
    });
  }

  // Step 2: filter + compute only those with storeCredit
  const filtered = [];

  allOrders.forEach((order) => {
    const addl = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];
    const yardsWithCredit = addl
      .map((ai, idx) => {
        const storeCredit = hasNumeric(ai.storeCredit) ? Number(ai.storeCredit) : null;
        if (!storeCredit) return null;
        const partPrice = parseFloat(ai.partPrice || 0) || 0;
        const others = parseFloat(ai.others || 0) || 0;
        let yardShipping = 0;
        const details = ai.shippingDetails || "";
        if (/yard\s*shipping/i.test(details)) yardShipping = parseAmountAfterColon(details);
        return {
          idx: idx + 1,
          yardName: ai.yardName || `Yard ${idx + 1}`,
          storeCredit,
          partPrice,
          others,
          yardShipping,
          status: ai.status || "",
          expShipDate: ai.expShipDate || "",
          expediteShipping: ai.expediteShipping === true || ai.expediteShipping === "true",
        };
      })
      .filter(Boolean);

    if (yardsWithCredit.length === 0) return;

    const totalStoreCredit = yardsWithCredit.reduce((s, y) => s + y.storeCredit, 0);
    const totalCharged = yardsWithCredit.reduce(
      (s, y) => s + y.partPrice + y.others + y.yardShipping,
      0
    );

    filtered.push({
      ...order,
      yardDetails: yardsWithCredit,
      storeCredit: Number(totalStoreCredit.toFixed(2)),
      chargedAmount: Number(totalCharged.toFixed(2)),
    });
  });

  return filtered;
}

/* ---------- Extra totals for modal ---------- */
const extraTotals = (rows) => {
  const totalCredit = rows.reduce((s, o) => s + (parseFloat(o.storeCredit) || 0), 0);
  const totalCharged = rows.reduce((s, o) => s + (parseFloat(o.chargedAmount) || 0), 0);
  return [
    { name: "Total Orders (with Store Credit)", value: rows.length },
    { name: "Total Store Credit", value: `$${totalCredit.toFixed(2)}` },
    { name: "Total Charged Amount", value: `$${totalCharged.toFixed(2)}` },
  ];
};

/* ---------- Page ---------- */
export default function StoreCredits() {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [totalLabel, setTotalLabel] = useState("Total Orders: 0 | Store Credit: $0.00");

  const renderCell = useCallback(
    (row, key) => {
      const isExpanded = expandedIds.has(row.orderNo);
      switch (key) {
        case "orderNo":
          return row.orderNo || "—";

        case "orderDate":
          return formatDateSafe(row.orderDate);

        case "salesAgent":
          return row.salesAgent || "—";

        case "yardDetails":
          return (
            <div>
              <div className="flex justify-between items-center">
                <span>{row.yardDetails?.length || 0} yards</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedIds((prev) => {
                      const next = new Set(prev);
                      next.has(row.orderNo) ? next.delete(row.orderNo) : next.add(row.orderNo);
                      return next;
                    });
                  }}
                  className="text-blue-400 text-xs underline hover:text-blue-300"
                >
                  {isExpanded ? "Hide Details" : "Show Details"}
                </button>
              </div>

              {isExpanded && (
                <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1 text-white/90">
                  {row.yardDetails.map((y, i) => (
                    <div key={i} className="pb-1 border-b border-white/10 last:border-0">
                      <div><b>Yard:</b> {y.yardName}</div>
                      <div><b>Store Credit:</b> ${y.storeCredit.toFixed(2)}</div>
                      <div>
                        <b>Part:</b> ${y.partPrice.toFixed(2)} | <b>Others:</b> ${y.others.toFixed(2)} |{" "}
                        <b>Yard Shipping:</b> ${y.yardShipping.toFixed(2)}
                      </div>
                      <div><b>Status:</b> {y.status || "N/A"}</div>
                      <div><b>Expected Ship Date:</b> {y.expShipDate || "N/A"}</div>
                      <div><b>Expedite:</b> {y.expediteShipping ? "Yes" : "No"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );

        case "chargedAmount":
          return `$${Number(row.chargedAmount || 0).toFixed(2)}`;

        case "storeCredit":
          return `$${Number(row.storeCredit || 0).toFixed(2)}`;

        default:
          return row[key] ?? "—";
      }
    },
    [expandedIds]
  );

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
  }, []);

  const fetchOverride = useCallback(async ({ filter }) => {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const params = paramsBuilder({ filter });
    const merged = await fetchAllStoreCredits(params, headers);
    return merged;
  }, [paramsBuilder]);

  const onRowsChange = useCallback((rows) => {
    const totalCredit = rows.reduce((s, o) => s + (parseFloat(o.storeCredit) || 0), 0);
    setTotalLabel(`Total Orders: ${rows.length} | Store Credit: $${totalCredit.toFixed(2)}`);
  }, []);

  return (
    <OrdersTable
      title="Store Credits"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page: "storeCreditsPage",
        search: "storeCreditsSearch",
        filter: "storeCreditsFilter_v1",
        hilite: "storeCreditsHilite",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showTotalsButton={true}
      extraTotals={extraTotals}
      paramsBuilder={paramsBuilder}
      fetchOverride={fetchOverride}
      onRowsChange={onRowsChange}
      totalLabel={totalLabel}
      showTotalsNearPill={true}
    />
  );
}
