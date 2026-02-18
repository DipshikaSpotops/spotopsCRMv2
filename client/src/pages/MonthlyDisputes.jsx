// src/pages/MonthlyDisputes.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import API from "../api";
import { FaSort, FaSortUp, FaSortDown, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";

import StickyDataPage from "../layouts/StickyDataPage";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import SearchBar from "../components/SearchBar";

import { formatDate, prettyFilterLabel, buildDefaultFilter } from "../utils/dateUtils";
import { buildParams } from "../utils/apiParams";
import { baseHeadClass, baseCellClass } from "../utils/tableStyles";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

const TZ = "America/Chicago";
const ROWS_PER_PAGE = 25;
const DISPUTES_API = "/orders/disputes-by-date";

const LS_PAGE = "disputes_page";
const LS_FILTER = "disputes_filter_v2";
const LS_SORTBY = "disputes_sortBy";
const LS_SORTORDER = "disputes_sortOrder";
const LS_HILITE = "disputes_highlightedOrderNo";
const LS_SEARCH = "disputes_search";

const readFilterFromSearch = (sp) => {
  const start = sp.get("start");
  const end = sp.get("end");
  const month = sp.get("month");
  const year = sp.get("year");
  if (start && end) return { start, end };
  if (month && year) return { month, year: parseInt(year, 10) };
  return null;
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
const writeFilterToSearch = (sp, filter) => {
  ["start", "end", "month", "year"].forEach((k) => sp.delete(k));
  if (filter?.start && filter?.end) {
    sp.set("start", filter.start);
    sp.set("end", filter.end);
  } else if (filter?.month && filter?.year) {
    sp.set("month", filter.month);
    sp.set("year", String(filter.year));
  }
  return sp;
};

const MonthlyDisputes = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);
  const brand = useBrand(); // 50STARS / PROLANE

  const getInitialPage = () => {
    const sp = new URLSearchParams(location.search);
    const fromUrl = parseInt(sp.get("page") || "", 10);
    if (!Number.isNaN(fromUrl) && fromUrl > 0) return fromUrl;
    const fromLS = parseInt(localStorage.getItem(LS_PAGE) || "1", 10);
    return Number.isNaN(fromLS) ? 1 : fromLS;
  };
  const getInitialFilter = () => {
    const sp = new URLSearchParams(location.search);
    return readFilterFromSearch(sp) || readFilterFromLS() || buildDefaultFilter();
  };
  const getInitialSortBy = () => {
    const sp = new URLSearchParams(location.search);
    return sp.get("sortBy") || localStorage.getItem(LS_SORTBY) || null;
  };
  const getInitialSortOrder = () => {
    const sp = new URLSearchParams(location.search);
    return sp.get("sortOrder") || localStorage.getItem(LS_SORTORDER) || "asc";
  };
  const getInitialSearch = () => {
    const sp = new URLSearchParams(location.search);
    const fromUrl = sp.get("q");
    if (fromUrl !== null) return fromUrl;
    return localStorage.getItem(LS_SEARCH) || "";
  };

  const [rawDisputes, setRawDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");

  const [activeFilter, setActiveFilter] = useState(getInitialFilter());
  const [currentFilter, setCurrentFilter] = useState(getInitialFilter());

  const [page, setPage] = useState(getInitialPage());
  const [sortBy, setSortBy] = useState(getInitialSortBy());
  const [sortOrder, setSortOrder] = useState(getInitialSortOrder());

  const [searchInput, setSearchInput] = useState(getInitialSearch());
  const [appliedQuery, setAppliedQuery] = useState(getInitialSearch());

  const [hilite, setHilite] = useState(localStorage.getItem(LS_HILITE) || null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // fetch
  const fetchDisputes = async (filter = {}, { silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      else setIsFetching(true);

      const params = buildParams({ filter, query: appliedQuery || undefined, sortBy, sortOrder });
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await API.get(`${DISPUTES_API}?${params.toString()}`, { headers });

      const data = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.orders)
        ? res.data.orders
        : [];

      const normalized = data.map((o) => ({
        _id: o._id,
        orderNo: o.orderNo,
        orderDate: o.orderDate,
        customerName: o.customerName,
        disputedDate: o.disputedDate,
        disputeReason: o.disputeReason || "-",
        custRefAmount: Number(parseFloat(o.custRefAmount || 0).toFixed(2)),
      }));

      setRawDisputes(normalized);
      setError("");
    } catch (err) {
      console.error("Error loading disputes:", err);
      setError("Failed to load data.");
      setRawDisputes([]);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  };

  // initial / reactive
  useEffect(() => {
    if (!activeFilter) return;
    fetchDisputes(activeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, appliedQuery, sortBy, sortOrder, brand]);

  // Sorting (client-side as well, to keep behavior consistent if server ignores sort)
  const sortedRows = useMemo(() => {
    if (!sortBy) return rawDisputes;

    const val = (row, key) => {
      if (key === "custRefAmount") return row.custRefAmount || 0;
      if (key === "orderDate" || key === "disputedDate") {
        const t = new Date(row[key] || 0).getTime();
        return Number.isNaN(t) ? 0 : t;
      }
      return (row[key] || "").toString().toLowerCase();
    };

    return [...rawDisputes].sort((a, b) => {
      const A = val(a, sortBy);
      const B = val(b, sortBy);
      if (typeof A === "number" && typeof B === "number") {
        return sortOrder === "asc" ? A - B : B - A;
      }
      return sortOrder === "asc"
        ? String(A).localeCompare(String(B))
        : String(B).localeCompare(String(A));
    });
  }, [rawDisputes, sortBy, sortOrder]);

  // Pagination
  const totalDisputes = sortedRows.length;
  const clientTotalPages = Math.max(1, Math.ceil(totalDisputes / ROWS_PER_PAGE));
  const safePage = Math.min(page, clientTotalPages);
  const pageStart = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows = sortedRows.slice(pageStart, pageStart + ROWS_PER_PAGE);

  // sync URL + LS
  useEffect(() => {
    localStorage.setItem(LS_PAGE, String(safePage));
    localStorage.setItem(LS_SORTBY, sortBy || "");
    localStorage.setItem(LS_SORTORDER, sortOrder || "");
    localStorage.setItem(LS_SEARCH, appliedQuery || "");
    writeFilterToLS(activeFilter);

    const sp = new URLSearchParams(location.search);
    sp.set("page", String(safePage));
    writeFilterToSearch(sp, activeFilter);
    if (sortBy) sp.set("sortBy", sortBy);
    else sp.delete("sortBy");
    if (sortOrder) sp.set("sortOrder", sortOrder);
    else sp.delete("sortOrder");
    if (appliedQuery?.trim()) sp.set("q", appliedQuery.trim());
    else sp.delete("q");

    navigate({ search: `?${sp.toString()}` }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, activeFilter, sortBy, sortOrder, appliedQuery]);

  // auto-scroll to highlighted row
  useEffect(() => {
    if (!hilite || !pageRows?.length) return;
    const match = pageRows.find((o) => String(o.orderNo) === String(hilite));
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`disp-row-${match._id || match.orderNo}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [pageRows, hilite]);

  const toggleHighlight = (orderNo) => {
    setHilite((prev) => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      if (next) localStorage.setItem(LS_HILITE, next);
      else localStorage.removeItem(LS_HILITE);
      return next;
    });
  };

  // Realtime: refetch disputes when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (activeFilter) {
        fetchDisputes(activeFilter, { silent: true });
      }
    },
    onOrderUpdated: () => {
      if (activeFilter) {
        fetchDisputes(activeFilter, { silent: true });
      }
    },
  });

  const handleSort = (field) => {
    let nextSortBy = field;
    let nextSortOrder = "asc";
    if (sortBy === field) nextSortOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setPage(1);
  };

  if (loading) return <div className="p-6 text-center text-white">⏳ Loading…</div>;
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  const SortIcon = ({ name }) =>
    sortBy === name ? (sortOrder === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />) : <FaSort className="text-xs opacity-70" />;

  const rightControls = (
    <>
      <SearchBar
        value={searchInput}
        onChange={(v) => {
          setSearchInput(v);
          if (v.trim() === "" && appliedQuery !== "") setAppliedQuery("");
        }}
        onApply={(q) => {
          setAppliedQuery(q);
          setPage(1);
          fetchDisputes(activeFilter, { silent: true });
        }}
        onClear={() => {
          setSearchInput("");
          setAppliedQuery("");
          setPage(1);
          fetchDisputes(activeFilter, { silent: true });
        }}
        placeholder="Search… (press Enter)"
      />

      <UnifiedDatePicker
        key={JSON.stringify(currentFilter)}
        value={currentFilter}
        tz={TZ}
        onFilterChange={(filter) => {
          const next = filter && Object.keys(filter).length ? filter : buildDefaultFilter();
          setActiveFilter(next);
          setCurrentFilter(next);
          setPage(1);
          fetchDisputes(next, { silent: true });
        }}
      />
    </>
  );

  return (
    <StickyDataPage
      title="Monthly Disputes"
      totalLabel={`Total Disputes: ${totalDisputes}`}
      badge={
        currentFilter && (
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
            {prettyFilterLabel(currentFilter)}
          </span>
        )
      }
      page={safePage}
      totalPages={clientTotalPages}
      onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
      onNextPage={() => setPage((p) => Math.min(clientTotalPages, p + 1))}
      rightControls={rightControls}
      ref={contentRef}
    >
      <div className="overflow-x-auto">
        <div className="max-h-[80vh] overflow-y-auto scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
          <table className="min-w-[1100px] w-full bg-black/20 backdrop-blur-md text-white">
            <thead className="sticky top-0 bg-[#5c8bc1] z-20">
              <tr>
                <th onClick={() => handleSort("orderNo")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Order No. <SortIcon name="orderNo" />
                  </div>
                </th>
                <th onClick={() => handleSort("orderDate")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Order Date <SortIcon name="orderDate" />
                  </div>
                </th>
                <th onClick={() => handleSort("customerName")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Customer Name <SortIcon name="customerName" />
                  </div>
                </th>
                <th onClick={() => handleSort("disputedDate")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Disputed Date <SortIcon name="disputedDate" />
                  </div>
                </th>
                <th onClick={() => handleSort("disputeReason")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Dispute Reason <SortIcon name="disputeReason" />
                  </div>
                </th>
                <th onClick={() => handleSort("custRefAmount")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Refund Amount ($) <SortIcon name="custRefAmount" />
                  </div>
                </th>
                <th className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">Actions</div>
                </th>
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-white/80">No disputes found.</td>
                </tr>
              ) : (
                pageRows.map((o, idx) => {
                  const isHi = hilite === String(o.orderNo);
                  return (
                    <tr
                      key={o._id || o.orderNo}
                      id={`disp-row-${o._id || o.orderNo}`}
                      onClick={() => toggleHighlight(o.orderNo)}
                      className={`transition text-sm cursor-pointer ${
                        isHi ? "bg-yellow-500/20 ring-2 ring-yellow-400" : idx % 2 === 0 ? "bg-white/10" : "bg-white/5"
                      } hover:bg-white/20`}
                    >
                      <td className={`${baseCellClass} text-left`}>{o.orderNo}</td>
                      <td className={`${baseCellClass} text-left`}>{formatDate(o.orderDate)}</td>
                      <td className={`${baseCellClass} text-left`}>{o.customerName || "-"}</td>
                      <td className={`${baseCellClass} text-left`}>{formatDate(o.disputedDate)}</td>
                      <td className={`${baseCellClass} text-left`}>{o.disputeReason || "-"}</td>
                      <td className={`${baseCellClass} text-left`}>${o.custRefAmount.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            localStorage.setItem(LS_HILITE, String(o.orderNo));
                            localStorage.setItem(LS_PAGE, String(safePage));
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

            {/* Footer (match sticky first-col bg in dark mode + centered values) */}
            {pageRows.length > 0 && (
              <tfoot className="sticky bottom-0 text-white z-30">
                <tr
                  className="
                    bg-gradient-to-r from-[#3788d9] via-[#553790] to-[#6969b5]
                    dark:bg-[#1e1e1e] dark:bg-none
                  "
                >
                  {/* orderNo */}<td className="p-2.5 border-t border-white/30 sticky left-0 z-20 bg-gradient-to-r from-[#3788d9] via-[#553790] to-[#6969b5] dark:bg-[#1e1e1e] dark:bg-none" />
                  {/* orderDate */}<td className="p-2.5 border-t border-white/30 text-center align-middle" />
                  {/* customerName */}<td className="p-2.5 border-t border-white/30 text-center align-middle" />
                  {/* disputedDate */}<td className="p-2.5 border-t border-white/30 text-center align-middle" />
                  {/* disputeReason */}<td className="p-2.5 border-t border-white/30 text-center align-middle" />
                  {/* amount total on page */}<td className="p-2.5 border-t border-white/30 text-center align-middle">
                    ${pageRows.reduce((s, r) => s + (r.custRefAmount || 0), 0).toFixed(2)}
                  </td>
                  {/* actions col */}<td className="p-2.5 border-t border-white/30 text-center align-middle right-0 z-20" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {isFetching && <div className="p-2 text-center text-xs text-white/70">Updating…</div>}
    </StickyDataPage>
  );
};

export default MonthlyDisputes;
