import React, { useCallback, useEffect, useMemo, useState } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

const TZ = "America/Chicago";
const ALLOWED_EMAIL = "50starsauto110@gmail.com";

const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "orderDate", label: "Order Date" },
  { key: "salesAgent", label: "Sales Agent" },
  { key: "customerName", label: "Customer" },
  { key: "orderStatus", label: "Status" },
  { key: "estimatedGP", label: "Est GP ($)" },
  { key: "actualGP", label: "Actual GP ($)" },
  { key: "gpPercentOfEst", label: "Actual % of Est" },
  { key: "updateLabel", label: "Update" },
];

function formatDateSafe(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}

function currency(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return `$${num.toFixed(2)}`;
}

function readAuth() {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        role: parsed?.user?.role || localStorage.getItem("role") || "",
        email: parsed?.user?.email || localStorage.getItem("email") || "",
      };
    }
  } catch {}
  return {
    role: localStorage.getItem("role") || "",
    email: localStorage.getItem("email") || "",
  };
}

export default function GpLessThan50() {
  const brand = useBrand();
  const { role, email } = useMemo(() => readAuth(), []);
  const canAccess = useMemo(() => {
    const isAdmin = String(role || "").trim().toLowerCase() === "admin";
    const isAllowed =
      String(email || "").trim().toLowerCase() === ALLOWED_EMAIL;
    return isAdmin || isAllowed;
  }, [role, email]);

  const [totalLabel, setTotalLabel] = useState("Total Orders: 0");

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
      const res = await API.get("/reports/gp-less-than-50", { params, headers });
      return Array.isArray(res.data?.orders) ? res.data.orders : [];
    },
    [paramsBuilder, brand]
  );

  const renderCell = useCallback((row, key) => {
    switch (key) {
      case "orderNo":
        return row.orderNo || "—";
      case "orderDate":
        return formatDateSafe(row.orderDate);
      case "salesAgent":
        return row.salesAgent || "—";
      case "customerName":
        return row.customerName || "—";
      case "orderStatus":
        return row.orderStatus || "—";
      case "estimatedGP":
        return currency(row.estimatedGP ?? row.grossProfit);
      case "actualGP":
        return currency(row.actualGP);
      case "gpPercentOfEst":
        return row.gpPercentOfEst != null ? `${row.gpPercentOfEst}%` : "—";
      case "updateLabel":
        return (
          <div className="text-sm leading-snug whitespace-pre-line max-w-[260px]">
            {String(row.updateLabel || "—")
              .split(" | ")
              .map((line, i) => (
                <div key={`${row.orderNo}-upd-${i}`}>{line}</div>
              ))}
          </div>
        );
      default:
        return row[key] ?? "—";
    }
  }, []);

  const onRowsChange = useCallback((rows) => {
    setTotalLabel(`Total Orders: ${Array.isArray(rows) ? rows.length : 0}`);
  }, []);

  useOrdersRealtime({
    enabled: canAccess,
    onOrderCreated: () => {
      window.__ordersTableRefs?.gpLessThan50?.refetch?.();
    },
    onOrderUpdated: () => {
      window.__ordersTableRefs?.gpLessThan50?.refetch?.();
    },
  });

  useEffect(() => {
    if (canAccess) {
      window.__ordersTableRefs?.gpLessThan50?.refetch?.();
    }
  }, [brand, canAccess]);

  if (!canAccess) {
    return (
      <div className="p-6 text-white">
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          This report is available only for Admin or 50starsauto110@gmail.com.
        </div>
      </div>
    );
  }

  return (
    <OrdersTable
      title="GP Less Than 50%"
      endpoint="/reports/gp-less-than-50"
      storageKeys={{
        page: "gpLessThan50Page",
        search: "gpLessThan50Search",
        filter: "gpLessThan50Filter_v1",
        hilite: "gpLessThan50Hilite",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={true}
      showTotalsButton={false}
      paramsBuilder={paramsBuilder}
      fetchOverride={fetchOverride}
      onRowsChange={onRowsChange}
      totalLabel={totalLabel}
      showTotalsNearPill={true}
      tableId="gpLessThan50"
    />
  );
}
