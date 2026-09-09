// src/pages/CardNotCharged.jsx
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

const isPOCancelledStatus = (status) => {
  const t = String(status || "")
    .trim()
    .toLowerCase();
  return t === "po cancelled" || t === "po canceled" || t === "po cancel";
};

// Qualifies when:
// - Normal yards: payment empty or "Card not charged"
// - PO cancelled yards: only if paymentStatus is still unset (not "Card charged" / "Card not charged")
const yardQualifies = (info) => {
  const ps = (info?.paymentStatus || info?.pamentStatus || "").trim().toLowerCase();
  const paymentUnset = !ps;
  const paymentCardNotCharged = ps === "card not charged";

  if (isPOCancelledStatus(info?.status)) {
    return paymentUnset;
  }
  return paymentUnset || paymentCardNotCharged;
};

/* ---------- One-page Fetch ---------- */
async function fetchCardNotChargedPage(params, headers) {
  const res = await API.get(`/orders/monthlyOrders`, { params, headers });
  const allOrders = Array.isArray(res.data?.orders) ? res.data.orders : [];
  // 3️⃣ Filter and calculate approx. charge
  const filtered = [];

  allOrders.forEach((order) => {
    const yards = [];
    (Array.isArray(order.additionalInfo) ? order.additionalInfo : []).forEach(
      (info, idx) => {
        if (!yardQualifies(info)) return;
        yards.push({ ...info, yardIndex: idx + 1 });
      }
    );
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

  return { rows: filtered, meta: res.data || {} };
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
  const [totalLabel, setTotalLabel] = useState("Total Orders: 0 | Approx: $0.00");
  const brand = useBrand(); // 50STARS / PROLANE

  const renderCell = useCallback((row, key) => {
    switch (key) {
      case "orderNo":
        return row.orderNo || "—";
      case "orderDate":
        return formatDateSafe(row.orderDate);
      case "salesAgent":
        return row.salesAgent || "—";
      case "yardDetails": {
        const yards = row.yardDetails || [];
        if (yards.length === 0) return "—";
        return (
          <div className="space-y-2 text-xs text-white/90">
            {yards.map((y, i) => (
              <div
                key={`${y.yardIndex ?? i}-${y.yardName || ""}`}
                className={i > 0 ? "border-t border-white/20 pt-2 mt-2" : ""}
              >
                <div className="font-semibold text-sm mb-1">
                  Yard {y.yardIndex ?? i + 1}
                  {y.yardName ? `: ${y.yardName}` : ""}
                </div>
                <div>
                  <b>Status:</b> {y.status || "—"}
                </div>
                <div>
                  <b>Payment:</b>{" "}
                  {y?.pamentStatus || y?.paymentStatus || "—"}
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
        );
      }
      case "approxCharge":
        return `$${Number(row.approxCharge || 0).toFixed(2)}`;
      default:
        return row[key] ?? "—";
    }
  }, []);

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
        cardNotChargedOnly: "true",
      };
      if (
        (userRole || "").toLowerCase() === "admin" &&
        selectedAgent &&
        selectedAgent !== "Select" &&
        selectedAgent !== "All"
      ) {
        params.salesAgent = selectedAgent;
      }
      const { rows, meta } = await fetchCardNotChargedPage(params, headers);
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
    const totalApprox = rows.reduce((sum, o) => sum + (o.approxCharge || 0), 0);
    setTotalLabel(
      `Total Orders: ${rows.length} | Approx: $${totalApprox.toFixed(2)}`
    );
  }, []);

  // Realtime: refetch when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.cardNotCharged?.refetch) {
        window.__ordersTableRefs.cardNotCharged.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.cardNotCharged?.refetch) {
        window.__ordersTableRefs.cardNotCharged.refetch();
      }
    },
  });

  // Refetch when brand changes
  useEffect(() => {
    if (window.__ordersTableRefs?.cardNotCharged?.refetch) {
      window.__ordersTableRefs.cardNotCharged.refetch();
    }
  }, [brand]);

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
      tableId="cardNotCharged"
    />
  );
}
