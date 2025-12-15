// src/pages/ShippingExpenses.jsx
import React, { useCallback, useState } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import useOrdersRealtime from "../hooks/useOrdersRealtime";

const TZ = "America/Chicago";

/* ---------- Columns ---------- */
const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "orderDate", label: "Order Date" },
  { key: "salesAgent", label: "Sales Agent" },
  { key: "customerName", label: "Customer Name" },
  { key: "yardDetails", label: "Yard Details" },
  { key: "shippingCardCharged", label: "Shipping (Card Charged $)" },
];

/* ---------- Helpers ---------- */
function formatDateSafe(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}

function parseShippingAmount(s) {
  if (!s || typeof s !== "string") return 0;
  const m = s.match(/(-?\\d+(?:\\.\\d+)?)/);
  return m ? parseFloat(m[0]) : 0;
}

/* ---------- Multi-page Fetch (Fix 1) ---------- */
async function fetchAllShippingExpenses(params, headers) {
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
      const arr = Array.isArray(r.data?.orders) ? r.data.orders : [];
      allOrders = allOrders.concat(arr);
    });
  }

  // derive shipping expenses
  const processed = allOrders.map((order) => {
    const infos = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];

    const yards = infos.map((ai, i) => ({
      idx: i + 1,
      yardName: ai.yardName || "-",
      shippingDetails: ai.shippingDetails || "",
      paymentStatus: ai.paymentStatus || "",
      phone: ai.phone || "",
      email: ai.email || "",
    }));

    const shippingCardCharged = infos.reduce((sum, ai) => {
      if (ai?.paymentStatus === "Card charged") {
        sum += parseShippingAmount(ai.shippingDetails);
      }
      return sum;
    }, 0);

    return {
      ...order,
      yardDetails: yards,
      shippingCardCharged: Number(shippingCardCharged.toFixed(2)),
    };
  });

  return processed;
}

/* ---------- Extra totals for modal ---------- */
const extraTotals = (rows) => {
  const totalShip = rows.reduce((s, o) => s + (parseFloat(o.shippingCardCharged) || 0), 0);
  return [
    { name: "Total Orders", value: rows.length },
    { name: "Total Shipping (Card Charged)", value: `$${totalShip.toFixed(2)}` },
  ];
};

/* ---------- Page ---------- */
export default function ShippingExpenses() {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [totalLabel, setTotalLabel] = useState(
    "Total Orders: 0 | Shipping (Card Charged): $0.00"
  );

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
        case "customerName":
          return row.customerName || "—";
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
                      next.has(row.orderNo)
                        ? next.delete(row.orderNo)
                        : next.add(row.orderNo);
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
                    <div
                      key={i}
                      className="mb-2 pb-1 border-b border-white/10 last:border-0"
                    >
                      <div>
                        <b>Yard:</b> {y.yardName}
                      </div>
                      <div>
                        <b>Shipping:</b> {y.shippingDetails || "—"}
                      </div>
                      <div>
                        <b>Payment:</b> {y.paymentStatus || "—"}
                      </div>
                      {(y.phone || y.email) && (
                        <div>
                          <b>Contact:</b> {y.phone || "—"}{" "}
                          {y.phone && y.email ? "|" : ""} {y.email || ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        case "shippingCardCharged":
          return `$${Number(row.shippingCardCharged || 0).toFixed(2)}`;
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

  const fetchOverride = useCallback(
    async ({ filter }) => {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const params = paramsBuilder({ filter });
      const all = await fetchAllShippingExpenses(params, headers);
      return all;
    },
    [paramsBuilder]
  );

  const onRowsChange = useCallback((rows) => {
    const totalShip = rows.reduce(
      (s, o) => s + (parseFloat(o.shippingCardCharged) || 0),
      0
    );
    setTotalLabel(
      `Total Orders: ${rows.length} | Shipping (Card Charged): $${totalShip.toFixed(2)}`
    );
  }, []);

  return (
    <OrdersTable
      title="Shipping Expenses"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page: "shippingExpPage",
        search: "shippingExpSearch",
        filter: "shippingExpFilter_v1",
        hilite: "shippingExpHilite",
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
      tableId="shippingExpenses"
    />
  );
}
