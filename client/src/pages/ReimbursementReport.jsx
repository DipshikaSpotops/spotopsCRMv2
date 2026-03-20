// src/pages/ReimbursementReport.jsx
import React, { useCallback, useState, useEffect } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import moment from "moment-timezone";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

const TZ = "America/Chicago";

const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "customerInfo", label: "Customer Info" },
  { key: "orderDate", label: "Order Date" },
  { key: "refundedDate", label: "Refunded/Reimbursed Date" },
  { key: "amount", label: "Refunded/Reimbursement Amount ($)" },
  { key: "type", label: "Refunded/Reimbursed" },
];

function formatDateSafe(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return formatInTimeZone(d, TZ, "do MMM, yyyy");
  } catch {
    return "—";
  }
}

/** Name, phone, email from order document for table rows (field names match OrdersTable search) */
function customerFieldsFromOrder(order) {
  const nameFromParts = [order?.fName, order?.lName].filter(Boolean).join(" ").trim();
  const name =
    (order?.customerName && String(order.customerName).trim()) || nameFromParts || "";
  const phone = order?.phone != null && String(order.phone).trim() ? String(order.phone).trim() : "";
  const email = order?.email != null && String(order.email).trim() ? String(order.email).trim() : "";
  return { customerName: name, phone, email };
}

export default function ReimbursementReport() {
  const brand = useBrand();
  const [totalLabel, setTotalLabel] = useState("Total Reimbursements (0): $0.00 | Total Refunds (0): $0.00");

  // Custom fetch function that combines both endpoints and flattens data
  const fetchOverride = useCallback(async ({ filter }) => {
    const queryParams = {};

    if (filter?.start && filter?.end) {
      queryParams.start = filter.start;
      queryParams.end = filter.end;
    } else if (filter?.month && filter?.year) {
      queryParams.month = filter.month;
      queryParams.year = filter.year;
    } else {
      // Default to current month
      const dallasNow = moment().tz("America/Chicago");
      queryParams.month = dallasNow.format("MMM");
      queryParams.year = dallasNow.format("YYYY");
    }

    // Fetch both reimbursements & refunds
    const [reimbursedRes, refundedRes] = await Promise.all([
      API.get("/orders/reimbursed-by-date", { params: queryParams }).catch(() => ({ data: [] })),
      API.get("/orders/refunded-by-date", { params: queryParams }).catch(() => ({ data: [] })),
    ]);

    const reimbursed = Array.isArray(reimbursedRes.data) ? reimbursedRes.data : [];
    const refunded = Array.isArray(refundedRes.data) ? refundedRes.data : [];

    // Flatten reimbursed - order-level only (must have reimbursementDate)
    const flatReimbursed = [];

    reimbursed.forEach((order) => {
      if (order.reimbursementDate) {
        flatReimbursed.push({
          _id: `${order.orderNo}-reimbursed-order`,
          orderNo: order.orderNo,
          orderDate: order.orderDate,
          refundedDate: order.reimbursementDate,
          amount: parseFloat(order.reimbursementAmount || 0),
          type: "Reimbursed",
          source: "order",
          ...customerFieldsFromOrder(order),
        });
      }
    });

    // Flatten refunded
    const flatRefunded = refunded.map((order) => ({
      _id: `${order.orderNo}-refunded`,
      orderNo: order.orderNo,
      orderDate: order.orderDate,
      refundedDate: order.custRefundDate,
      amount: parseFloat(order.custRefAmount || 0),
      type: "Refunded",
      ...customerFieldsFromOrder(order),
    }));

    const combined = [...flatReimbursed, ...flatRefunded];
    return combined;
  }, [brand]);

  // Auto-refetch when brand changes
  useEffect(() => {
    if (window.__ordersTableRefs?.reimbursementReport?.refetch) {
      window.__ordersTableRefs.reimbursementReport.refetch();
    }
  }, [brand]);

  // Update total label when rows change (for filtering/searching)
  const onRowsChange = useCallback((rows) => {
    const totalReimbursed = rows.filter(r => r.type === "Reimbursed").reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalRefunded = rows.filter(r => r.type === "Refunded").reduce((sum, r) => sum + (r.amount || 0), 0);
    const reimbursedCount = rows.filter(r => r.type === "Reimbursed").length;
    const refundedCount = rows.filter(r => r.type === "Refunded").length;
    setTotalLabel(
      `Total Reimbursements (${reimbursedCount}): $${totalReimbursed.toFixed(2)} | Total Refunds (${refundedCount}): $${totalRefunded.toFixed(2)}`
    );
  }, []);

  const renderCell = useCallback((row, key, formatDateSafeFn) => {
    switch (key) {
      case "orderNo":
        return row.orderNo || "—";
      case "customerInfo":
        return (
          <div className="text-left text-sm leading-snug min-w-[200px] max-w-[280px]">
            <div className="font-medium text-white">{row.customerName || "—"}</div>
            <div className="text-white/85">{row.phone || "—"}</div>
            <div className="text-white/75 break-all">{row.email || "—"}</div>
          </div>
        );
      case "orderDate":
        return formatDateSafeFn ? formatDateSafeFn(row.orderDate) : formatDateSafe(row.orderDate);
      case "refundedDate":
        return formatDateSafe(row.refundedDate);
      case "amount":
        return `$${row.amount?.toFixed(2) || "0.00"}`;
      case "type":
        return row.type || "—";
      default:
        return row[key] ?? "—";
    }
  }, []);

  // Realtime: refetch reimbursements/refunds when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.reimbursementReport?.refetch) {
        window.__ordersTableRefs.reimbursementReport.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.reimbursementReport?.refetch) {
        window.__ordersTableRefs.reimbursementReport.refetch();
      }
    },
  });

  return (
    <OrdersTable
      title="Refunds/Reimbursements"
      endpoint="/orders/reimbursed-by-date" // Not used when fetchOverride is provided, but required
      storageKeys={{
        page: "reimbursementReportPage",
        search: "reimbursementReportSearch",
        filter: "reimbursementReportFilter",
        hilite: "reimbursementReportHighlightedOrderNo",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={false}
      showGP={false}
      showTotalsButton={false}
      fetchOverride={fetchOverride}
      onRowsChange={onRowsChange}
      totalLabel={totalLabel}
      showTotalsNearPill={true}
      paramsBuilder={({ filter }) => {
        // This won't be used since fetchOverride is provided, but keeping for consistency
        const params = {};
        if (filter?.start && filter?.end) {
          params.start = filter.start;
          params.end = filter.end;
        } else if (filter?.month && filter?.year) {
          params.month = filter.month;
          params.year = filter.year;
        }
        return params;
      }}
      tableId="reimbursementReport"
    />
  );
}

