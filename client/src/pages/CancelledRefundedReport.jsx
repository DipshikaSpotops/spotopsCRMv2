// src/pages/CancelledRefundedOrders.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { formatInTimeZone } from "date-fns-tz";
import { FaSort, FaSortUp, FaSortDown, FaEye, FaTimes } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import moment from "moment-timezone";
import useSort from "../hooks/useSort";
import StickyDataPage from "../layouts/StickyDataPage";

const ROWS_PER_PAGE = 25;
const TZ = "America/Chicago";

const LS_PAGE = "cancelledRefundsPage";
const LS_SEARCH = "cancelledRefundsSearch";
const LS_HILITE = "highlightedOrderNo";
const LS_FILTER = "cr_filter_v2";

/* ---------- utils ---------- */
function formatDateSafe(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d)) return "Invalid Date";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}

function extractDateFromHistory(text) {
  const match = text?.match(/on (\d{1,2}) (\w+), (\d{4})/i);
  if (!match) return null;
  const [, day, mon, year] = match;
  const tryDate = new Date(`${day} ${mon} ${year}`);
  return isNaN(tryDate) ? null : tryDate.toISOString();
}

const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const buildDefaultFilter = () => {
  const now = new Date();
  return { month: monthNames[now.getMonth()], year: now.getFullYear() };
};

const prettyFilterLabel = (filter) => {
  if (!filter) return "";
  if (filter.month && filter.year) return `${filter.month} ${filter.year}`;
  if (filter.start && filter.end) {
    const s = moment.tz(filter.start, TZ);
    const e = moment.tz(filter.end, TZ);
    if (s.isSame(s.clone().startOf("month")) && e.isSame(s.clone().endOf("month"))) {
      return s.format("MMM YYYY");
    }
    return `${s.format("D MMM YYYY")} – ${e.format("D MMM YYYY")}`;
  }
  return "";
};

const readFilterFromLS = () => {
  try {
    const raw = localStorage.getItem(LS_FILTER);
    if (!raw) return null;
    const f = JSON.parse(raw);
    if (f && ((f.month && f.year) || (f.start && f.end))) return f;
  } catch {}
  return null;
};

const writeFilterToLS = (filter) => {
  try {
    localStorage.setItem(LS_FILTER, JSON.stringify(filter || {}));
  } catch {}
};
/* -------------------------------- */

const CancelledRefundedOrders = () => {
  const navigate = useNavigate();
  const contentRef = useRef(null);

  /* ---------- state ---------- */
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState("");

  // filters & paging
  const [activeFilter, setActiveFilter] = useState(readFilterFromLS() || buildDefaultFilter());
  const [currentFilter, setCurrentFilter] = useState(readFilterFromLS() || buildDefaultFilter());
  const [page, setPage] = useState(parseInt(localStorage.getItem(LS_PAGE) || "1", 10));

  // sorting
  const { sortBy, sortOrder, handleSort, sortData } = useSort();

  // search
  const [searchInput, setSearchInput] = useState(localStorage.getItem(LS_SEARCH) || "");
  const [appliedQuery, setAppliedQuery] = useState(localStorage.getItem(LS_SEARCH) || "");

  // row state
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [hilite, setHilite] = useState(localStorage.getItem(LS_HILITE) || null);

  // modal
  const [showReasonModal, setShowReasonModal] = useState(false);

  /* ---------- persist ---------- */
  useEffect(() => {
    localStorage.setItem(LS_PAGE, String(page));
  }, [page]);

  useEffect(() => {
    writeFilterToLS(activeFilter);
    setCurrentFilter(activeFilter);
  }, [activeFilter]);

  /* ---------- fetch ---------- */
  useEffect(() => {
    if (!activeFilter) return;

    const fetchData = async () => {
      try {
        if (!hasLoadedOnce) setLoading(true);
        else setIsFetching(true);

        let baseParams = {};
        if (activeFilter.start && activeFilter.end) {
          baseParams = { start: activeFilter.start, end: activeFilter.end };
        } else if (activeFilter.month && activeFilter.year) {
          baseParams = { month: activeFilter.month, year: activeFilter.year };
        } else {
          const def = buildDefaultFilter();
          baseParams = { month: def.month, year: def.year };
        }

        const token = localStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

        const [cancelledRes, refundedRes] = await Promise.all([
          axios.get(`http://localhost:5000/orders/cancelled-by-date`, { params: baseParams, headers }),
          axios.get(`http://localhost:5000/orders/refunded-by-date`, { params: baseParams, headers }),
        ]);

        const cancelled = Array.isArray(cancelledRes.data) ? cancelledRes.data : [];
        const refunded  = Array.isArray(refundedRes.data)  ? refundedRes.data  : [];

        const combined = [...cancelled, ...refunded];
        const byOrderNo = new Map();

        for (const o of combined) {
          const id = o.orderNo || o._id || `${o.email || "unknown"}:${o.cancelledDate || o.custRefundDate || ""}`;
          if (!byOrderNo.has(id)) {
            byOrderNo.set(id, {
              _id: o._id || id,
              orderNo: o.orderNo || id,
              orderDate: o.orderDate ?? null,
              cancelledDate: o.cancelledDate ?? null,
              custRefundDate: o.custRefundDate ?? null,
              custRefAmount: o.custRefAmount ?? 0,
              cancellationReason: o.cancellationReason ?? "",
              customerName: o.customerName ?? (o.fName || o.lName ? `${o.fName || ""} ${o.lName || ""}`.trim() : ""),
              email: o.email || "",
              pReq: o.pReq,
              partName: o.partName,
              desc: o.desc,
              partNo: o.partNo,
              vin: o.vin,
              warranty: o.warranty,
              orderHistory: o.orderHistory || [],
            });
          } else {
            const dst = byOrderNo.get(id);
            dst.orderDate = dst.orderDate || o.orderDate;
            dst.cancelledDate = dst.cancelledDate || o.cancelledDate;
            dst.custRefundDate = dst.custRefundDate || o.custRefundDate;
            dst.custRefAmount = dst.custRefAmount || o.custRefAmount;
            dst.cancellationReason = dst.cancellationReason || o.cancellationReason;
            dst.customerName = dst.customerName || o.customerName;
            dst.email = dst.email || o.email;
            dst.pReq = dst.pReq || o.pReq;
            dst.partName = dst.partName || o.partName;
            dst.desc = dst.desc || o.desc;
            dst.partNo = dst.partNo || o.partNo;
            dst.vin = dst.vin || o.vin;
            dst.warranty = dst.warranty || o.warranty;
            dst.orderHistory = [...(dst.orderHistory || []), ...(o.orderHistory || [])];
          }
        }

        for (const item of byOrderNo.values()) {
          if (!item.cancelledDate && item.orderHistory?.length) {
            const h = item.orderHistory.find((e) =>
              /order status updated to order cancelled|order cancelled/i.test(e)
            );
            const iso = extractDateFromHistory(h);
            if (iso) item.cancelledDate = iso;
          }
          if (!item.custRefundDate && item.orderHistory?.length) {
            const h = item.orderHistory.find((e) => /refunded/i.test(e));
            const iso = extractDateFromHistory(h);
            if (iso) item.custRefundDate = iso;
          }
        }

        setOrders(Array.from(byOrderNo.values()));
        setPage(1);
      } catch (err) {
        console.error(err);
        setError("Failed to load cancellations & refunds.");
      } finally {
        setLoading(false);
        setIsFetching(false);
        setHasLoadedOnce(true);
      }
    };

    fetchData();
  }, [activeFilter]);

  /* ---------- derived ---------- */
  const filtered = useMemo(() => {
    const q = appliedQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const part = (o.pReq || o.partName || "").toLowerCase();
      return (
        (String(o.orderNo) || "").toLowerCase().includes(q) ||
        (o.customerName || "").toLowerCase().includes(q) ||
        (o.cancellationReason || "").toLowerCase().includes(q) ||
        (o.email || "").toLowerCase().includes(q) ||
        part.includes(q) ||
        formatDateSafe(o.orderDate).toLowerCase().includes(q) ||
        formatDateSafe(o.cancelledDate).toLowerCase().includes(q) ||
        formatDateSafe(o.custRefundDate).toLowerCase().includes(q)
      );
    });
  }, [orders, appliedQuery]);

  const totalRefundedAmount = useMemo(
    () => filtered.filter((o) => !!o.custRefundDate)
                  .reduce((s, o) => s + (parseFloat(o.custRefAmount) || 0), 0),
    [filtered]
  );

  const reasonStats = useMemo(() => {
    const map = new Map();
    filtered.forEach((o) => {
      const r = o.cancellationReason || "";
      if (!map.has(r)) map.set(r, { count: 0, amount: 0 });
      const v = map.get(r);
      v.count += 1;
      if (o.custRefundDate) v.amount += parseFloat(o.custRefAmount) || 0;
    });
    return Array.from(map.entries()).map(([reason, v]) => ({
      reason,
      count: v.count,
      amount: Number(v.amount.toFixed(2)),
    }));
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const paged = useMemo(() => {
    const sorted = sortData(filtered);
    const start = (page - 1) * ROWS_PER_PAGE;
    return sorted.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, page, sortData]);

  /* ---------- highlight ---------- */
  useEffect(() => {
    if (!hilite || !orders?.length) return;
    const match = orders.find((o) => String(o.orderNo) === String(hilite));
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`row-cancelref-${match.orderNo}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [orders, hilite]);

  useEffect(() => {
    const hasQuery = appliedQuery.trim().length > 0;
    setExpandedIds(hasQuery ? new Set(orders.map((o) => String(o.orderNo))) : new Set());
  }, [orders, appliedQuery]);

  /* ---------- helpers ---------- */
  const toggleRowExpansion = (orderNo) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const key = String(orderNo);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleHighlight = (orderNo) => {
    setHilite((prev) => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      localStorage.setItem(LS_HILITE, next || "");
      return next;
    });
  };

  /* ---------- header controls ---------- */
  const rightControls = (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = searchInput.trim();
          localStorage.setItem(LS_SEARCH, q);
          setAppliedQuery(q);
          setPage(1);
        }}
        className="relative flex w-full sm:w-auto"
      >
        <input
          value={searchInput}
          onChange={(e) => {
            const v = e.target.value;
            setSearchInput(v);
            if (v.trim() === "" && appliedQuery !== "") {
              setAppliedQuery("");
              localStorage.removeItem(LS_SEARCH);
              setPage(1);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSearchInput("");
              setAppliedQuery("");
              localStorage.removeItem(LS_SEARCH);
              setPage(1);
            }
          }}
          placeholder="Search…(press Enter)"
          className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 min-w-[260px]"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setAppliedQuery("");
              localStorage.removeItem(LS_SEARCH);
              setPage(1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
          >
            <FaTimes />
          </button>
        )}
      </form>

      <UnifiedDatePicker
        key={JSON.stringify(currentFilter)}
        value={currentFilter}
        onFilterChange={(filter) => {
          const next = filter && Object.keys(filter).length ? filter : buildDefaultFilter();
          setActiveFilter(next);
          setCurrentFilter(next);
          setPage(1);
        }}
      />

      <button
        onClick={() => setShowReasonModal(true)}
        className="px-3 py-2 rounded bg-[#2c5d81] hover:bg-blue-700 text-white flex items-center gap-2"
        title="View reason summary"
      >
        <FaEye />
      </button>
    </>
  );

  /* ---------- render ---------- */
  if (loading) return <div className="p-6 text-center text-white">⏳ Loading Orders…</div>;
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  return (
    <StickyDataPage
      title="Cancellations/Refunds"
      totalLabel={`Total Orders: ${filtered.length} | Refunded: $${totalRefundedAmount.toFixed(2)}`}
      badge={currentFilter && (
        <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
          {prettyFilterLabel(currentFilter)}
        </span>
      )}
      page={page}
      totalPages={totalPages}
      onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
      onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
      rightControls={rightControls}
      ref={contentRef}
    >
      <table className="table-fixed min-w-[1100px] w-full bg-black/20 backdrop-blur-md text-white">
        <thead className="sticky top-0 bg-[#5c8bc1] z-20">
          <tr>
            {[
              { key: "orderNo", label: "Order No" },
              { key: "orderDate", label: "Order Date" },
              { key: "cancelledDate", label: "Cancelled Date" },
              { key: "custRefundDate", label: "Refunded Date" },
              { key: "cancellationReason", label: "Cancellation Reason" },
              { key: "custRefAmount", label: "Refund Amount" },
            ].map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-4 py-3 text-center text-tHead border-r border-white/30 whitespace-nowrap cursor-pointer"
              >
                <div className="flex items-center justify-center gap-1">
                  {col.label}
                  {sortBy === col.key ? (
                    sortOrder === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />
                  ) : (
                    <FaSort className="opacity-70 text-xs" />
                  )}
                </div>
              </th>
            ))}
            <th className="px-4 py-3 text-center text-tHead">Action</th>
          </tr>
        </thead>

        <tbody>
          {paged.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-6 text-center text-white/80">No orders found.</td>
            </tr>
          ) : (
            paged.map((o, i) => {
              const isExpanded = expandedIds.has(String(o.orderNo));
              const isHi = hilite === String(o.orderNo);
              return (
                <tr
                  key={o.orderNo}
                  id={`row-cancelref-${o.orderNo}`}
                  onClick={() => toggleHighlight(o.orderNo)}
                  className={`transition text-sm cursor-pointer ${
                    isHi
                      ? "bg-yellow-500/20 ring-2 ring-yellow-400"
                      : i % 2 === 0
                        ? "bg-white/10"
                        : "bg-white/5"
                  } hover:bg-white/20`}
                >
                  <td className="px-4 py-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                    <div className="flex justify-between items-center gap-x-2">
                      <span>{o.orderNo}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRowExpansion(o.orderNo);
                        }}
                        className="text-blue-400 text-xs underline hover:text-blue-300"
                      >
                        {isExpanded ? "Hide Details" : "Show Details"}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 border-r border-white/20 whitespace-nowrap">{formatDateSafe(o.orderDate)}</td>
                  <td className="px-4 py-2.5 border-r border-white/20 whitespace-nowrap">{formatDateSafe(o.cancelledDate)}</td>
                  <td className="px-4 py-2.5 border-r border-white/20 whitespace-nowrap">{formatDateSafe(o.custRefundDate)}</td>
                  <td className="px-4 py-2.5 border-r border-white/20">
                    {o.cancellationReason || "—"}
                    {isExpanded && (
                      <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                        <div><b>Customer:</b> {o.customerName || "—"}</div>
                        <div><b>Email:</b> {o.email || "—"}</div>
                        <div><b>Part:</b> {o.pReq || o.partName || "—"}</div>
                        {o.desc && <div><b>Desc:</b> {o.desc}</div>}
                        {o.partNo && <div><b>Part No:</b> {o.partNo}</div>}
                        {o.vin && <div><b>VIN:</b> {o.vin}</div>}
                        {o.warranty && <div><b>Warranty:</b> {o.warranty} days</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 border-r border-white/20 whitespace-nowrap">
                    ${Number(o.custRefAmount || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        localStorage.setItem(LS_HILITE, String(o.orderNo));
                        localStorage.setItem(LS_PAGE, String(page));
                        setHilite(String(o.orderNo));
                        navigate(`/order-details?orderNo=${encodeURIComponent(o.orderNo)}`);
                      }}
                      className="px-3 py-1 text-xs rounded bg-[#2c5d81] hover:bg-blue-700 text-white"
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {isFetching && <div className="p-2 text-center text-xs text-white/70">Updating…</div>}

      {/* reason summary modal */}
      {showReasonModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white text-[#04356d] rounded-lg shadow-lg w-full max-w-3xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-[#5c8bc1] text-white">
              <h3 className="text-lg font-semibold">Cancellation Summary</h3>
              <button
                className="p-2 hover:bg-white/20 rounded"
                onClick={() => setShowReasonModal(false)}
              >
                <FaTimes />
              </button>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2 text-center">Cancellation Reason</th>
                    <th className="p-2 text-center">Number of Orders</th>
                    <th className="p-2 text-center">Total Refunded Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {reasonStats.length === 0 ? (
                    <tr>
                      <td className="p-3" colSpan={3}>No data.</td>
                    </tr>
                  ) : (
                    reasonStats.map((r) => (
                      <tr key={r.reason} className="border-b last:border-0 text-center">
                        <td className="p-2">{r.reason || "—"}</td>
                        <td className="p-2">{r.count}</td>
                        <td className="p-2">${r.amount.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </StickyDataPage>
  );
};

export default CancelledRefundedOrders;
