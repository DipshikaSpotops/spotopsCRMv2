// src/pages/StoreCredits.jsx
import React, { useCallback, useEffect, useState } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import { useNavigate } from "react-router-dom";

const TZ = "America/Chicago";

/* ---------- Columns ---------- */
const columns = [
  { key: "orderNo", label: "Order No" },
  { key: "orderDate", label: "Order Date" },
  { key: "salesAgent", label: "Sales Agent" },
  { key: "yardDetails", label: "Yard Details" },
  { key: "chargedAmount", label: "Charged Amount ($)" },
  { key: "storeCredit", label: "Store Credit ($)" },
  { key: "actions", label: "Actions" },
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

/* ---------- Fetch all store credits (no date filtering) ---------- */
async function fetchAllStoreCredits(headers) {
  // Fetch directly from storeCredits endpoint - returns all orders with storeCredit
  const response = await API.get(`/orders/storeCredits`, { headers });
  const allOrders = Array.isArray(response.data) ? response.data : [];

  // Filter and transform orders
  const filtered = [];

  allOrders.forEach((order) => {
    const addl = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];
    // Only include yards that have a store credit value > 0
    const yardsWithCredit = addl
      .map((ai, idx) => {
        const storeCredit = hasNumeric(ai.storeCredit) ? Number(ai.storeCredit) : null;
        // Only include yards with store credit > 0
        if (!storeCredit || storeCredit <= 0) return null;
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
          storeCreditUsedFor: ai.storeCreditUsedFor || [],
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
  const navigate = useNavigate();
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [totalLabel, setTotalLabel] = useState("Total Orders: 0 | Store Credit: $0.00");
  
  // Modal states for "Use" functionality
  const [useModalOpen, setUseModalOpen] = useState(false);
  const [useTarget, setUseTarget] = useState(null);
  const [usageType, setUsageType] = useState("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [orderNoUsedFor, setOrderNoUsedFor] = useState("");
  const [useError, setUseError] = useState("");
  const [useLoading, setUseLoading] = useState(false);

  // Modal state for "Used For" functionality
  const [usedForModalOpen, setUsedForModalOpen] = useState(false);
  const [usedForList, setUsedForList] = useState([]);

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

        case "actions":
          return (
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/order-details?orderNo=${encodeURIComponent(row.orderNo)}`);
                }}
                className="px-3 py-1 text-xs rounded bg-[#2c5d81] hover:bg-blue-700 text-white"
              >
                View
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setUseTarget(row);
                  setUsageType("full");
                  setPartialAmount("");
                  setOrderNoUsedFor("");
                  setUseError("");
                  setUseModalOpen(true);
                }}
                className="px-3 py-1 text-xs rounded bg-[#3d7ba8] hover:bg-[#4a8bb8] text-white"
              >
                Use
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const order = row;
                  let list = [];
                  if (order && Array.isArray(order.yardDetails)) {
                    list = order.yardDetails
                      .flatMap((y) => y?.storeCreditUsedFor || [])
                      .map((x, i) => ({
                        idx: i + 1,
                        orderNo: x.orderNo,
                        amount: Number(x.amount) || 0,
                      }));
                  }
                  setUsedForList(list);
                  setUsedForModalOpen(true);
                }}
                className="px-3 py-1 text-xs rounded bg-[#5fa33a] hover:bg-[#6fb34a] text-white"
              >
                Used For
              </button>
            </div>
          );

        default:
          return row[key] ?? "—";
      }
    },
    [expandedIds, navigate]
  );

  // Always return empty params - no date filtering
  const paramsBuilder = useCallback(() => {
    return {};
  }, []);

  // Fetch from storeCredits endpoint - no date filtering
  const fetchOverride = useCallback(async ({ filter, query, sortBy, sortOrder, selectedAgent, userRole, firstName }) => {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const merged = await fetchAllStoreCredits(headers);
    return merged;
  }, []);

  const onRowsChange = useCallback((rows) => {
    const totalCredit = rows.reduce((s, o) => s + (parseFloat(o.storeCredit) || 0), 0);
    setTotalLabel(`Total Orders: ${rows.length} | Store Credit: $${totalCredit.toFixed(2)}`);
  }, []);

  // Handle "Use" submission
  const handleUseSubmit = async () => {
    if (!useTarget) return;
    
    const totalAvail = useTarget.storeCredit || 0;
    const amt = usageType === "partial" ? Number(partialAmount) : totalAvail;

    if (usageType === "partial") {
      if (!Number.isFinite(amt) || amt <= 0) {
        setUseError("Enter a valid partial amount > 0");
        return;
      }
      if (amt > totalAvail) {
        setUseError(`Amount cannot exceed available $${totalAvail.toFixed(2)}`);
        return;
      }
    }
    if (!orderNoUsedFor || !orderNoUsedFor.trim()) {
      setUseError("Please enter the Order No. the credit is used for");
      return;
    }

    try {
      setUseLoading(true);
      setUseError("");
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      
      await API.patch(
        `/orders/${encodeURIComponent(useTarget.orderNo)}/storeCredits`,
        {
          usageType,
          amountUsed: amt,
          orderNoUsedFor: orderNoUsedFor.trim(),
        },
        { headers }
      );
      
      setUseModalOpen(false);
      // Reload data by triggering a refresh
      window.location.reload();
    } catch (e) {
      console.error(e);
      setUseError("Failed to update store credit. Try again.");
    } finally {
      setUseLoading(false);
    }
  };

  return (
    <>
      <OrdersTable
        title="Store Credits"
        endpoint="/orders/storeCredits"
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
        hideDefaultActions={true}
      />

      {/* Use Modal */}
      {useModalOpen && useTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !useLoading && setUseModalOpen(false)}
          />
          <div className="relative bg-[#0f1b2a] border border-white/15 text-white rounded-2xl shadow-xl w-[min(600px,94vw)] p-5">
            <h3 className="text-lg font-semibold mb-3">Use Store Credit</h3>
            <p className="text-sm mb-2 text-white/80">
              Order <strong>{useTarget.orderNo}</strong> has{" "}
              <strong>${useTarget.storeCredit.toFixed(2)}</strong> available.
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="usageType"
                    value="full"
                    checked={usageType === "full"}
                    onChange={() => {
                      setUsageType("full");
                      setPartialAmount("");
                    }}
                    className="text-blue-500"
                  />
                  Full amount
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="usageType"
                    value="partial"
                    checked={usageType === "partial"}
                    onChange={() => setUsageType("partial")}
                    className="text-blue-500"
                  />
                  Partial amount
                </label>
              </div>

              {usageType === "partial" && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">Amount ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="border border-white/20 rounded px-2 py-1 bg-white/10 text-white"
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-sm">Used for Order No.</span>
                <input
                  type="text"
                  className="border border-white/20 rounded px-2 py-1 flex-1 bg-white/10 text-white"
                  placeholder="Enter target order number"
                  value={orderNoUsedFor}
                  onChange={(e) => setOrderNoUsedFor(e.target.value)}
                />
              </div>

              {useError && (
                <div className="text-red-400 text-sm">{useError}</div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => !useLoading && setUseModalOpen(false)}
                className="px-3 py-1 rounded border border-white/20 hover:bg-white/10"
                disabled={useLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleUseSubmit}
                className="px-3 py-1 rounded bg-[#2c5d81] hover:bg-blue-700 text-white disabled:opacity-50"
                disabled={useLoading}
              >
                {useLoading ? "Saving…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Used For Modal */}
      {usedForModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setUsedForModalOpen(false)}
          />
          <div className="relative bg-[#0f1b2a] border border-white/15 text-white rounded-2xl shadow-xl w-[min(600px,94vw)] p-5">
            <h3 className="text-lg font-semibold mb-3">Store Credit Used For</h3>
            <div className="max-h-[400px] overflow-y-auto">
              {usedForList.length > 0 ? (
                <div className="space-y-2">
                  {usedForList.map((item, idx) => (
                    <div key={idx} className="p-2 bg-white/5 rounded border border-white/10">
                      <div><strong>Order No:</strong> {item.orderNo}</div>
                      <div><strong>Amount:</strong> ${item.amount.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/70">No store credits used for this order.</p>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setUsedForModalOpen(false)}
                className="px-3 py-1 rounded bg-[#2c5d81] hover:bg-blue-700 text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
