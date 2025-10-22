// src/pages/CardNotCharged.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaSort,
  FaSortUp,
  FaSortDown,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";

import UnifiedDatePicker from "../components/UnifiedDatePicker";
import SearchBar from "../components/SearchBar";

// Reused utils
import {
  buildDefaultFilter,
  prettyFilterLabel,
  formatDate,
} from "../utils/dateUtils";
import { buildParams } from "../utils/apiParams";
import { baseHeadClass, baseCellClass } from "../utils/tableStyles";

// RTK Query service that fetches and merges ALL pages
import { useGetMonthlyOrdersAllQuery } from "../services/monthlyOrdersApi";

const ROWS_PER_PAGE = 25;

// LocalStorage keys (parallel to MonthlyOrders)
const LS_PAGE = "cardNotChargedPage";
const LS_SEARCH = "cardNotChargedSearch";
const LS_HILITE = "highlightedOrderNo";
const LS_FILTER = "cnc_filter_v1";

// ---- helpers to read/write filter in URL & LS (mirror MonthlyOrders) ----
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

// yard qualifies ONLY when: (!paymentStatus || "Card not charged") AND status !== "PO cancelled"
function yardQualifies(info) {
  const ps = (info?.paymentStatus || "").toLowerCase();
  const st = (info?.status || "").toLowerCase();
  return (!ps || ps === "card not charged") && st !== "po cancelled";
}

function parseAmountAfterColon(s) {
  if (!s || typeof s !== "string") return 0;
  const idx = s.indexOf(":");
  if (idx === -1) return 0;
  const n = parseFloat(s.slice(idx + 1).trim());
  return isNaN(n) ? 0 : n;
}

const CardNotCharged = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // ---- initial state from URL/LS (match MonthlyOrders pattern) ----
  const getInitialPage = () => {
    const sp = new URLSearchParams(location.search);
    const fromUrl = parseInt(sp.get("page") || "", 10);
    if (!Number.isNaN(fromUrl) && fromUrl > 0) return fromUrl;
    const fromLS = parseInt(localStorage.getItem(LS_PAGE) || "1", 10);
    return Number.isNaN(fromLS) ? 1 : fromLS;
  };
  const getInitialSearch = () => {
    const sp = new URLSearchParams(location.search);
    const fromUrl = sp.get("q");
    if (fromUrl !== null) return fromUrl;
    return localStorage.getItem(LS_SEARCH) || "";
  };
  const getInitialFilter = () => {
    const sp = new URLSearchParams(location.search);
    return readFilterFromSearch(sp) || readFilterFromLS() || buildDefaultFilter();
  };

  // Filters + UI state
  const [activeFilter, setActiveFilter] = useState(getInitialFilter());
  const [currentFilter, setCurrentFilter] = useState(getInitialFilter());

  // Persisted page + highlight + search
  const [currentPage, setCurrentPage] = useState(getInitialPage());
  useEffect(() => {
    localStorage.setItem(LS_PAGE, String(currentPage));
  }, [currentPage]);

  const [highlightedOrderNo, setHighlightedOrderNo] = useState(
    localStorage.getItem(LS_HILITE) || null
  );
  const toggleHighlight = (orderNo) => {
    setHighlightedOrderNo((prev) => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      if (next) localStorage.setItem(LS_HILITE, next);
      else localStorage.removeItem(LS_HILITE);
      return next;
    });
  };

  const [searchInput, setSearchInput] = useState(getInitialSearch());
  const [appliedQuery, setAppliedQuery] = useState(getInitialSearch());

  const [sortBy, setSortBy] = useState(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("sortBy");
  });
  const [sortOrder, setSortOrder] = useState(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("sortOrder") || "asc";
  });

  // Row expand (multi-expand like MonthlyOrders)
  const [expandedIds, setExpandedIds] = useState(new Set());
  const toggleRowExpansion = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSort = (key) => {
    if (key === "action") return;
    let nextSortBy = key;
    let nextSortOrder = "asc";
    if (sortBy === key) nextSortOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setCurrentPage(1);
  };

  // ---- Data fetch via RTK Query (fetches and merges all server pages) ----
  const params = useMemo(() => {
    const p = buildParams({
      filter: activeFilter || buildDefaultFilter(),
      page: 1, // service merges all internally
      query: appliedQuery || "",
      sortBy: sortBy || "",
      sortOrder,
    });
    return Object.fromEntries(p.entries()); // RTK Query expects a plain object
  }, [activeFilter, appliedQuery, sortBy, sortOrder]);

  const {
    data: allOrders = [],
    isLoading,
    isFetching, // re-fetching flag when args change
    error,
  } = useGetMonthlyOrdersAllQuery(params, {
    skip: !activeFilter, // wait until filter is ready
  });

  // ---- sync URL + LS so Back navigation restores state ----
  useEffect(() => {
    localStorage.setItem(LS_PAGE, String(currentPage));
    localStorage.setItem(LS_SEARCH, appliedQuery || "");
    writeFilterToLS(activeFilter);
    setCurrentFilter(activeFilter);

    const sp = new URLSearchParams(location.search);
    sp.set("page", String(currentPage));
    if (appliedQuery?.trim()) sp.set("q", appliedQuery.trim());
    else sp.delete("q");

    writeFilterToSearch(sp, activeFilter);

    if (sortBy) sp.set("sortBy", sortBy);
    else sp.delete("sortBy");
    if (sortOrder) sp.set("sortOrder", sortOrder);
    else sp.delete("sortOrder");

    navigate({ search: `?${sp.toString()}` }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, appliedQuery, activeFilter, sortBy, sortOrder]);

  // Transform ALL orders -> keep only qualifying yards; skip order if none remain; compute approx charge + sort helpers
  const processedRows = useMemo(() => {
    return (allOrders || [])
      .map((order) => {
        const infos = Array.isArray(order.additionalInfo)
          ? order.additionalInfo.filter(yardQualifies)
          : [];

        if (infos.length === 0) return null;

        let approx = 0;
        const yardSortVals = infos.map((info) => {
          const shippingDetails = info.shippingDetails || "";
          const partPrice = parseFloat(info.partPrice || 0) || 0;
          const others = parseFloat(info.others || 0) || 0;

          // Approx: only "Yard shipping: <amount>" counts as shipping
          let yardShipping = 0;
          if (shippingDetails.toLowerCase().includes("yard shipping")) {
            yardShipping = parseAmountAfterColon(shippingDetails);
          }
          approx += partPrice + yardShipping + others;

          // value used for sorting yard columns
          return `${info.yardName || ""} ${shippingDetails}`.toLowerCase();
        });

        return {
          ...order,
          _yardInfos: infos, // keep full yard objects for expanded details
          _yardSortVals: yardSortVals, // for sorting by Yard N
          _approxCharge: Number(approx.toFixed(2)),
        };
      })
      .filter(Boolean);
  }, [allOrders]);

  // Client-side filtering by appliedQuery (kept—server may not filter)
  const filteredRows = useMemo(() => {
    const q = appliedQuery.trim().toLowerCase();
    if (!q) return processedRows;
    return processedRows.filter((o) => {
      const yardText = (o._yardInfos || [])
        .map((y) =>
          [y.yardName, y.status, y.shippingDetails, y.paymentStatus, y.stockNo].join(" ")
        )
        .join(" ")
        .toLowerCase();

      return (
        (String(o.orderNo) || "").toLowerCase().includes(q) ||
        (o.salesAgent || "").toLowerCase().includes(q) ||
        (o.customerName || "").toLowerCase().includes(q) ||
        (o.pReq || "").toLowerCase().includes(q) ||
        (o.desc || "").toLowerCase().includes(q) ||
        (o.partNo || "").toLowerCase().includes(q) ||
        yardText.includes(q) ||
        formatDate(o.orderDate).toLowerCase().includes(q)
      );
    });
  }, [processedRows, appliedQuery]);

  // Auto-expand/collapse when results or query change
  useEffect(() => {
    const hasQuery = appliedQuery.trim().length > 0;
    setExpandedIds(
      hasQuery ? new Set(filteredRows.map((o) => String(o._id || o.orderNo))) : new Set()
    );
  }, [filteredRows, appliedQuery]);

  // Sorting across the WHOLE filtered dataset
  const sortedRows = useMemo(() => {
    if (!sortBy) return filteredRows;

    const cmp = (a, b) => {
      let A, B;

      if (sortBy === "orderDate") {
        A = new Date(a.orderDate || 0).getTime();
        B = new Date(b.orderDate || 0).getTime();
        return sortOrder === "asc" ? A - B : B - A;
      }
      if (sortBy === "orderNo") {
        A = (a.orderNo || "").toString().toLowerCase();
        B = (b.orderNo || "").toString().toLowerCase();
        return sortOrder === "asc" ? A.localeCompare(B) : B.localeCompare(A);
      }
      if (sortBy === "salesAgent") {
        A = (a.salesAgent || "").toString().toLowerCase();
        B = (b.salesAgent || "").toString().toLowerCase();
        return sortOrder === "asc" ? A.localeCompare(B) : B.localeCompare(A);
      }
      if (sortBy === "approxCharge") {
        A = a._approxCharge || 0;
        B = b._approxCharge || 0;
        return sortOrder === "asc" ? A - B : B - A;
      }
      if (sortBy.startsWith("yard-")) {
        const idx = parseInt(sortBy.split("-")[1], 10);
        A = a._yardSortVals[idx] || "";
        B = b._yardSortVals[idx] || "";
        return sortOrder === "asc" ? A.localeCompare(B) : B.localeCompare(A);
      }
      return 0;
    };

    return [...filteredRows].sort(cmp);
  }, [filteredRows, sortBy, sortOrder]);

  // Client-side pagination
  const totalFilteredOrders = filteredRows.length; // show this in header
  const clientTotalPages = Math.max(1, Math.ceil(sortedRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, clientTotalPages);
  const pageStart = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows = sortedRows.slice(pageStart, pageStart + ROWS_PER_PAGE);

  // Yard column count based on CURRENT PAGE (like your HTML)
  const maxYardsOnPage = useMemo(
    () => pageRows.reduce((m, r) => Math.max(m, r._yardInfos.length), 0),
    [pageRows]
  );

  // Scroll to highlighted row on load/refresh
  useEffect(() => {
    if (!highlightedOrderNo || !sortedRows?.length) return;
    const match = sortedRows.find((o) => String(o.orderNo) === String(highlightedOrderNo));
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`row-cnc-${match._id || match.orderNo}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [sortedRows, highlightedOrderNo]);

  if (isLoading) return <div className="p-6 text-center text-white">⏳ Loading…</div>;
  if (error) return <div className="p-6 text-center text-red-300">Failed to load data.</div>;

  return (
    <div className="min-h-screen p-6">
      {/* Header + Pagination + Filter */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4">
        {/* LEFT: title; BELOW IT: totals + pager in one row */}
        <div className="flex flex-col">
          <h2 className="text-3xl font-bold text-white underline decoration-1">
            Card Not Charged
          </h2>

          <div className="mt-1 flex items-center gap-4">
            <p className="text-sm text-white/70">
              Total Orders: <strong>{totalFilteredOrders}</strong>
              {isFetching && <span className="ml-3 text-xs text-white/60">Refreshing…</span>}
            </p>

            {currentFilter && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
                {prettyFilterLabel(currentFilter)}
              </span>
            )}

            {/* Pagination */}
            <div className="flex items-center gap-2 text-white font-medium">
              {/* Prev */}
              <button
                disabled={safePage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className={`px-3 py-1 rounded-full transition ${
                  safePage === 1
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
                title="Previous"
              >
                <FaChevronLeft size={14} />
              </button>

              {/* Page text */}
              <span className="px-4 py-1 bg-gray-800 rounded-full text-sm shadow">
                Page <strong>{safePage}</strong> of {clientTotalPages}
              </span>

              {/* Next */}
              <button
                disabled={safePage === clientTotalPages}
                onClick={() => setCurrentPage((p) => Math.min(clientTotalPages, p + 1))}
                className={`px-3 py-1 rounded-full transition ${
                  safePage === clientTotalPages
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
                title="Next"
              >
                <FaChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Search + Date filter */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <SearchBar
            value={searchInput}
            onChange={setSearchInput}
            onApply={(q) => {
              localStorage.setItem(LS_SEARCH, q);
              setAppliedQuery(q);
              setCurrentPage(1);
            }}
            onClear={() => {
              setSearchInput("");
              setAppliedQuery("");
              localStorage.removeItem(LS_SEARCH);
              setCurrentPage(1);
            }}
            placeholder="Search… (press Enter)"
          />

          <UnifiedDatePicker
            key={JSON.stringify(currentFilter)}
            value={currentFilter}
            onFilterChange={(filter) => {
              const next =
                filter && Object.keys(filter).length ? filter : buildDefaultFilter();
              setActiveFilter(next);
              setCurrentFilter(next);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <div className="max-h-[80vh] overflow-y-auto scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
          <table className="min-w-[1100px] w-full bg-black/20 backdrop-blur-md text-white">
            <thead className="sticky top-0 bg-[#5c8bc1] z-20">
              <tr>
                {/* Order No */}
                <th
                  onClick={() => handleSort("orderNo")}
                  className={`${baseHeadClass} text-left`}
                >
                  <div className="flex items-center gap-1">
                    Order No
                    {sortBy === "orderNo" ? (
                      sortOrder === "asc" ? (
                        <FaSortUp className="text-xs" />
                      ) : (
                        <FaSortDown className="text-xs" />
                      )
                    ) : (
                      <FaSort className="text-xs text-white/60" />
                    )}
                  </div>
                </th>

                {/* Order Date */}
                <th
                  onClick={() => handleSort("orderDate")}
                  className={`${baseHeadClass} text-left`}
                >
                  <div className="flex items-center gap-1">
                    Order Date
                    {sortBy === "orderDate" ? (
                      sortOrder === "asc" ? (
                        <FaSortUp className="text-xs" />
                      ) : (
                        <FaSortDown className="text-xs" />
                      )
                    ) : (
                      <FaSort className="text-xs text-white/60" />
                    )}
                  </div>
                </th>

                {/* Sales Agent */}
                <th
                  onClick={() => handleSort("salesAgent")}
                  className={`${baseHeadClass} text-left`}
                >
                  <div className="flex items-center gap-1">
                    Sales Agent
                    {sortBy === "salesAgent" ? (
                      sortOrder === "asc" ? (
                        <FaSortUp className="text-xs" />
                      ) : (
                        <FaSortDown className="text-xs" />
                      )
                    ) : (
                      <FaSort className="text-xs text-white/60" />
                    )}
                  </div>
                </th>

                {/* Dynamic Yard columns (based on current page) */}
                {Array.from({ length: maxYardsOnPage }).map((_, i) => (
                  <th
                    key={`yard-h-${i}`}
                    onClick={() => handleSort(`yard-${i}`)}
                    className={`${baseHeadClass} text-left`}
                  >
                    <div className="flex items-center gap-1">
                      {`Yard ${i + 1}`}
                      {sortBy === `yard-${i}` ? (
                        sortOrder === "asc" ? (
                          <FaSortUp className="text-xs" />
                        ) : (
                          <FaSortDown className="text-xs" />
                        )
                      ) : (
                        <FaSort className="text-xs text-white/60" />
                      )}
                    </div>
                  </th>
                ))}

                {/* Approximate Card Charged */}
                <th
                  onClick={() => handleSort("approxCharge")}
                  className={`${baseHeadClass} text-left`}
                >
                  <div className="flex items-center gap-1">
                    Approximate Card Charged ($)
                    {sortBy === "approxCharge" ? (
                      sortOrder === "asc" ? (
                        <FaSortUp className="text-xs" />
                      ) : (
                        <FaSortDown className="text-xs" />
                      )
                    ) : (
                      <FaSort className="text-xs text-white/60" />
                    )}
                  </div>
                </th>

                <th className={`${baseHeadClass} text-left cursor-default`}>Action</th>
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={3 + maxYardsOnPage + 2}
                    className="p-6 text-center text-white/80"
                  >
                    No orders found.
                  </td>
                </tr>
              ) : (
                pageRows.map((o) => {
                  const idKey = o._id || o.orderNo;
                  const isExpanded = expandedIds.has(String(idKey));
                  const isHighlighted = highlightedOrderNo === String(o.orderNo);

                  return (
                    <tr
                      key={idKey}
                      id={`row-cnc-${idKey}`}
                      onClick={() => toggleHighlight(o.orderNo)}
                      className={`transition text-sm cursor-pointer ${
                        isHighlighted
                          ? "bg-yellow-500/20 ring-2 ring-yellow-400"
                          : "even:bg-white/5 odd:bg-white/10 hover:bg-white/20"
                      }`}
                    >
                      {/* Order No + Show/Hide Details */}
                      <td className={`${baseCellClass} text-left`}>
                        <div className="flex items-center gap-2">
                          <span>{o.orderNo}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowExpansion(idKey);
                            }}
                            className="text-blue-400 text-xs underline hover:text-blue-300"
                          >
                            {isExpanded ? "Hide Details" : "Show Details"}
                          </button>
                        </div>
                      </td>

                      {/* Order Date */}
                      <td className={`${baseCellClass} text-left`}>
                        {formatDate(o.orderDate)}
                      </td>

                      {/* Sales Agent */}
                      <td className={`${baseCellClass} text-left`}>
                        {o.salesAgent || "N/A"}
                      </td>

                      {/* Yard cells */}
                      {Array.from({ length: maxYardsOnPage }).map((_, i) => {
                        const info = o._yardInfos[i];
                        return (
                          <td
                            key={`yard-c-${o.orderNo}-${i}`}
                            className={`${baseCellClass} text-left whitespace-pre-line align-top`}
                          >
                            {info ? (
                              <div>
                                <div className="font-medium">
                                  {info.yardName || "N/A"}
                                </div>

                                {isExpanded && (
                                  <div className="mt-2 text-sm text-white/90 border-t border-white/20 pt-2 space-y-1">
                                    <div>
                                      <b>Email:</b> {info.email || "N/A"}
                                    </div>
                                    <div>
                                      <b>Phone:</b> {info.phone || "N/A"}
                                    </div>
                                    <div>
                                      <b>Status:</b> {info.status || "N/A"}
                                    </div>
                                    <div>
                                      <b>Stock No:</b> {info.stockNo || "N/A"}
                                    </div>
                                    <div>
                                      <b>Part Price:</b> $
                                      {Number(info.partPrice || 0).toFixed(2)}
                                    </div>
                                    <div>
                                      <b>Shipping:</b>{" "}
                                      {info.shippingDetails || "N/A"}
                                    </div>
                                    <div>
                                      <b>Others:</b> $
                                      {Number(info.others || 0).toFixed(2)}
                                    </div>
                                    <div>
                                      <b>Refunded:</b> $
                                      {Number(info.refundedAmount || 0).toFixed(2)}
                                    </div>
                                    <div>
                                      <b>Payment Status:</b>{" "}
                                      {info.paymentStatus || "N/A"}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}

                      {/* Approx charge */}
                      <td className={`${baseCellClass} text-left`}>
                        ${o._approxCharge.toFixed(2)}
                      </td>

                      {/* View */}
                      <td className={`${baseCellClass} text-left`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            localStorage.setItem(LS_HILITE, String(o.orderNo));
                            localStorage.setItem(LS_PAGE, String(currentPage));
                            setHighlightedOrderNo(String(o.orderNo));
                            navigate(
                              `/order-details?orderNo=${encodeURIComponent(o.orderNo)}`
                            );
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
    </div>
  );
};

export default CardNotCharged;
