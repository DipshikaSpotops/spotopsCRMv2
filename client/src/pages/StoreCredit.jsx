// src/pages/StoreCredits.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import { formatInTimeZone } from "date-fns-tz";
import { useNavigate } from "react-router-dom";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";
import { getCurrentUserFirstName } from "../utils/authStorage";
import {
  yardStoreCreditBaseKey,
  yardStoreCreditMatchKey,
} from "@spotops/shared/utils/yardName.js";

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
async function fetchStoreCreditsPage(params, headers) {
  const response = await API.get(`/orders/storeCredits`, { params, headers });
  const allOrders = Array.isArray(response.data?.orders) ? response.data.orders : [];

  // Filter and transform orders
  const filtered = [];

  allOrders.forEach((order) => {
    const addl = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];
    // Only include yards that have a store credit value > 0
    const yardsWithCredit = addl
      .map((ai, idx) => {
        const storeCredit = hasNumeric(ai.storeCredit)
          ? Number(ai.storeCredit)
          : null;
        // Only include yards with store credit > 0
        if (!storeCredit || storeCredit <= 0) return null;

        // Sum how much store credit from this yard has been used
        const usedFromYard = Array.isArray(ai.storeCreditUsedFor)
          ? ai.storeCreditUsedFor.reduce(
              (sum, entry) => sum + (Number(entry.amount) || 0),
              0
            )
          : 0;

        const partPrice = parseFloat(ai.partPrice || 0) || 0;
        const others = parseFloat(ai.others || 0) || 0;
        let yardShipping = 0;
        const details = ai.shippingDetails || "";
        if (/yard\s*shipping/i.test(details))
          yardShipping = parseAmountAfterColon(details);
        return {
          idx: idx + 1,
          yardIndex: idx,
          yardName: ai.yardName || `Yard ${idx + 1}`,
          city: ai.city || "",
          state: ai.state || "",
          storeCredit,
          usedAmount: usedFromYard,
          partPrice,
          others,
          yardShipping,
          status: ai.status || "",
          expShipDate: ai.expShipDate || "",
          expediteShipping:
            ai.expediteShipping === true || ai.expediteShipping === "true",
          storeCreditUsedFor: ai.storeCreditUsedFor || [],
        };
      })
      .filter(Boolean);

    if (yardsWithCredit.length === 0) return;

    const totalStoreCredit = yardsWithCredit.reduce(
      (s, y) => s + y.storeCredit,
      0
    );
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

  return { rows: filtered, meta: response.data || {} };
}

/* ---------- Extra totals for modal ---------- */
const extraTotals = (rows) => {
  const totalCredit = rows.reduce(
    (s, o) => s + (parseFloat(o.storeCredit) || 0),
    0
  );
  const totalCharged = rows.reduce(
    (s, o) => s + (parseFloat(o.chargedAmount) || 0),
    0
  );
  return [
    { name: "Total Orders (with Store Credit)", value: rows.length },
    { name: "Total Store Credit", value: `$${totalCredit.toFixed(2)}` },
    { name: "Total Charged Amount", value: `$${totalCharged.toFixed(2)}` },
  ];
};

/* ---------- Page ---------- */
export default function StoreCredits() {
  const brand = useBrand(); // 50STARS / PROLANE
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
  const [targetYardOptions, setTargetYardOptions] = useState([]);
  const [selectedTargetYardIndex, setSelectedTargetYardIndex] = useState(null);
  const [targetYardLookupStatus, setTargetYardLookupStatus] = useState("idle"); // idle|loading|ready|error
  const [targetYardLookupMessage, setTargetYardLookupMessage] = useState("");

  const sourceCreditKeys = useMemo(() => {
    const keys = new Set();
    for (const y of useTarget?.yardDetails || []) {
      const base = yardStoreCreditBaseKey(y.yardName, y.city, y.state);
      const full = yardStoreCreditMatchKey(y.yardName, y.city, y.state);
      if (base) keys.add(base);
      if (full) keys.add(full);
    }
    return keys;
  }, [useTarget]);

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
                      <div><b>Payment status:</b> {y?.pamentStatus || y?.paymentStatus || ""}</div>
                      <div><b>Store Credit:</b> ${y.storeCredit.toFixed(2)}</div>
                      {Number(y.usedAmount || 0) > 0 && (
                        <div><b>Used Amount:</b> ${Number(y.usedAmount || 0).toFixed(2)}</div>
                      )}
                      <div>
                        <b>Part:</b> ${y.partPrice.toFixed(2)} | <b>Others:</b> ${y.others.toFixed(2)} |{" "}
                        <b>Yard Shipping:</b> ${y.yardShipping.toFixed(2)}
                      </div>
                      <div><b>Status:</b> {y.status || "N/A"}</div>
                      <div><b>Expected Ship Date:</b> {y.expShipDate || "N/A"}</div>
                      <div>
                        <b>Expedite:</b>{" "}
                        {(y?.yardExpedite === true ||
                          y?.yardExpedite === "true" ||
                          y?.expediteShipping === true ||
                          y?.expediteShipping === "true")
                          ? "Yes"
                          : "No"}
                      </div>
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
                  setTargetYardOptions([]);
                  setSelectedTargetYardIndex(null);
                  setTargetYardLookupStatus("idle");
                  setTargetYardLookupMessage("");
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
                        targetYardIndex:
                          x?.targetYardIndex !== undefined &&
                          x?.targetYardIndex !== null
                            ? Number(x.targetYardIndex)
                            : null,
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
  const fetchOverride = useCallback(
    async ({ filter, query, sortBy, sortOrder, selectedAgent, userRole, firstName, page, limit }) => {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const params = {
        page,
        limit,
        q: query || undefined,
        searchTerm: query || undefined,
      };
      if (
        (userRole || "").toLowerCase() === "admin" &&
        selectedAgent &&
        selectedAgent !== "Select" &&
        selectedAgent !== "All"
      ) {
        params.salesAgent = selectedAgent;
      }
      const { rows, meta } = await fetchStoreCreditsPage(params, headers);
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
    [brand]
  );

  const onRowsChange = useCallback((rows) => {
    const totalCredit = rows.reduce((s, o) => s + (parseFloat(o.storeCredit) || 0), 0);
    setTotalLabel(`Total Orders: ${rows.length} | Store Credit: $${totalCredit.toFixed(2)}`);
  }, []);

  // Lookup matching yards on the consuming order when order no is typed
  useEffect(() => {
    if (!useModalOpen || !useTarget) return;

    const targetNo = String(orderNoUsedFor || "").trim();
    if (!targetNo) {
      setTargetYardOptions([]);
      setSelectedTargetYardIndex(null);
      setTargetYardLookupStatus("idle");
      setTargetYardLookupMessage("");
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setTargetYardLookupStatus("loading");
      setTargetYardLookupMessage("");
      try {
        const { data } = await API.get(
          `/orders/${encodeURIComponent(targetNo)}`
        );
        if (cancelled) return;

        const yards = Array.isArray(data?.additionalInfo)
          ? data.additionalInfo
          : [];
        if (!yards.length) {
          setTargetYardOptions([]);
          setSelectedTargetYardIndex(null);
          setTargetYardLookupStatus("error");
          setTargetYardLookupMessage(
            `Order ${targetNo} was found but has no yards.`
          );
          return;
        }

        const matches = yards
          .map((ai, index) => ({
            index,
            yardName: ai.yardName || `Yard ${index + 1}`,
            city: ai.city || "",
            state: ai.state || "",
            status: ai.status || "",
            baseKey: yardStoreCreditBaseKey(ai.yardName, ai.city, ai.state),
            matchKey: yardStoreCreditMatchKey(ai.yardName, ai.city, ai.state),
          }))
          .filter(
            (y) =>
              (y.baseKey && sourceCreditKeys.has(y.baseKey)) ||
              (y.matchKey && sourceCreditKeys.has(y.matchKey))
          );

        if (!matches.length) {
          setTargetYardOptions([]);
          setSelectedTargetYardIndex(null);
          setTargetYardLookupStatus("error");
          const sourceNames = (useTarget.yardDetails || [])
            .map((y) => y.yardName)
            .filter(Boolean)
            .join(", ");
          setTargetYardLookupMessage(
            `No yards on ${targetNo} match the store credit yard name(s): ${sourceNames || "—"}.`
          );
          return;
        }

        setTargetYardOptions(matches);
        setSelectedTargetYardIndex(
          matches.length === 1 ? matches[0].index : null
        );
        setTargetYardLookupStatus("ready");
        setTargetYardLookupMessage(
          matches.length === 1
            ? `Matched Yard ${matches[0].index + 1}: ${matches[0].yardName}`
            : `${matches.length} yards share this name — choose which yard gets the credit.`
        );
      } catch (err) {
        if (cancelled) return;
        setTargetYardOptions([]);
        setSelectedTargetYardIndex(null);
        setTargetYardLookupStatus("error");
        setTargetYardLookupMessage(
          err?.response?.status === 404
            ? `Order ${targetNo} was not found.`
            : err?.response?.data?.message ||
                "Could not look up that order. Check the order number."
        );
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [useModalOpen, useTarget, orderNoUsedFor, sourceCreditKeys]);

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
    if (
      selectedTargetYardIndex === null ||
      selectedTargetYardIndex === undefined ||
      !Number.isInteger(Number(selectedTargetYardIndex))
    ) {
      setUseError(
        targetYardOptions.length > 1
          ? "Select which yard on the target order should show this store credit."
          : "Enter a valid target order with a matching yard first."
      );
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
          targetYardIndex: Number(selectedTargetYardIndex),
        },
        {
          headers,
          params: { firstName: getCurrentUserFirstName() },
        }
      );
      
      setUseModalOpen(false);
      // Trigger table refetch instead of full page reload
      if (window.__ordersTableRefs?.storeCredits?.refetch) {
        window.__ordersTableRefs.storeCredits.refetch();
      }
    } catch (e) {
      console.error(e);
      setUseError(
        e?.response?.data?.message || "Failed to update store credit. Try again."
      );
    } finally {
      setUseLoading(false);
    }
  };

  // Realtime: keep store credits list up-to-date when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.storeCredits?.refetch) {
        window.__ordersTableRefs.storeCredits.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.storeCredits?.refetch) {
        window.__ordersTableRefs.storeCredits.refetch();
      }
    },
  });

  // Refetch when brand changes
  useEffect(() => {
    if (window.__ordersTableRefs?.storeCredits?.refetch) {
      window.__ordersTableRefs.storeCredits.refetch();
    }
  }, [brand]);

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
        tableId="storeCredits"
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
                  onChange={(e) => {
                    setOrderNoUsedFor(e.target.value);
                    setSelectedTargetYardIndex(null);
                    setUseError("");
                  }}
                />
              </div>

              {targetYardLookupStatus === "loading" && (
                <div className="text-sm text-white/70">Looking up yards…</div>
              )}
              {targetYardLookupMessage && targetYardLookupStatus !== "loading" && (
                <div
                  className={`text-sm ${
                    targetYardLookupStatus === "error"
                      ? "text-red-400"
                      : "text-emerald-300"
                  }`}
                >
                  {targetYardLookupMessage}
                </div>
              )}

              {targetYardOptions.length > 1 && (
                <div className="space-y-2 rounded border border-white/15 bg-white/5 p-3">
                  <div className="text-sm font-semibold">
                    Choose target yard
                  </div>
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {targetYardOptions.map((yard) => {
                      const loc = [yard.city, yard.state].filter(Boolean).join(", ");
                      return (
                        <label
                          key={yard.index}
                          className="flex cursor-pointer items-start gap-2 rounded border border-white/10 bg-black/20 px-2 py-1.5 text-sm hover:bg-white/10"
                        >
                          <input
                            type="radio"
                            name="targetYardIndex"
                            className="mt-1"
                            checked={selectedTargetYardIndex === yard.index}
                            onChange={() =>
                              setSelectedTargetYardIndex(yard.index)
                            }
                          />
                          <span>
                            <span className="font-semibold">
                              Yard {yard.index + 1}: {yard.yardName}
                            </span>
                            {loc ? (
                              <span className="text-white/70"> — {loc}</span>
                            ) : null}
                            {yard.status ? (
                              <span className="block text-xs text-white/60">
                                Status: {yard.status}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

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
                disabled={
                  useLoading ||
                  targetYardLookupStatus === "loading" ||
                  selectedTargetYardIndex === null
                }
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
                      {item.targetYardIndex !== null &&
                        Number.isFinite(item.targetYardIndex) && (
                          <div>
                            <strong>Target Yard:</strong>{" "}
                            Yard {Number(item.targetYardIndex) + 1}
                          </div>
                        )}
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
