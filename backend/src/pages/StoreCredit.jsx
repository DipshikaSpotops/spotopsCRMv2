// src/pages/StoreCredits.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import { formatInTimeZone } from "date-fns-tz";
import { useNavigate, useLocation } from "react-router-dom";
import SearchBar from "../components/SearchBar";
import { baseHeadClass, baseCellClass } from "../utils/tableStyles";
import {
  FaSort,
  FaSortUp,
  FaSortDown,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";

/* ---------- constants ---------- */
const TZ = "America/Chicago";
const ROWS_PER_PAGE = 25;

// LocalStorage keys (match behavior on other pages)
const LS_PAGE = "storeCredits_page";
const LS_HILITE = "storeCredits_highlightedOrderNo";

/* ---------- helpers ---------- */
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}
function parseMoney(n) {
  const x = Number.parseFloat(n);
  return Number.isFinite(x) ? x : 0;
}
function parseYardShipping(details) {
  if (!details || typeof details !== "string") return 0;
  if (!/yard\s*shipping/i.test(details)) return 0;
  const parts = details.split(":");
  if (parts.length < 2) return 0;
  return parseMoney(parts[1].trim());
}
function hasNumeric(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value));
}

/* ---------- row projector ---------- */
function computeRow(order) {
  const addl = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];

  // keep only yards that have a numeric storeCredit
  const yardsWithCredit = addl
    .map((ai, idx) => ({
      idx: idx + 1,
      yardName: ai.yardName || `Yard ${idx + 1}`,
      storeCredit: hasNumeric(ai.storeCredit) ? Number(ai.storeCredit) : null,
      partPrice: parseMoney(ai.partPrice),
      others: parseMoney(ai.others),
      yardShipping: parseYardShipping(ai.shippingDetails),
      // extra fields to show when expanded
      status: ai.status || "",
      expShipDate: ai.expShipDate || "",
      expediteShipping:
        ai.expediteShipping === true || ai.expediteShipping === "true",
    }))
    .filter((y) => hasNumeric(y.storeCredit));

  if (yardsWithCredit.length === 0) return null;

  const totalStoreCredit = yardsWithCredit.reduce(
    (s, y) => s + (y.storeCredit || 0),
    0
  );

  // charged = partPrice + yardShipping + others (per yard with credit)
  const chargedBreakdown = yardsWithCredit.map((y) => ({
    label: `From ${y.yardName}`,
    amount: y.partPrice + y.yardShipping + y.others,
  }));
  const totalCharged = chargedBreakdown.reduce((s, c) => s + c.amount, 0);

  return {
    _id: order._id || order.orderNo, // for scrolling target
    orderNo: order.orderNo,
    orderDate: order.orderDate,
    salesAgent: order.salesAgent || "",
    customerName:
      order.fName && order.lName
        ? `${order.fName} ${order.lName}`
        : order.customerName || "",
    yards: yardsWithCredit,
    totalStoreCredit,
    chargedBreakdown,
    totalCharged,
  };
}

const SortIcon = ({ active, dir }) =>
  active ? (
    dir === "asc" ? (
      <FaSortUp className="text-xs" />
    ) : (
      <FaSortDown className="text-xs" />
    )
  ) : (
    <FaSort className="text-xs text-white/60" />
  );

/* ---------- component ---------- */
const StoreCredits = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);

  // remember page from URL or LS
  const getInitialPage = () => {
    const sp = new URLSearchParams(location.search);
    const fromUrl = parseInt(sp.get("page") || "", 10);
    if (!Number.isNaN(fromUrl) && fromUrl > 0) return fromUrl;
    const fromLS = parseInt(localStorage.getItem(LS_PAGE) || "1", 10);
    return Number.isNaN(fromLS) ? 1 : fromLS;
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [rawByOrderNo, setRawByOrderNo] = useState({});

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("orderDate");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(getInitialPage());

  const [grandTotalStoreCredit, setGrandTotalStoreCredit] = useState(0);
  const [grandTotalCharged, setGrandTotalCharged] = useState(0);

  // expand/collapse inside yard list per order
  const [expandedRow, setExpandedRow] = useState(null);
  const toggleRowExpansion = (orderNo) =>
    setExpandedRow((prev) => (prev === orderNo ? null : orderNo));

  // highlight / de-highlight support
  const [hilite, setHilite] = useState(localStorage.getItem(LS_HILITE) || null);
  const toggleHighlight = (orderNo) => {
    setHilite((prev) => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      if (next) localStorage.setItem(LS_HILITE, next);
      else localStorage.removeItem(LS_HILITE);
      return next;
    });
  };

  // Use modal
  const [useOpen, setUseOpen] = useState(false);
  const [useTarget, setUseTarget] = useState(null);
  const [usageType, setUsageType] = useState("full"); // full | partial
  const [partialAmount, setPartialAmount] = useState("");
  const [orderNoUsedFor, setOrderNoUsedFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");

  // Used For modal
  const [usedForOpen, setUsedForOpen] = useState(false);
  const [usedForList, setUsedForList] = useState([]);

  const userId =
    typeof window !== "undefined" ? localStorage.getItem("userId") : null;

  const ensureToken = async () => {
    let t =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!t && userId) {
      try {
        const res = await API.get(`/auth/token/${userId}`);
        if (res.status === 200 && res.data?.token) {
          localStorage.setItem("token", res.data.token);
          t = res.data.token;
        }
      } catch (e) {
        console.error("Token fetch failed", e);
      }
    }
    return t;
  };

  const fetchAllStoreCredits = async () => {
    const t = await ensureToken();
    const headers = t ? { Authorization: `Bearer ${t}` } : {};
    const res = await API.get(`/orders/storeCredits`, { headers });
    return Array.isArray(res.data) ? res.data : [];
  };

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const raw = await fetchAllStoreCredits();

      const map = {};
      raw.forEach((o) => {
        if (o?.orderNo) map[o.orderNo] = o;
      });
      setRawByOrderNo(map);

      const projected = raw.map(computeRow).filter(Boolean);
      setRows(projected);

      setGrandTotalStoreCredit(
        projected.reduce((s, r) => s + r.totalStoreCredit, 0)
      );
      setGrandTotalCharged(projected.reduce((s, r) => s + r.totalCharged, 0));
    } catch (err) {
      console.error("Failed to load store credits:", err);
      setRows([]);
      setGrandTotalStoreCredit(0);
      setGrandTotalCharged(0);
      setError("Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  // keep ?page= in URL + LS sync
  useEffect(() => {
    localStorage.setItem(LS_PAGE, String(page));
    const sp = new URLSearchParams(location.search);
    sp.set("page", String(page));
    navigate({ search: `?${sp.toString()}` }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // auto-scroll to highlighted row on render/page change
  useEffect(() => {
    if (!hilite || rows.length === 0) return;
    const match = rows.find((r) => String(r.orderNo) === String(hilite));
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`sc-row-${match._id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [rows, hilite, page]);

  const handleSort = (key) => {
    if (sortBy === key) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const basic = [r.orderNo, r.salesAgent, r.customerName, formatDate(r.orderDate)]
        .join(" ")
        .toLowerCase()
        .includes(q);
      const yards = r.yards?.some((y) =>
        `${y.yardName}`.toLowerCase().includes(q)
      );
      return basic || yards;
    });
  }, [rows, search]);

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const getVal = (r) => {
      switch (sortBy) {
        case "orderNo":
          return (r.orderNo || "").toString().toLowerCase();
        case "orderDate": {
          const t = new Date(r.orderDate || 0).getTime();
          return Number.isFinite(t) ? t : 0;
        }
        case "storeCredit":
          return r.totalStoreCredit || 0;
        case "charged":
          return r.totalCharged || 0;
        default:
          return "";
      }
    };
    return [...filtered].sort((a, b) => {
      const A = getVal(a),
        B = getVal(b);
      if (typeof A === "number" && typeof B === "number")
        return sortOrder === "asc" ? A - B : B - A;
      return sortOrder === "asc"
        ? String(A).localeCompare(String(B))
        : String(B).localeCompare(String(A));
    });
  }, [filtered, sortBy, sortOrder]);

  // pagination
  const totalRows = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows = sorted.slice(start, start + ROWS_PER_PAGE);

  // Use -> open modal
  const onClickUse = (r) => {
    setUseTarget(r);
    setUsageType("full");
    setPartialAmount("");
    setOrderNoUsedFor("");
    setApiError("");
    setUseOpen(true);
  };

  // Used For -> open modal + list
  const onClickUsedFor = (orderNo) => {
    const raw = rawByOrderNo[orderNo];
    let list = [];
    if (raw && Array.isArray(raw.additionalInfo)) {
      list = raw.additionalInfo
        .flatMap((info) => info?.storeCreditUsedFor || [])
        .map((x, i) => ({
          idx: i + 1,
          orderNo: x.orderNo,
          amount: Number(x.amount) || 0,
        }));
    }
    setUsedForList(list);
    setUsedForOpen(true);
  };

  const submitUse = async () => {
    if (!useTarget) return;
    const t = await ensureToken();
    const headers = t ? { Authorization: `Bearer ${t}` } : {};

    const totalAvail = useTarget.totalStoreCredit || 0;
    const amt = usageType === "partial" ? Number(partialAmount) : totalAvail;

    if (usageType === "partial") {
      if (!Number.isFinite(amt) || amt <= 0) {
        setApiError("Enter a valid partial amount > 0");
        return;
      }
      if (amt > totalAvail) {
        setApiError(
          `Amount cannot exceed available $${totalAvail.toFixed(2)}`
        );
        return;
      }
    }
    if (!orderNoUsedFor || !orderNoUsedFor.trim()) {
      setApiError("Please enter the Order No. the credit is used for");
      return;
    }

    try {
      setBusy(true);
      setApiError("");
      await API.patch(
        `/orders/${encodeURIComponent(useTarget.orderNo)}/storeCredits`,
        { usageType, amountUsed: amt, orderNoUsedFor: orderNoUsedFor.trim() },
        { headers }
      );
      setUseOpen(false);
      await load(); // refresh table after success
    } catch (e) {
      console.error(e);
      setApiError("Failed to update store credit. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-white">⏳ Loading…</div>;
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  return (
    <div className="min-h-screen p-6" ref={contentRef}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="text-3xl font-bold text-white underline decoration-1">
            Store Credits
          </h2>

          {/* Totals + Pagination in one row */}
          <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-4">
            <p className="text-sm text-white/70">
              Rows: <strong>{totalRows}</strong> | Total Charged:{" "}
              <strong>${grandTotalCharged.toFixed(2)}</strong> | Total Store
              Credit: <strong>${grandTotalStoreCredit.toFixed(2)}</strong>
            </p>

            {/* Pagination */}
            <div className="flex items-center gap-2 text-white font-medium">
              {/* Prev */}
              <button
                disabled={safePage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={`px-3 py-1 rounded-full transition ${safePage === 1
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-gray-700 hover:bg-gray-600"
                  }`}
              >
                <FaChevronLeft size={14} />
              </button>

              {/* Page text */}
              <span className="px-4 py-1 bg-gray-800 rounded-full text-sm shadow">
                Page <strong>{safePage}</strong> of {totalPages}
              </span>

              {/* Next */}
              <button
                disabled={safePage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={`px-3 py-1 rounded-full transition ${safePage === totalPages
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-gray-700 hover:bg-gray-600"
                  }`}
              >
                <FaChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Search (date picker omitted per spec) */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            onApply={(q) => {
              setSearch(q.trim());
              setPage(1);
            }}
            onClear={() => {
              setSearch("");
              setPage(1);
            }}
            placeholder="Search… (press Enter)"
            minWidth="min-w-[260px]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <div className="max-h-[77vh] overflow-y-auto scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
          <table className="min-w-[1100px] w-full bg-black/20 backdrop-blur-md text-white border-separate border-spacing-0">
            <thead className="sticky top-0 bg-[#5c8bc1] z-[60]">
              <tr>
                <th
                  onClick={() => handleSort("orderNo")}
                  className={`${baseHeadClass} sticky left-0 top-0 z-[70]`}
                >
                  <div className="flex items-center justify-center gap-1">
                    Order No{" "}
                    <SortIcon active={sortBy === "orderNo"} dir={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("orderDate")}
                  className={baseHeadClass}
                >
                  <div className="flex items-center justify-center gap-1">
                    Order Date{" "}
                    <SortIcon active={sortBy === "orderDate"} dir={sortOrder} />
                  </div>
                </th>

                <th className={baseHeadClass}>
                  <div className="flex items-center justify-center">
                    Yards (with Store Credit)
                  </div>
                </th>

                <th
                  onClick={() => handleSort("charged")}
                  className={baseHeadClass}
                >
                  <div className="flex items-center justify-center gap-1">
                    Charged Amount ($){" "}
                    <SortIcon active={sortBy === "charged"} dir={sortOrder} />
                  </div>
                </th>

                <th
                  onClick={() => handleSort("storeCredit")}
                  className={baseHeadClass}
                >
                  <div className="flex items-center justify-center gap-1">
                    Store Credit ($){" "}
                    <SortIcon
                      active={sortBy === "storeCredit"}
                      dir={sortOrder}
                    />
                  </div>
                </th>

                <th className={baseHeadClass}>
                  <div className="flex items-center justify-center">Actions</div>
                </th>
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${baseCellClass} text-center`}>
                    No orders found.
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => {
                  const chargedBreakdownEl = (
                    <div className="text-xs text-white/90">
                      {r.chargedBreakdown.map((c, idx) => (
                        <div key={`${r.orderNo}-charged-${idx}`}>
                          {c.label}: ${c.amount.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  );
                  const creditBreakdownEl = (
                    <div className="text-xs text-white/90">
                      {r.yards.map((y, idx) => (
                        <div key={`${r.orderNo}-cred-${idx}`}>
                          From {y.yardName}: ${y.storeCredit?.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  );

                  const isHi = hilite === String(r.orderNo);

                  return (
                    <tr
                      key={r._id}
                      id={`sc-row-${r._id}`}
                      onClick={() => toggleHighlight(r.orderNo)}
                      className={`transition text-sm cursor-pointer ${isHi
                          ? "bg-yellow-500/20 ring-2 ring-yellow-400"
                          : i % 2 === 0
                            ? "bg-white/10"
                            : "bg-white/5"
                        } hover:bg-white/20`}
                    >
                      {/* Sticky first cell: compose baseCellClass + sticky bg */}
                      <td
                        className={`${baseCellClass} sticky left-0 z-30 bg-[#5c8bc1] text-[#e1ebeb] dark:bg-[#1f2937] dark:text-[#e1ebeb]`}
                      >
                        {r.orderNo}
                      </td>

                      <td className={baseCellClass}>{formatDate(r.orderDate)}</td>

                      {/* Yard Column with Show/Hide Details */}
                      <td className={baseCellClass}>
                        <div className="space-y-3">
                          {r.yards.map((y) => (
                            <div
                              key={`${r.orderNo}-yard-${y.idx}`}
                              className="mb-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium whitespace-nowrap">
                                  {y.yardName}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRowExpansion(r.orderNo);
                                  }}
                                  className="text-blue-300 text-xs underline hover:text-blue-200 whitespace-nowrap"
                                >
                                  {expandedRow === r.orderNo
                                    ? "Hide Details"
                                    : "Show Details"}
                                </button>
                              </div>

                              {expandedRow === r.orderNo && (
                                <div className="mt-1 text-xs text-white/90 space-y-0.5">
                                  <div>
                                    <b>Store Credit:</b> $
                                    {y.storeCredit.toFixed(2)}
                                  </div>
                                  <div>
                                    <b>Part price:</b> $
                                    {y.partPrice.toFixed(2)} |{" "}
                                    <b>Yard shipping:</b> $
                                    {y.yardShipping.toFixed(2)} |{" "}
                                    <b>Others:</b> ${y.others.toFixed(2)}
                                  </div>
                                  <div>
                                    <b>Status:</b> {y.status || "N/A"}
                                  </div>
                                  <div>
                                    <b>Expected Shipping Date:</b>{" "}
                                    {y.expShipDate || "N/A"}
                                  </div>
                                  <div>
                                    <b>Expedite Shipping:</b>{" "}
                                    {y.expediteShipping ? "Yes" : "No"}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className={baseCellClass}>
                        ${r.totalCharged.toFixed(2)}
                        <br />
                        <small>{chargedBreakdownEl}</small>
                      </td>

                      <td className={baseCellClass}>
                        ${r.totalStoreCredit.toFixed(2)}
                        <br />
                        <small>{creditBreakdownEl}</small>
                      </td>

                      <td className={`${baseCellClass} whitespace-nowrap`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // remember highlight + page before navigating
                            localStorage.setItem(LS_HILITE, String(r.orderNo));
                            localStorage.setItem(LS_PAGE, String(safePage));
                            setHilite(String(r.orderNo));
                            navigate(
                              `/order-details?orderNo=${encodeURIComponent(
                                r.orderNo
                              )}`
                            );
                          }}
                          className="px-3 py-1 text-xs rounded bg-[#2c5d81] hover:bg-blue-700 text-white mr-2"
                        >
                          View
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onClickUse(r);
                          }}
                          className="px-3 py-1 text-xs rounded bg-[#2c5d81] hover:bg-blue-700 text-white mr-2"
                        >
                          Use
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onClickUsedFor(r.orderNo);
                          }}
                          className="px-3 py-1 text-xs rounded bg-[#2c5d81] hover:bg-blue-700 text-white"
                        >
                          Used For
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Use Modal */}
      {useOpen && useTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !busy && setUseOpen(false)}
          />
          <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(600px,94vw)] p-5">
            <h3 className="text-lg font-semibold mb-3">Use Store Credit</h3>
            <p className="text-sm mb-2">
              Order <strong>{useTarget.orderNo}</strong> has{" "}
              <strong>${useTarget.totalStoreCredit.toFixed(2)}</strong>{" "}
              available.
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="usageType"
                    value="full"
                    checked={usageType === "full"}
                    onChange={() => setUsageType("full")}
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
                    className="border rounded px-2 py-1"
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-sm">Used for Order No.</span>
                <input
                  type="text"
                  className="border rounded px-2 py-1 flex-1"
                  placeholder="Enter target order number"
                  value={orderNoUsedFor}
                  onChange={(e) => setOrderNoUsedFor(e.target.value)}
                />
              </div>

              {apiError && (
                <div className="text-red-600 text-sm">{apiError}</div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => !busy && setUseOpen(false)}
                className="px-3 py-1 rounded border"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={submitUse}
                className="px-3 py-1 rounded bg-[#2c5d81] text-white disabled:opacity-50"
                disabled={busy}
              >
                {busy ? "Saving…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Used For Modal */}
      {usedForOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setUsedForOpen(false)}
          />
          <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(520px,94vw)] p-5">
            <h3 className="text-lg font-semibold mb-3">
              Store Credit Used For
            </h3>
            {usedForList.length === 0 ? (
              <p className="text-sm">No store credits used for this order.</p>
            ) : (
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {usedForList.map((u) => (
                  <li key={`${u.orderNo}-${u.idx}`}>
                    Order No: <strong>{u.orderNo}</strong> — Amount:{" "}
                    <strong>${u.amount.toFixed(2)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 text-right">
              <button
                onClick={() => setUsedForOpen(false)}
                className="px-3 py-1 rounded bg-[#2c5d81] text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreCredits;
