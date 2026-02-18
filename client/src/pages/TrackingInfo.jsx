// /src/pages/TrackingInfo.jsx
import React, { useCallback, useMemo, useState, useEffect } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

const TZ = "America/Chicago";

/* ---------- Columns ---------- */
const columns = [
  { key: "orderDate", label: "Order Date" },
  { key: "orderNo", label: "Order No" },
  { key: "trackingLabel", label: "Tracking Label" },
  { key: "trackingValue", label: "Tracking Value" },
  { key: "labelDate", label: "Label Date" },
  { key: "shipping", label: "Shipping" },
  { key: "shippedOn", label: "Shipped On" },
  { key: "eta", label: "ETA" },
  { key: "delivered", label: "Delivered" },
];

/* ---------- Helper: safe date format ---------- */
function formatDateSafe(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}

/* ---------- Flatten orders → tracking rows ---------- */
function projectTrackingRows(order) {
  const out = [];
  const infos = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];

  infos.forEach((info) => {
    // Primary tracking
    if (info.trackingNo && String(info.trackingNo).length > 0) {
      out.push({
        orderDate: order.orderDate,
        orderNo: order.orderNo,
        trackingLabel: "Tracking No",
        trackingValue: String(info.trackingNo),
        labelDate: Array.isArray(info.labelCreationDate)
          ? info.labelCreationDate[0] || ""
          : "",
        shipping: info.shippingDetails || "",
        shippedOn: info.partShippedDate || "",
        eta: info.eta || "",
        delivered: info.deliveredDate || "",
        voided: false,
      });
    }

    // Replacement tracking (Yard)
    if (info.yardTrackingNumber) {
      out.push({
        orderDate: order.orderDate,
        orderNo: order.orderNo,
        trackingLabel: "Replacement Tracking (Yard)",
        trackingValue: String(info.yardTrackingNumber),
        labelDate: info.escRepYardTrackingDate || "",
        shipping: `${info.yardShippingMethod || ""} ${info.yardOwnShipping || ""}`.trim(),
        shippedOn: info.inTransitpartYardDate || "",
        eta: info.yardTrackingETA || "",
        delivered: info.yardDeliveredDate || "",
        voided: false,
      });
    }

    // Replacement tracking (Cust)
    if (info.customerTrackingNumberReplacement) {
      out.push({
        orderDate: order.orderDate,
        orderNo: order.orderNo,
        trackingLabel: "Replacement Tracking (Cust)",
        trackingValue: String(info.customerTrackingNumberReplacement),
        labelDate: info.escRepCustTrackingDate || "",
        shipping: `${info.customerShippingMethodReplacement || ""} ${info.custOwnShipReplacement || ""}`.trim(),
        shippedOn: info.inTransitpartCustDate || "",
        eta: info.customerETAReplacement || "",
        delivered: info.repPartCustDeliveredDate || "",
        voided: false,
      });
    }

    // Return tracking
    if (info.returnTrackingCust) {
      out.push({
        orderDate: order.orderDate,
        orderNo: order.orderNo,
        trackingLabel: "Return Tracking",
        trackingValue: String(info.returnTrackingCust),
        labelDate: info.escRetTrackingDate || "",
        shipping: `${info.customerShippingMethodReturn || ""} ${info.custOwnShippingReturn || ""}`.trim(),
        shippedOn: info.inTransitReturnDate || "",
        eta: info.custretPartETA || "",
        delivered: info.returnDeliveredDate || "",
        voided: false,
      });
    }

    // Voided histories
    const pushHistory = (arr, label, dates = []) => {
      if (Array.isArray(arr) && arr.length > 0) {
        arr.forEach((t, i) =>
          out.push({
            orderDate: order.orderDate,
            orderNo: order.orderNo,
            trackingLabel: label,
            trackingValue: String(t),
            labelDate: dates[i] || "N/A",
            shipping: "",
            shippedOn: "",
            eta: "VOIDED",
            delivered: "",
            voided: true,
          })
        );
      }
    };
    pushHistory(info.trackingHistory, "Tracking No", info.labelCreationDate?.slice(1));
    pushHistory(info.escRepTrackingHistoryYard, "Replacement Tracking (Yard)", info.escrepBOLhistoryYard);
    pushHistory(info.escRepTrackingHistoryCust, "Replacement Tracking (Cust)", info.escrepBOLhistoryCust);
    pushHistory(info.escReturnTrackingHistory, "Return Tracking No", info.escReturnBOLhistory);
  });

  return out;
}

/* ---------- Full multi-page fetch ---------- */
async function fetchAllMonthlyOrders(params, headers) {
  const first = await API.get(`/orders/monthlyOrders`, {
    params: { ...params, page: 1 },
    headers,
  });

  const { orders: firstOrders = [], totalPages = 1 } = first.data || {};
  let allOrders = [...firstOrders];

  if (totalPages > 1) {
    const reqs = [];
    for (let p = 2; p <= totalPages; p++) {
      reqs.push(API.get(`/orders/monthlyOrders`, { params: { ...params, page: p }, headers }));
    }
    const results = await Promise.all(reqs);
    results.forEach((r) => {
      const arr = Array.isArray(r.data?.orders) ? r.data.orders : [];
      allOrders = allOrders.concat(arr);
    });
  }

  return allOrders;
}

/* ---------- Totals for modal ---------- */
const extraTotals = (rows) => {
  const voided = rows.filter((r) => r.voided).length;
  const delivered = rows.filter((r) => !!r.delivered && !r.voided).length;
  return [
    { name: "Total Tracking Rows", value: rows.length },
    { name: "Delivered", value: delivered },
    { name: "Voided", value: voided },
  ];
};

/* ---------- Page ---------- */
export default function TrackingInfo() {
  const brand = useBrand();
  const [totalLabel, setTotalLabel] = useState("Rows: 0");

  const renderCell = useCallback((row, key) => {
    switch (key) {
      case "orderDate":
        return formatDateSafe(row.orderDate);
      case "eta":
        return row.eta === "VOIDED" ? (
          <span className="text-red-400 font-semibold">VOIDED</span>
        ) : (
          row.eta || "—"
        );
      default:
        return row[key] ?? "—";
    }
  }, []);

  /* ---------- Params + Fetch override ---------- */
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
      const allOrders = await fetchAllMonthlyOrders(params, headers);

      // Flatten orders to tracking rows
      const rows = allOrders.flatMap(projectTrackingRows);
      return rows;
    },
    [paramsBuilder, brand]
  );

  // Auto-refetch when brand changes
  useEffect(() => {
    if (window.__ordersTableRefs?.trackingInfo?.refetch) {
      window.__ordersTableRefs.trackingInfo.refetch();
    }
  }, [brand]);

  const onRowsChange = useCallback((rows) => {
    setTotalLabel(`Rows: ${rows.length}`);
  }, []);

  // Realtime: refetch tracking info when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.trackingInfo?.refetch) {
        window.__ordersTableRefs.trackingInfo.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.trackingInfo?.refetch) {
        window.__ordersTableRefs.trackingInfo.refetch();
      }
    },
  });

  return (
    <OrdersTable
      title="Tracking Info"
      endpoint="/orders/monthlyOrders"
      storageKeys={{
        page: "trackingPage",
        search: "trackingSearch",
        filter: "trackingFilter_v2",
        hilite: "trackingHiliteOrderNo",
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
      tableId="trackingInfo"
    />
  );
}
