// src/pages/CardNotCharged.jsx
import React, { useCallback, useState } from "react";
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
  { key: "approxCharge", label: "Approx. Card Charged ($)" },
];

/* ---------- Helpers ---------- */
const formatDateSafe = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
};

const parseAmountAfterColon = (s) => {
  if (!s || typeof s !== "string") return 0;
  const idx = s.indexOf(":");
  if (idx === -1) return 0;
  const n = parseFloat(s.slice(idx + 1).trim());
  return isNaN(n) ? 0 : n;
};

// Yard qualifies ONLY when: (!paymentStatus || "Card not charged") AND status !== "PO cancelled"
const yardQualifies = (info) => {
  const ps = (info?.paymentStatus || "").toLowerCase();
  const st = (info?.status || "").toLowerCase();
  return (!ps || ps === "card not charged") && st !== "po cancelled";
};

/* ---------- Multi-page Fetch ---------- */
async function fetchCardNotChargedOrders(params, headers) {
  // 1️⃣ First page
  const first = await API.get(`/orders/monthlyOrders`, {
    params: { ...params, page: 1 },
    headers,
  });
  const { orders: firstOrders = [], totalPages = 1 } = first.data || {};
  let allOrders = [...firstOrders];

  // 2️⃣ Fetch remaining pages if any
  if (totalPages > 1) {
    const requests = [];
    for (let p = 2; p <= totalPages; p++) {
      requests.push(
        API.get(`/orders/monthlyOrders`, { params: { ...params, page: p }, headers })
      );
    }
    const results = await Promise.all(requests);
    results.forEach((r) => {
      const arr = Array.isArray(r.data?.orders) ? r.data.orders : [];
      allOrders = allOrders.concat(arr);
    });
  }

  // 3️⃣ Filter and calculate approx. charge
  const filtered = [];

  allOrders.forEach((order) => {
    const yards = Array.isArray(order.additionalInfo)
      ? order.additionalInfo.filter(yardQualifies)
      : [];
    if (yards.length === 0) return;

    let approxCharge = 0;
    yards.forEach((info) => {
      const shippingDetails = info.shippingDetails || "";
      const partPrice = parseFloat(info.partPrice || 0) || 0;
      const others = parseFloat(info.others || 0) || 0;

      let yardShipping = 0;
      if (shippingDetails.toLowerCase().includes("yard shipping")) {
        yardShipping = parseAmountAfterColon(shippingDetails);
      }
      approxCharge += partPrice + yardShipping + others;
    });

    filtered.push({
      ...order,
      yardDetails: yards,
      approxCharge: Number(approxCharge.toFixed(2)),
    });
  });

  return filtered;
}

/* ---------- Extra totals for modal ---------- */
const extraTotals = (rows) => {
  const totalApprox = rows.reduce((sum, o) => sum + (o.approxCharge || 0), 0);
  return [
    { name: "Total Orders (Card Not Charged)", value: rows.length },
    { name: "Total Approx. Charge", value: `$${totalApprox.toFixed(2)}` },
  ];
};

/* ---------- Page ---------- */
export default function CardNotCharged() {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [totalLabel, setTotalLabel] = useState("Total Orders: 0 | Approx: $0.00");

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
                        <b>Yard:</b> {y.yardName || "—"}
                      </div>
                      <div>
                        <b>Status:</b> {y.status || "—"}
                      </div>
                      <div>
                        <b>Payment:</b> {y.paymentStatus || "—"}
                      </div>
                      <div>
                        <b>Stock No:</b> {y.stockNo || "—"}
                      </div>
                      <div>
                        <b>Shipping:</b> {y.shippingDetails || "—"}
                      </div>
                      <div>
                        <b>Part Price:</b> ${Number(y.partPrice || 0).toFixed(2)}
                      </div>
                      <div>
                        <b>Others:</b> ${Number(y.others || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        case "approxCharge":
          return `$${Number(row.approxCharge || 0).toFixed(2)}`;
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
      const merged = await fetchCardNotChargedOrders(params, headers);
      return merged;
    },
    [paramsBuilder]
  );

  const onRowsChange = useCallback((rows) => {
    const totalApprox = rows.reduce((sum, o) => sum + (o.approxCharge || 0), 0);
    setTotalLabel(
      `Total Orders: ${rows.length} | Approx: $${totalApprox.toFixed(2)}`
    );
  }, []);

  return (
    <OrdersTable
      title="Card Not Charged"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page: "cardNotChargedPage",
        search: "cardNotChargedSearch",
        filter: "cardNotChargedFilter_v1",
        hilite: "cardNotChargedHilite",
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
