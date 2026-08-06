// /src/pages/MonthlyOrders.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";
import API from "../api";
import { canAssignOrders } from "../../../shared/constants/assignOrdersAccess.js";
import { OPS_TEAMS } from "../../../shared/constants/opsTeams.js";
import { isCommonTeam } from "../../../shared/constants/teams.js";

/* ---------- Columns (order matters) ---------- */
const columns = [
  { key: "orderDate", label: "Order Date" },
  { key: "orderNo", label: "Order No" },
  { key: "pReq", label: "Part Name" },
  { key: "salesAgent", label: "Sales Agent" },
  { key: "customerName", label: "Customer Name" },
  { key: "yardName", label: "Yard Details" },
  { key: "soldP", label: "Sale Price" },
  { key: "paymentSource", label: "Payment Source" },
  { key: "grossProfit", label: "Est GP" },
  { key: "_actualGP", label: "Actual GP" },
  { key: "orderStatus", label: "Order Status" },
];

/* ---------- Helpers ---------- */
/**
 * Format order status for display
 * Transforms "Dispute 2" to "Dispute AC"
 */
function formatOrderStatus(status) {
  if (!status) return "";
  if (status === "Dispute 2") return "Dispute AC";
  return status;
}

/**
 * Extract firstName from salesAgent (handles both "Richard" and "Richard Parker")
 */
function getSalesAgentFirstName(salesAgent) {
  if (!salesAgent) return "—";
  const trimmed = String(salesAgent).trim();
  // Extract first word (firstName)
  return trimmed.split(" ")[0] || trimmed;
}

/**
 * Extract numeric shipping value from shippingDetails string
 * Handles both "Own shipping: X" and "Yard shipping: X" formats
 * Always extracts from shippingDetails, never from ownShipping/yardShipping fields
 */
function parseShippingCost(field) {
  if (!field || typeof field !== "string") return 0;
  // Match "Own shipping: X" or "Yard shipping: X" (case-insensitive, handles decimals)
  const match = field.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
  if (match) {
    const num = parseFloat(match[1]);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function computeYardDerived(yard) {
  const shippingCost = parseShippingCost(yard?.shippingDetails);
  const partPrice = parseFloat(yard?.partPrice || 0) || 0;
  const others = parseFloat(yard?.others || 0) || 0;
  const refundedAmount = parseFloat(yard?.refundedAmount || 0) || 0;
  const custOwnShipReplacement = parseFloat(yard?.custOwnShipReplacement || 0) || 0;
  const yardOwnShipping = parseFloat(yard?.yardOwnShipping || 0) || 0;
  const custOwnShippingReturn = parseFloat(yard?.custOwnShippingReturn || 0) || 0;

  const yardSpendTotal =
    partPrice +
    shippingCost +
    others -
    refundedAmount +
    yardOwnShipping +
    custOwnShippingReturn -
    custOwnShipReplacement;

  const escSpending =
    yardOwnShipping + custOwnShippingReturn + custOwnShipReplacement;

  return {
    shippingCost,
    partPrice,
    others,
    refundedAmount,
    custOwnShipReplacement,
    yardOwnShipping,
    custOwnShippingReturn,
    yardSpendTotal,
    escSpending,
  };
}

/* ---------- Page ---------- */
function readAuthEmailRole() {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        role: parsed?.user?.role || localStorage.getItem("role") || "",
        email: (parsed?.user?.email || localStorage.getItem("email") || "").toLowerCase(),
      };
    }
  } catch {
    /* ignore */
  }
  return {
    role: localStorage.getItem("role") || "",
    email: (localStorage.getItem("email") || "").toLowerCase(),
  };
}

export default function MonthlyOrders() {
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [sendingSalesReport, setSendingSalesReport] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignTeam, setAssignTeam] = useState("");
  const [assignTeams, setAssignTeams] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const brand = useBrand(); // 50STARS / PROLANE

  const canSendSalesReport = useMemo(() => {
    const { role, email } = readAuthEmailRole();
    return role === "Admin" || email === "50starsauto110@gmail.com";
  }, []);

  const canAssignTeam = useMemo(() => {
    const { role, email } = readAuthEmailRole();
    return canAssignOrders({ role, email });
  }, []);

  useEffect(() => {
    if (!canAssignTeam) return;
    API.get("/teams")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        const opsNames = new Set(
          OPS_TEAMS.map((t) => String(t.teamName).toLowerCase())
        );
        const preferred = list.filter(
          (t) => t?.teamName && opsNames.has(String(t.teamName).toLowerCase())
        );
        const fallback = list.filter(
          (t) =>
            t?.teamName &&
            !isCommonTeam(t.teamName) &&
            !/^team\s+/i.test(String(t.teamName).trim())
        );
        setAssignTeams(preferred.length ? preferred : fallback);
      })
      .catch(() => setAssignTeams([]));
  }, [canAssignTeam]);

  const openAssign = useCallback((row) => {
    setAssignTarget(row);
    setAssignTeam(String(row?.teamOrder || "").trim());
  }, []);

  const closeAssign = useCallback(() => {
    if (assigning) return;
    setAssignTarget(null);
    setAssignTeam("");
  }, [assigning]);

  const confirmAssign = useCallback(async () => {
    if (!assignTarget?.orderNo || !assignTeam || assigning) return;
    setAssigning(true);
    try {
      const { data } = await API.patch(
        `/orders/monthlyOrders/${encodeURIComponent(assignTarget.orderNo)}/assign-team`,
        { teamOrder: assignTeam }
      );
      const savedTeam = String(data?.teamOrder || assignTeam).trim();
      window.alert(
        `Order ${assignTarget.orderNo} assigned to ${savedTeam}.`
      );
      setAssignTarget(null);
      setAssignTeam("");
      if (window.__ordersTableRefs?.monthlyOrders?.refetch) {
        window.__ordersTableRefs.monthlyOrders.refetch();
      }
    } catch (err) {
      window.alert(err?.response?.data?.message || "Failed to assign team.");
    } finally {
      setAssigning(false);
    }
  }, [assignTarget, assignTeam, assigning]);

  const extraActions = useCallback(
    (row) => {
      if (!canAssignTeam) return null;
      const current = String(row?.teamOrder || "").trim();
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openAssign(row);
          }}
          className="px-3 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white"
          title={current ? `Assigned: ${current}` : "Assign to team"}
        >
          {current ? "Reassign" : "Assign"}
        </button>
      );
    },
    [canAssignTeam, openAssign]
  );

  const toggleExpand = useCallback((row) => {
    const id = row._id || row.orderNo || `${row.orderDate || ""}-${Math.random()}`;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const isOpenId = (row) => {
    const id = row._id || row.orderNo || `${row.orderDate || ""}-fallback`;
    return expandedIds.has(id);
  };

  const renderCell = useCallback(
    (row, key, formatDateSafe, currency) => {
      const open = isOpenId(row);

      switch (key) {
        case "orderDate":
          return formatDateSafe(row.orderDate);

        case "orderNo":
          return (
            <div className="flex items-center justify-between gap-2">
              <span>{row.orderNo || "—"}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(row);
                }}
                className="text-blue-400 text-xs underline hover:text-blue-300 shrink-0"
              >
                {open ? "Hide Details" : "Show Details"}
              </button>
            </div>
          );

        case "pReq":
          return (
            <div>
              <div>{row.pReq || row.partName || "—"}</div>
              {open && (
                <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                  <b>
                    {row.year} {row.make} {row.model}
                  </b>
                  <div>
                    <b>Desc:</b> {row.desc}
                  </div>
                  <div>
                    <b>Part No:</b> {row.partNo}
                  </div>
                  <div>
                    <b>VIN:</b> {row.vin}
                  </div>
                  <div>
                    <b>Warranty:</b> {(() => {
                      const warrantyField = (row?.warrantyField || "days").toString().toLowerCase().trim();
                      const warrantyValue = Number(row?.warranty) || 0;
                      let displayUnit;
                      if (warrantyField === "month" || warrantyField === "months") {
                        displayUnit = warrantyValue === 1 ? "Month" : "Months";
                      } else if (warrantyField === "year" || warrantyField === "years") {
                        displayUnit = warrantyValue === 1 ? "Year" : "Years";
                      } else {
                        displayUnit = warrantyValue === 1 ? "Day" : "Days";
                      }
                      return `${row.warranty || 0} ${displayUnit}`;
                    })()}
                  </div>
                  <div>
                    <b>Programming:</b>{" "}
                    {row.programmingRequired ? "Yes" : "No"}
                  </div>
                </div>
              )}
            </div>
          );

        case "salesAgent":
          return getSalesAgentFirstName(row.salesAgent);

        case "customerName":
          return (
            <div>
              <div>
                {row.fName && row.lName
                  ? `${row.fName} ${row.lName}`
                  : row.customerName || "—"}
              </div>
              {open && (
                <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                  <div>
                    <b>Email:</b> {row.email}
                  </div>
                  <div>
                    <b>Phone:</b> {row.phone}
                  </div>
                  <div>
                    <b>Address:</b> {(() => {
                      const addressParts = [
                        row.sAddressStreet,
                        row.sAddressCity,
                        row.sAddressState,
                        row.sAddressZip,
                        row.sAddressAcountry
                      ].filter(part => part && part.trim().length > 0);
                      return addressParts.length > 0 ? addressParts.join(", ") : "—";
                    })()}
                  </div>
                </div>
              )}
            </div>
          );

        case "yardName": {
          const yards = Array.isArray(row.additionalInfo)
            ? row.additionalInfo
            : [];
          const hasAnyYard = yards.some(
            (y) => (y?.yardName || "").trim().length > 0
          );
          if (!hasAnyYard)
            return <span className="font-medium whitespace-nowrap"></span>;

          return (
            <div className="space-y-2">
              <div className="flex-1 text-white">
                {yards.map((y, idx) => (
                  <div key={idx} className="font-medium whitespace-nowrap">
                    <div>{y?.yardName || ""}</div>
                    <div className="text-xs text-white/80">
                      <b>Payment status:</b> {y?.pamentStatus || y?.paymentStatus || ""}
                    </div>
                  </div>
                ))}
              </div>

              {open && (
                <div className="whitespace-nowrap mt-2 text-sm text-white/80 space-y-2">
                  {yards.map((yard, i) => {
                    const d = computeYardDerived(yard);
                    return (
                      <div key={i} className="border-t border-white/15 pt-2">
                        <div>
                          <b>Yard:</b> {yard?.yardName || "N/A"}
                        </div>
                        <div>
                          <b>Part Price:</b> {currency(d.partPrice)}
                        </div>
                        <div>
                          <b>Shipping:</b> {currency(d.shippingCost)}
                        </div>
                        <div>
                          <b>Others:</b> {currency(d.others)}
                        </div>
                        <div>
                          <b>Yard refund:</b> {currency(d.refundedAmount)}
                        </div>
                        <div>
                          <b>Esc spending:</b> {currency(d.escSpending)}
                        </div>
                        <div>
                          <b>Yard spending:</b> {currency(d.yardSpendTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        case "soldP":
          return <span className="block">{currency(row.soldP)}</span>;

        case "paymentSource":
          return row.paymentSource || "—";

        case "grossProfit":
          return <span className="block">{currency(row.grossProfit)}</span>;

        case "_actualGP":
          return <span className="block">{currency(row.actualGP)}</span>;

        case "orderStatus":
          return formatOrderStatus(row.orderStatus) || "";

        default:
          return row[key] ?? "—";
      }
    },
    [expandedIds]
  );

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

  const handleSendSalesReport = useCallback(async (filter) => {
    const payload = {};
    if (filter?.start && filter?.end) {
      payload.start = filter.start;
      payload.end = filter.end;
    } else if (filter?.month && filter?.year) {
      payload.month = filter.month;
      payload.year = filter.year;
    } else {
      window.alert("Select a date range or month before sending the sales report.");
      return;
    }
    setSendingSalesReport(true);
    try {
      const { data } = await API.post("/orders/monthlyOrders/send-sales-report", payload);
      window.alert(data?.message || "Sales report email sent.");
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send sales report.";
      window.alert(msg);
    } finally {
      setSendingSalesReport(false);
    }
  }, []);

  // Realtime: when orders change, refetch monthly data with the current filter.
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      // OrdersTable will call our fetchOverride with its current filter.
      // No extra work needed here.
      // Triggering refetch is handled via tableId + global ref in OrdersTable.
      if (window.__ordersTableRefs?.monthlyOrders?.refetch) {
        window.__ordersTableRefs.monthlyOrders.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.monthlyOrders?.refetch) {
        window.__ordersTableRefs.monthlyOrders.refetch();
      }
    },
  });

  // When brand changes, force the table to refetch with the new brand
  useEffect(() => {
    if (window.__ordersTableRefs?.monthlyOrders?.refetch) {
      window.__ordersTableRefs.monthlyOrders.refetch();
    }
  }, [brand]);

  // Totals for eye-icon modal
  const paymentSourceTotals = useCallback((rows = [], ctx = {}) => {
    const meta = ctx?.responseMeta || {};
    const backendRows = Array.isArray(meta?.paymentSourceTotals)
      ? meta.paymentSourceTotals
      : [];

    if (backendRows.length > 0) {
      const totalEstGP = Number(meta?.totalEstGP) || 0;
      const totalActualGP = Number(meta?.totalActualGP) || 0;
      const grandTotal = Number(meta?.totalPaymentSourceAmount) || 0;
      const totalCount = Number(meta?.totalOrders) || 0;

      return [
        { name: "Total Est GP", value: `$${totalEstGP.toFixed(2)}` },
        { name: "Total Actual GP", value: `$${totalActualGP.toFixed(2)}` },
        ...backendRows.map((item) => ({
          name: `Payment Source — ${item.source || "Unknown / Not Set"}`,
          value: `$${(Number(item.totalSoldP) || 0).toFixed(2)}`,
          count: Number(item.count) || 0,
        })),
        {
          name: "Total — All Payment Sources",
          value: `$${grandTotal.toFixed(2)}`,
          count: totalCount,
          isTotal: true,
        },
      ];
    }

    // Fallback to current rows only if backend totals are unavailable.
    const totalEstGP = rows.reduce((sum, row) => sum + (parseFloat(row?.grossProfit) || 0), 0);
    const totalActualGP = rows.reduce((sum, row) => sum + (parseFloat(row?.actualGP) || 0), 0);
    return [
      { name: "Total Est GP", value: `$${totalEstGP.toFixed(2)}` },
      { name: "Total Actual GP", value: `$${totalActualGP.toFixed(2)}` },
    ];
  }, []);

  return (
    <>
      <OrdersTable
        title="Monthly Orders"
        endpoint="/orders/monthlyOrders"
        storageKeys={{
          page: "monthlyOrdersPage",
          search: "monthlyOrdersSearch",
          filter: "mo_filter_v2",
          hilite: "highlightedOrderNo",
        }}
        columns={columns}
        renderCell={renderCell}
        showAgentFilter={true}
        showAddressTypeFilter={true}
        showGP={false}
        showTotalsButton={true}
        extraTotals={paymentSourceTotals}
        paramsBuilder={paramsBuilder}
        tableId="monthlyOrders"
        extraActions={canAssignTeam ? extraActions : undefined}
        subheaderExtra={
          canSendSalesReport
            ? ({ activeFilter }) => (
                <button
                  type="button"
                  onClick={() => handleSendSalesReport(activeFilter)}
                  disabled={sendingSalesReport}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
                  title="Email sales report for the selected range (50STARS + Prolane)"
                >
                  {sendingSalesReport ? "Sending…" : "Send Sales Report"}
                </button>
              )
            : null
        }
      />

      {assignTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div
            className="absolute inset-0 bg-slate-900/65 backdrop-blur-sm"
            onClick={closeAssign}
          />
          <div className="relative w-[420px] max-w-[95vw] rounded-2xl p-6 bg-white/12 border border-white/20 ring-1 ring-inset ring-white/15 backdrop-blur-xl text-white">
            <button
              type="button"
              className="absolute top-2 right-3 rounded-full p-1.5 hover:bg-white/10 text-white/80"
              onClick={closeAssign}
              aria-label="Close"
            >
              ×
            </button>
            <h3 className="text-lg font-semibold mb-1 text-center">Assign Team</h3>
            <p className="text-white/75 text-sm text-center mb-4">
              Order <span className="font-semibold">{assignTarget.orderNo}</span>
              {assignTarget.teamOrder ? (
                <>
                  {" "}
                  · current: <span className="font-semibold">{assignTarget.teamOrder}</span>
                </>
              ) : (
                <> · not assigned</>
              )}
            </p>
            <label className="block text-xs text-white/70 mb-1">Team</label>
            <select
              value={assignTeam}
              onChange={(e) => setAssignTeam(e.target.value)}
              className="w-full mb-4 rounded-md border border-white/30 bg-white text-slate-900 px-2 py-2 text-sm"
            >
              <option value="">Select team</option>
              {assignTeams.map((t) => (
                <option key={t._id || t.teamName} value={t.teamName}>
                  {t.teamName}
                </option>
              ))}
            </select>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={confirmAssign}
                disabled={!assignTeam || assigning}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white font-medium shadow hover:bg-amber-500 disabled:opacity-60"
              >
                {assigning
                  ? "Saving…"
                  : String(assignTarget.teamOrder || "").trim()
                    ? "Update Team"
                    : "Assign"}
              </button>
              <button
                type="button"
                onClick={closeAssign}
                disabled={assigning}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
