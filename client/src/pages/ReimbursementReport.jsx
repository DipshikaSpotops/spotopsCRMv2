// src/pages/ReimbursementReport.jsx
import React, { useCallback, useState } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import moment from "moment-timezone";

const TZ = "America/Chicago";

const columns = [
  { key: "orderNo", label: "Order No" },
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

export default function ReimbursementReport() {
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

    // Flatten reimbursed - BOTH OLD (per-yard) AND NEW (order-level) logic
    const flatReimbursed = [];

    reimbursed.forEach((order) => {
      // OLD LOGIC: Per-yard reimbursements from additionalInfo
      if (order.additionalInfo && Array.isArray(order.additionalInfo)) {
        order.additionalInfo.forEach((info, idx) => {
          if (info.reimbursedDate) {
            flatReimbursed.push({
              _id: `${order.orderNo}-reimbursed-yard-${idx}`,
              orderNo: order.orderNo,
              orderDate: order.orderDate,
              refundedDate: info.reimbursedDate,
              amount: parseFloat(info.reimbursementAmount || 0),
              type: "Reimbursed",
              source: "yard",
              yardIndex: idx + 1,
            });
          }
        });
      }

      // NEW LOGIC: Order-level reimbursement
      if (order.reimbursementDate) {
        flatReimbursed.push({
          _id: `${order.orderNo}-reimbursed-order`,
          orderNo: order.orderNo,
          orderDate: order.orderDate,
          refundedDate: order.reimbursementDate,
          amount: parseFloat(order.reimbursementAmount || 0),
          type: "Reimbursed",
          source: "order",
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
    }));

    const combined = [...flatReimbursed, ...flatRefunded];
    return combined;
  }, []);

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
    />
  );
}

