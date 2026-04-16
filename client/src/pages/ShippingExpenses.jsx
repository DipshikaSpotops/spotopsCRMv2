// src/pages/ShippingExpenses.jsx
import React, { useCallback, useEffect, useState } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

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

function parseShippingAmount(field) {
  if (!field || typeof field !== "string") return 0;
  // Match "Own shipping: X" or "Yard shipping: X" and extract X
  const match = field.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
  if (match) {
    const num = parseFloat(match[1]);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function isOwnShipping(field) {
  return typeof field === "string" && /Own shipping:/i.test(field);
}

function isYardShipping(field) {
  return typeof field === "string" && /Yard shipping:/i.test(field);
}

/* ---------- One-page Fetch ---------- */
async function fetchShippingExpensesPage(params, headers) {
  const res = await API.get(`/orders/monthlyOrders`, { params, headers });
  const pageOrders = Array.isArray(res.data?.orders) ? res.data.orders : [];

  // derive shipping expenses
  const processed = pageOrders.map((order) => {
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
      const status = (ai?.paymentStatus || "").toLowerCase();
      if (status === "card charged") {
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

  return { rows: processed, meta: res.data || {} };
}

/* ---------- Extra totals for modal ---------- */
const extraTotals = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [
      { name: "Total Orders", value: 0 },
      { name: "Own Shipping (Card Charged)", value: "$0.00" },
      { name: "Yard Shipping (Card Charged)", value: "$0.00" },
      { name: "Total Shipping (Card Charged)", value: "$0.00", isTotal: true },
    ];
  }

  let ownTotal = 0;
  let yardTotal = 0;

  rows.forEach((order) => {
    const yards = Array.isArray(order.yardDetails) ? order.yardDetails : [];
    yards.forEach((y) => {
      const status = (y.paymentStatus || "").toLowerCase();
      if (status === "card charged") {
        const amt = parseShippingAmount(y.shippingDetails);
        if (isOwnShipping(y.shippingDetails)) {
          ownTotal += amt;
        } else if (isYardShipping(y.shippingDetails)) {
          yardTotal += amt;
        }
      }
    });
  });

  const totalShip = ownTotal + yardTotal;

  return [
    { name: "Total Orders", value: rows.length },
    { name: "Own Shipping (Card Charged)", value: `$${ownTotal.toFixed(2)}` },
    { name: "Yard Shipping (Card Charged)", value: `$${yardTotal.toFixed(2)}` },
    {
      name: "Total Shipping (Card Charged)",
      value: `$${totalShip.toFixed(2)}`,
      isTotal: true,
    },
  ];
};

/* ---------- Page ---------- */
export default function ShippingExpenses() {
  const brand = useBrand(); // 50STARS / PROLANE
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
                        <b>Payment:</b> {y?.pamentStatus || y?.paymentStatus || ""}
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
    async ({ filter, page, limit, query, sortBy, sortOrder, selectedAgent, userRole }) => {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const params = {
        ...paramsBuilder({ filter }),
        page,
        limit,
        q: query || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
        anyYardPaymentStatus: "Card charged",
      };
      if (
        (userRole || "").toLowerCase() === "admin" &&
        selectedAgent &&
        selectedAgent !== "Select" &&
        selectedAgent !== "All"
      ) {
        params.salesAgent = selectedAgent;
      }
      const { rows, meta } = await fetchShippingExpensesPage(params, headers);
      return {
        orders: rows,
        meta: {
          ...meta,
          totalOrders: Number(meta?.totalOrders) || 0,
          totalPages: Number(meta?.totalPages) || 1,
          currentPage: Number(meta?.currentPage) || Number(page) || 1,
        },
      };
    },
    [paramsBuilder, brand]
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

  // Realtime: refetch when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.shippingExpenses?.refetch) {
        window.__ordersTableRefs.shippingExpenses.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.shippingExpenses?.refetch) {
        window.__ordersTableRefs.shippingExpenses.refetch();
      }
    },
  });

  // Refetch when brand changes
  useEffect(() => {
    if (window.__ordersTableRefs?.shippingExpenses?.refetch) {
      window.__ordersTableRefs.shippingExpenses.refetch();
    }
  }, [brand]);

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
