// src/pages/ShippingExpenses.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaSort, FaSortUp, FaSortDown, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";

import StickyDataPage from "../layouts/StickyDataPage";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import SearchBar from "../components/SearchBar";

import { formatDate, prettyFilterLabel, buildDefaultFilter } from "../utils/dateUtils";
import { buildParams } from "../utils/apiParams";
import { baseHeadClass, baseCellClass } from "../utils/tableStyles";
import { useGetMonthlyOrdersAllQuery } from "../services/monthlyOrdersApi";

/* ---------- constants ---------- */
const TZ = "America/Chicago";
const ROWS_PER_PAGE = 25;

/* ---------- LS keys (persist like other pages) ---------- */
const LS_PAGE = "shippingExp_page";
const LS_FILTER = "shippingExp_filter_v2";
const LS_SORTBY = "shippingExp_sortBy";
const LS_SORTORDER = "shippingExp_sortOrder";
const LS_SEARCH = "shippingExp_search";
const LS_HILITE = "shippingExp_highlightedOrderNo";

/* ---------- helpers ---------- */
function parseMoney(n) {
  const x = Number.parseFloat(n);
  return Number.isFinite(x) ? x : 0;
}
function parseShippingAmount(s) {
  if (!s || typeof s !== "string") return 0;
  const m = s.match(/(-?\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[0]) : 0;
}

/** Row shape: what we render in the table */
function computeRow(order) {
  const addl = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];
  const yards = addl.map((ai, idx) => ({
    idx: idx + 1,
    yardName: ai.yardName || "-",
    shippingDetails: ai.shippingDetails || "",
    paymentStatus: ai.paymentStatus || "",
    phone: ai.phone || "",
    email: ai.email || "",
  }));

  // “Total Shipping (Card charged)” business rule
  const totalShippingCardCharged = addl.reduce((sum, ai) => {
    if (ai?.paymentStatus === "Card charged") sum += parseShippingAmount(ai.shippingDetails);
    return sum;
  }, 0);

  return {
    _id: order._id,
    orderDate: order.orderDate,
    orderNo: order.orderNo,
    salesAgent: order.salesAgent || "",
    customerName:
      order.customerName || [order.fName || "", order.lName || ""].join(" ").trim(),
    orderStatus: order.orderStatus || "",
    yards,
    shippingCardCharged: totalShippingCardCharged,
  };
}

/* ---------- component ---------- */
const ShippingExpenses = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);

  // ---- initial state from URL/LS (same pattern as MonthlyOrders/Purchases) ----
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
    return sp.get("sortBy") || localStorage.getItem(LS_SORTBY) || "orderDate";
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

  const [activeFilter, setActiveFilter] = useState(getInitialFilter());
  const [currentFilter, setCurrentFilter] = useState(getInitialFilter());

  const [page, setPage] = useState(getInitialPage());
  const [sortBy, setSortBy] = useState(getInitialSortBy());
  const [sortOrder, setSortOrder] = useState(getInitialSortOrder());

  const [searchInput, setSearchInput] = useState(getInitialSearch());
  const [appliedQuery, setAppliedQuery] = useState(getInitialSearch());

  const [hilite, setHilite] = useState(localStorage.getItem(LS_HILITE) || null);
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Role/team from LS (for canEdit rule)
  const team = typeof window !== "undefined" ? localStorage.getItem("team") : null;
  const canEdit = !(team === "Shankar" || team === "Vinutha");

  // ---- RTK Query: fetch ALL orders for current filter (server paging merged) ----
  const queryArgs = useMemo(() => {
    const params = buildParams({
      filter: activeFilter,
      query: appliedQuery || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined,
    });
    return Object.fromEntries(params.entries());
  }, [activeFilter, appliedQuery, sortBy, sortOrder]);

  const {
    data: allOrders = [],
    isFetching,
    isLoading,
    error,
  } = useGetMonthlyOrdersAllQuery(queryArgs, { skip: !activeFilter });

  // compute rows + totals
  const rows = useMemo(() => (allOrders || []).map(computeRow), [allOrders]);
  const totalShipping = useMemo(
    () => rows.reduce((sum, r) => sum + (r.shippingCardCharged || 0), 0),
    [rows]
  );

  // search
  const filtered = useMemo(() => {
    const q = (appliedQuery || "").trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const basicHit = [
        r.orderNo,
        r.salesAgent,
        r.customerName,
        r.orderStatus,
        formatDate(r.orderDate),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);

      const yardHit = r.yards?.some((y) =>
        [`yard ${y.idx}`, y.yardName, y.shippingDetails, y.paymentStatus]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );

      return basicHit || yardHit;
    });
  }, [rows, appliedQuery]);

  // sorting
  const handleSort = (key) => {
    if (key === "action") return;
    let nextSortBy = key;
    let nextSortOrder = "asc";
    if (sortBy === key) nextSortOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setPage(1);
  };
  const SortIcon = ({ name }) =>
    sortBy === name ? (sortOrder === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />) : <FaSort className="text-xs opacity-70" />;

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;

    const getVal = (row) => {
      switch (sortBy) {
        case "orderNo":
          return (row.orderNo || "").toString().toLowerCase();
        case "orderDate": {
          const t = new Date(row.orderDate || 0).getTime();
          return Number.isFinite(t) ? t : 0;
        }
        case "salesAgent":
          return (row.salesAgent || "").toLowerCase();
        case "customerName":
          return (row.customerName || "").toLowerCase();
        default:
          return "";
      }
    };

    return [...filtered].sort((a, b) => {
      const A = getVal(a);
      const B = getVal(b);
      if (typeof A === "number" && typeof B === "number") {
        return sortOrder === "asc" ? A - B : B - A;
      }
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

  // highlight toggle + auto-scroll
  const toggleHighlight = (orderNo) => {
    setHilite((prev) => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      if (next) localStorage.setItem(LS_HILITE, next);
      else localStorage.removeItem(LS_HILITE);
      return next;
    });
  };
  useEffect(() => {
    if (!hilite || !pageRows?.length) return;
    const match = pageRows.find((o) => String(o.orderNo) === String(hilite));
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`shipexp-row-${match._id || match.orderNo}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [pageRows, hilite]);

  // expand/collapse per-order details (yard section)
  const toggleRowExpansion = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // sync URL + LS on state changes
  useEffect(() => {
    localStorage.setItem(LS_PAGE, String(safePage));
    localStorage.setItem(LS_SORTBY, sortBy || "");
    localStorage.setItem(LS_SORTORDER, sortOrder || "");
    localStorage.setItem(LS_SEARCH, appliedQuery || "");
    try {
      localStorage.setItem(LS_FILTER, JSON.stringify(activeFilter || {}));
    } catch {}

    const sp = new URLSearchParams(location.search);
    sp.set("page", String(safePage));
    if ((appliedQuery || "").trim()) sp.set("q", appliedQuery.trim());
    else sp.delete("q");

    writeFilterToSearch(sp, activeFilter);

    if (sortBy) sp.set("sortBy", sortBy);
    else sp.delete("sortBy");
    if (sortOrder) sp.set("sortOrder", sortOrder);
    else sp.delete("sortOrder");

    navigate({ search: `?${sp.toString()}` }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, appliedQuery, activeFilter, sortBy, sortOrder]);

  if (isLoading) return <div className="p-6 text-center text-white">⏳ Loading…</div>;
  if (error) return <div className="p-6 text-center text-red-300">Failed to load data.</div>;

  // header right controls
  const rightControls = (
    <>
      <SearchBar
        value={searchInput}
        onChange={(v) => {
          setSearchInput(v);
          if (v.trim() === "" && appliedQuery !== "") setAppliedQuery("");
        }}
        onApply={(q) => {
          localStorage.setItem(LS_SEARCH, q);
          setAppliedQuery(q);
          setPage(1);
        }}
        onClear={() => {
          setSearchInput("");
          setAppliedQuery("");
          localStorage.removeItem(LS_SEARCH);
          setPage(1);
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
        }}
      />
    </>
  );

  return (
    <StickyDataPage
      title="Shipping Expenses"
      totalLabel={`Total Rows: ${totalRows} | Total Shipping (Card charged): $${totalShipping.toFixed(2)}`}
      badge={
        currentFilter && (
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
            {prettyFilterLabel(currentFilter)}
          </span>
        )
      }
      page={safePage}
      totalPages={totalPages}
      onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
      onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
      rightControls={rightControls}
      ref={contentRef}
    >
      <div className="overflow-x-auto">
        <div className="max-h-[80vh] overflow-y-auto scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
          <table className="min-w-[1100px] w-full bg-black/20 backdrop-blur-md text-white border-separate border-spacing-0">
            <thead className="sticky top-0 bg-[#5c8bc1] z-[60]">
              <tr>
                <th onClick={() => handleSort("orderDate")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Order Date <SortIcon name="orderDate" />
                  </div>
                </th>
                <th onClick={() => handleSort("orderNo")} className={`${baseHeadClass} sticky left-0 z-40 bg-[#5c8bc1]`}>
                  <div className="flex items-center justify-center gap-1">
                    Order No <SortIcon name="orderNo" />
                  </div>
                </th>
                <th onClick={() => handleSort("salesAgent")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Agent Name <SortIcon name="salesAgent" />
                  </div>
                </th>
                <th onClick={() => handleSort("customerName")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Customer <SortIcon name="customerName" />
                  </div>
                </th>
                <th className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">Yards (name + shipping)</div>
                </th>
                <th className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">Order Status</div>
                </th>
                <th className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">Actions</div>
                </th>
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-white/80">
                    No orders found.
                  </td>
                </tr>
              ) : (
                pageRows.map((r, idx) => {
                  const isHi = hilite === String(r.orderNo);
                  const rowId = r._id || r.orderNo;
                  const isOpen = expandedIds.has(rowId);

                  return (
                    <tr
                      key={rowId}
                      id={`shipexp-row-${rowId}`}
                      onClick={() => toggleHighlight(r.orderNo)}
                      className={`transition text-sm cursor-pointer ${
                        isHi ? "bg-yellow-500/20 ring-2 ring-yellow-400" : idx % 2 === 0 ? "bg-white/10" : "bg-white/5"
                      } hover:bg-white/20`}
                    >
                      <td className={`${baseCellClass} text-left`}>{formatDate(r.orderDate)}</td>

                      {/* Sticky first col: Order No + Show/Hide Details */}
                      <td
                        className={`
                          ${baseCellClass} 
                        `}
                      >
                        <div className="flex items-center gap-2 pr-3">
                          <span>{r.orderNo}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowExpansion(rowId);
                            }}
                            className="text-blue-400 text-xs underline hover:text-blue-300"
                          >
                            {isOpen ? "Hide Details" : "Show Details"}
                          </button>
                        </div>
                      </td>

                      <td className={`${baseCellClass} text-left`}>{r.salesAgent}</td>
                      <td className={`${baseCellClass} text-left`}>{r.customerName}</td>

                      {/* Yards cell: collapsed shows names; expanded shows details */}
                      <td className={`${baseCellClass} text-left`}>
                        {r.yards && r.yards.length > 0 ? (
                          <div className="space-y-2">
                            {r.yards.map((y) => (
                              <div key={`${r.orderNo}-yard-${y.idx}`} className="text-xs">
                                <div className="font-medium">
                                  <b>Yard {y.idx}</b>: {y.yardName}
                                </div>
                                {isOpen ? (
                                  <div className="mt-1 border-t border-white/20 pt-1 space-y-0.5">
                                    <div>Shipping: {y.shippingDetails || "—"}</div>
                                    <div>Payment Status: {y.paymentStatus || "—"}</div>
                                    {(y.phone || y.email) && (
                                      <div>
                                        {y.phone || "-"} {y.phone && y.email ? "|" : ""} {y.email || ""}
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-white/70">—</span>
                        )}
                      </td>

                      <td className={`${baseCellClass} text-left`}>{r.orderStatus}</td>

                      <td className={`${baseCellClass} text-left`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // persist state before leaving
                            localStorage.setItem(LS_HILITE, String(r.orderNo));
                            localStorage.setItem(LS_PAGE, String(safePage));
                            localStorage.setItem(LS_SORTBY, sortBy || "");
                            localStorage.setItem(LS_SORTORDER, sortOrder || "");
                            localStorage.setItem(LS_SEARCH, appliedQuery || "");
                            try {
                              localStorage.setItem(LS_FILTER, JSON.stringify(activeFilter || {}));
                            } catch {}
                            navigate(`/order-details?orderNo=${encodeURIComponent(r.orderNo)}`);
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
        </div>
      </div>

      {isFetching && <div className="p-2 text-center text-xs text-white/70">Updating…</div>}
    </StickyDataPage>
  );
};

export default ShippingExpenses;
