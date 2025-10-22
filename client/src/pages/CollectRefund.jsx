// src/pages/CollectRefund.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaSort, FaSortUp, FaSortDown, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";

import StickyDataPage from "../layouts/StickyDataPage";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import SearchBar from "../components/SearchBar";

// Shared utils
import { formatDate, prettyFilterLabel, buildDefaultFilter } from "../utils/dateUtils";
import { buildParams } from "../utils/apiParams"; // or ../utils/apiRarams if that's your filename
import { baseHeadClass, baseCellClass } from "../utils/tableStyles";

// RTK Query: loads all filtered pages in background then we paginate/sort client-side
import { useGetMonthlyOrdersAllQuery } from "../services/monthlyOrdersApi";

const TZ = "America/Chicago";
const ROWS_PER_PAGE = 25;

// LocalStorage keys (namespaced for CollectRefund page)
const LS_PAGE = "collectRefund_page";
const LS_FILTER = "collectRefund_filter_v2";
const LS_SORTBY = "collectRefund_sortBy";
const LS_SORTORDER = "collectRefund_sortOrder";
const LS_HILITE = "collectRefund_highlightedOrderNo";
const LS_SEARCH = "collectRefund_search";

// --- helpers copied from MonthlyOrders pattern ---
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

function parseAmountAfterColon(s) {
  if (!s || typeof s !== "string") return 0;
  const idx = s.indexOf(":");
  if (idx === -1) return 0;
  const n = parseFloat(s.slice(idx + 1).trim());
  return isNaN(n) ? 0 : n;
}

const CollectRefund = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);

  // ----- initial state from URL/LS -----
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

  const [activeFilter, setActiveFilter] = useState(getInitialFilter());
  const [currentFilter, setCurrentFilter] = useState(getInitialFilter());

  const [page, setPage] = useState(getInitialPage());
  const [sortBy, setSortBy] = useState(getInitialSortBy());
  const [sortOrder, setSortOrder] = useState(getInitialSortOrder());

  const [searchInput, setSearchInput] = useState(getInitialSearch());
  const [appliedQuery, setAppliedQuery] = useState(getInitialSearch());

  const [expandedRow, setExpandedRow] = useState(null);
  const [hilite, setHilite] = useState(localStorage.getItem(LS_HILITE) || null);

  // ---- data load (all pages) via RTK Query ----
  const queryArgs = useMemo(() => {
    const params = buildParams({
      filter: activeFilter,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined,
      query: appliedQuery || undefined,
    });
    return Object.fromEntries(params.entries());
  }, [activeFilter, sortBy, sortOrder, appliedQuery]);

  const { data: rawOrders = [], isFetching, isLoading, error } = useGetMonthlyOrdersAllQuery(
    queryArgs,
    { skip: !activeFilter }
  );

  // process rows
  const processedRows = useMemo(() => {
    return (rawOrders || [])
      .map((order) => {
        const infos = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];
        const qualifying = infos.filter((i) => i?.collectRefundCheckbox === "Ticked");
        if (qualifying.length === 0) return null;

        let totalPartPrice = 0;
        let totalShipping = 0;
        let totalOthers = 0;
        let totalRefunds = 0;
        let totalToBeRefunded = 0;
        let overallSum = 0;
        let refundToCollectAccumulator = 0;

        const yardSortVals = [];
        const yardVisibility = [];

        qualifying.forEach((info) => {
          const part = parseFloat(info.partPrice || 0) || 0;
          const others = parseFloat(info.others || 0) || 0;
          const refunded = parseFloat(info.refundedAmount || 0) || 0;
          const toRefund = parseFloat(info.refundToCollect || 0) || 0;
          const ship = parseAmountAfterColon(info.shippingDetails || "");

          if (refunded === 0 && toRefund > 0) {
            refundToCollectAccumulator += toRefund;
          }

          totalPartPrice += part;
          totalShipping += ship;
          totalOthers += others;
          totalRefunds += refunded;
          totalToBeRefunded += toRefund;
          overallSum += part + ship + others - refunded;

          yardSortVals.push(`${info.yardName || ""} ${(info.shippingDetails || "").toLowerCase().trim()}`);
          yardVisibility.push(info.collectRefundCheckbox === "Ticked" && !info.refundedAmount);
        });

        return {
          ...order,
          _yardInfos: qualifying,
          _yardSortVals: yardSortVals,
          _yardVisible: yardVisibility,
          _totalPartPrice: Number(totalPartPrice.toFixed(2)),
          _totalShipping: Number(totalShipping.toFixed(2)),
          _totalOthers: Number(totalOthers.toFixed(2)),
          _totalRefunds: Number(totalRefunds.toFixed(2)),
          _totalToBeRefunded: Number(totalToBeRefunded.toFixed(2)),
          _overallSum: Number(overallSum.toFixed(2)),
          _refundToCollect: Number(refundToCollectAccumulator.toFixed(2)),
        };
      })
      .filter(Boolean);
  }, [rawOrders]);

  // sorting
  const sortedRows = useMemo(() => {
    if (!sortBy) return processedRows;

    const cmp = (a, b) => {
      let A, B;

      if (sortBy === "orderNo") {
        A = (a.orderNo || "").toString().toLowerCase();
        B = (b.orderNo || "").toString().toLowerCase();
        return sortOrder === "asc" ? A.localeCompare(B) : B.localeCompare(A);
      }
      if (sortBy === "orderDate") {
        A = new Date(a.orderDate || 0).getTime();
        B = new Date(b.orderDate || 0).getTime();
        return sortOrder === "asc" ? A - B : B - A;
      }
      if (sortBy === "totalPartPrice") {
        A = a._totalPartPrice || 0; B = b._totalPartPrice || 0;
        return sortOrder === "asc" ? A - B : B - A;
      }
      if (sortBy === "totalShipping") {
        A = a._totalShipping || 0; B = b._totalShipping || 0;
        return sortOrder === "asc" ? A - B : B - A;
      }
      if (sortBy === "others") {
        A = a._totalOthers || 0; B = b._totalOthers || 0;
        return sortOrder === "asc" ? A - B : B - A;
      }
      if (sortBy === "overallToBeRefunded") {
        A = a._totalToBeRefunded || 0; B = b._totalToBeRefunded || 0;
        return sortOrder === "asc" ? A - B : B - A;
      }
      if (sortBy === "refunds") {
        A = a._totalRefunds || 0; B = b._totalRefunds || 0;
        return sortOrder === "asc" ? A - B : B - A;
      }
      if (sortBy === "overallSum") {
        A = a._overallSum || 0; B = b._overallSum || 0;
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

    return [...processedRows].sort(cmp);
  }, [processedRows, sortBy, sortOrder]);

  // client-side pagination
  const clientTotalPages = Math.max(1, Math.ceil((sortedRows?.length || 0) / ROWS_PER_PAGE));
  const safePage = Math.min(page, clientTotalPages);
  const pageStart = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows = sortedRows.slice(pageStart, pageStart + ROWS_PER_PAGE);

  // dynamic yard columns for current page
  const maxYardsOnPage = useMemo(
    () => pageRows.reduce((m, r) => Math.max(m, r._yardInfos.length), 0),
    [pageRows]
  );

  // footer totals (current page)
  const footerTotals = useMemo(() => {
    return pageRows.reduce(
      (acc, r) => {
        acc.part += r._totalPartPrice;
        acc.ship += r._totalShipping;
        acc.others += r._totalOthers;
        acc.toRefund += r._totalToBeRefunded;
        acc.refunds += r._totalRefunds;
        acc.overall += r._overallSum;
        return acc;
      },
      { part: 0, ship: 0, others: 0, toRefund: 0, refunds: 0, overall: 0 }
    );
  }, [pageRows]);

  const totalFilteredOrders = processedRows.length;
  const totalRefundToCollectAll = useMemo(
    () => processedRows.reduce((sum, r) => sum + (r._refundToCollect || 0), 0),
    [processedRows]
  );

  // highlight persistence
  const toggleHighlight = (orderNo) => {
    setHilite((prev) => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      if (next) localStorage.setItem(LS_HILITE, next);
      else localStorage.removeItem(LS_HILITE);
      return next;
    });
  };

  // row expand
  const toggleRowExpansion = (id) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  // SORT
  const handleSort = (field) => {
    let nextSortBy = field;
    let nextSortOrder = "asc";
    if (sortBy === field) nextSortOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setPage(1);
  };

  // sync URL + LS
  useEffect(() => {
    localStorage.setItem(LS_PAGE, String(safePage));
    localStorage.setItem(LS_SORTBY, sortBy || "");
    localStorage.setItem(LS_SORTORDER, sortOrder || "");
    localStorage.setItem(LS_SEARCH, appliedQuery || "");
    writeFilterToLS(activeFilter);
    setCurrentFilter(activeFilter);

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

  // auto-scroll to highlighted row after data renders (on current page only)
  useEffect(() => {
    if (!hilite || !pageRows?.length) return;
    const match = pageRows.find((o) => String(o.orderNo) === String(hilite));
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`cr-row-${match._id || match.orderNo}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [pageRows, hilite]);

  const SortIcon = ({ name }) =>
    sortBy === name ? (sortOrder === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />) : <FaSort className="opacity-70 text-xs" />;

  if (isLoading) return <div className="p-6 text-center text-white">⏳ Loading…</div>;
  if (error) return <div className="p-6 text-center text-red-300">Failed to load data.</div>;

  // Header right controls (Search + Date + Pager)
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
        }}
        onClear={() => {
          setSearchInput("");
          setAppliedQuery("");
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
      title="Collect Refund"
      totalLabel={`Total Orders: ${totalFilteredOrders} | To be Collected: $${totalRefundToCollectAll.toFixed(2)}`}
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
          <table className="min-w-[1100px] w-full bg-black/20 backdrop-blur-md text-white relative">
            <thead className="sticky top-0 bg-[#5c8bc1] z-[60]">
              <tr>
                <th
                  onClick={() => handleSort("orderNo")}
                  className={`${baseHeadClass} sticky left-0 z-40 bg-[#5c8bc1] w-[220px] min-w-[220px] max-w-[220px]`}
                >
                  <div className="flex items-center justify-center gap-1">
                    Order No <SortIcon name="orderNo" />
                  </div>
                </th>
                <th onClick={() => handleSort("orderDate")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Order Date <SortIcon name="orderDate" />
                  </div>
                </th>

                {/* Dynamic Yard columns */}
                {Array.from({ length: maxYardsOnPage }).map((_, i) => (
                  <th
                    key={`yard-h-${i}`}
                    onClick={() => handleSort(`yard-${i}`)}
                    className={`${baseHeadClass}`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {`Yard ${i + 1}`} <SortIcon name={`yard-${i}`} />
                    </div>
                  </th>
                ))}

                <th onClick={() => handleSort("totalPartPrice")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Total Part Price ($) <SortIcon name="totalPartPrice" />
                  </div>
                </th>
                <th onClick={() => handleSort("totalShipping")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Total Shipping ($) <SortIcon name="totalShipping" />
                  </div>
                </th>
                <th onClick={() => handleSort("others")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Other Charges ($) <SortIcon name="others" />
                  </div>
                </th>
                <th onClick={() => handleSort("overallToBeRefunded")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    To Be Refunded ($) <SortIcon name="overallToBeRefunded" />
                  </div>
                </th>
                <th onClick={() => handleSort("refunds")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Refunded ($) <SortIcon name="refunds" />
                  </div>
                </th>
                <th onClick={() => handleSort("overallSum")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Overall Purchase Cost ($) <SortIcon name="overallSum" />
                  </div>
                </th>

                <th className={`${baseHeadClass} right-0 z-40 bg-[#5c8bc1] w-[120px] min-w-[120px]`}>
                  <div className="flex items-center justify-center gap-1">Actions</div>
                </th>
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10 + maxYardsOnPage} className="p-6 text-center text-white/80">
                    No orders found.
                  </td>
                </tr>
              ) : (
                pageRows.map((o, idx) => {
                  const isHi = hilite === String(o.orderNo);
                  return (
                    <tr
                      key={o._id || o.orderNo}
                      id={`cr-row-${o._id || o.orderNo}`}
                      onClick={() => toggleHighlight(o.orderNo)}
                      className={`transition text-sm cursor-pointer ${
                        isHi ? "bg-yellow-500/20 ring-2 ring-yellow-400" : idx % 2 === 0 ? "bg-white/10" : "bg-white/5"
                      } hover:bg-white/20`}
                    >
                      {/* Sticky first col cell */}
                      <td
                        className={`
                          ${baseCellClass} text-left sticky left-0 z-30
                          bg-gradient-to-r from-[#3788d9] via-[#553790] to-[#6969b5] text-[#e1ebeb]
                          dark:bg-[#1e1e1e] dark:text-[#e1ebeb] dark:bg-none
                        `}
                      >
                        <div className="flex items-center gap-2 pr-3">
                          <span>{o.orderNo}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const id = o._id || o.orderNo;
                              toggleRowExpansion(id);
                            }}
                            className="text-blue-400 text-xs underline hover:text-blue-300"
                          >
                            {expandedRow === (o._id || o.orderNo) ? "Hide Details" : "Show Details"}
                          </button>
                        </div>
                      </td>

                      {/* Order Date */}
                      <td className={`${baseCellClass} text-left`}>{formatDate(o.orderDate)}</td>

                      {/* Yard cells: auto show only when ticked && !refunded; but show details when expanded */}
                      {Array.from({ length: maxYardsOnPage }).map((_, i) => {
                        const info = o._yardInfos[i];
                        const autoVisible = o._yardVisible[i];
                        const isExpanded = expandedRow === (o._id || o.orderNo);
                        const showDetailsPanel = isExpanded && !!info;
                        const showYardName = info && (autoVisible || isExpanded);

                        return (
                          <td key={`yard-c-${o.orderNo}-${i}`} className={`${baseCellClass} text-left whitespace-pre-line align-top`}>
                            {showYardName ? (
                              <div>
                                <div className="font-medium whitespace-nowrap">{info.yardName || "N/A"}</div>

                                {showDetailsPanel && (
                                  <div className="mt-2 text-sm text-white/90 border-t border-white/20 pt-2 space-y-1">
                                    <div><b>Email:</b> {info.email || "N/A"}</div>
                                    <div><b>Phone:</b> {info.phone || "N/A"}</div>
                                    <div><b>Status:</b> {info.status || "N/A"}</div>
                                    <div><b>Stock No:</b> {info.stockNo || "N/A"}</div>
                                    <div><b>Part Price:</b> ${Number(info.partPrice || 0).toFixed(2)}</div>
                                    <div><b>Shipping:</b> {info.shippingDetails || "N/A"}</div>
                                    <div><b>Others:</b> ${Number(info.others || 0).toFixed(2)}</div>
                                    <div><b>Refund To Collect:</b> ${Number(info.refundToCollect || 0).toFixed(2)}</div>
                                    <div><b>Refunded:</b> ${Number(info.refundedAmount || 0).toFixed(2)}</div>
                                    <div><b>Payment Status:</b> {info.paymentStatus || "N/A"}</div>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}

                      {/* Totals */}
                      <td className={`${baseCellClass} text-left`}>${o._totalPartPrice.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>${o._totalShipping.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>${o._totalOthers.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>${o._totalToBeRefunded.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>${o._totalRefunds.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>${o._overallSum.toFixed(2)}</td>

                      {/* Actions */}
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

            {/* Footer totals */}
            {pageRows.length > 0 && (
              <tfoot className="sticky bottom-0 text-white z-30">
                <tr
                  className="
                    bg-gradient-to-r from-[#3788d9] via-[#553790] to-[#6969b5]
                    dark:bg-[#1e1e1e] dark:bg-none
                  "
                >
                  {/* empty for Order No + Date + Yard cols */}
                  <td
                    className="
                      p-2.5 border-t border-white/30 sticky left-0 z-20
                      bg-gradient-to-r from-[#3788d9] via-[#553790] to-[#6969b5]
                      dark:bg-[#1e1e1e] dark:bg-none
                    "
                  />
                  <td className="p-2.5 border-t border-white/30 text-center align-middle" />
                  {Array.from({ length: maxYardsOnPage }).map((_, i) => (
                    <td key={`yard-f-${i}`} className="p-2.5 border-t border-white/30 text-center align-middle" />
                  ))}

                  <td className="p-2.5 border-t border-white/30 text-center align-middle">${footerTotals.part.toFixed(2)}</td>
                  <td className="p-2.5 border-t border-white/30 text-center align-middle">${footerTotals.ship.toFixed(2)}</td>
                  <td className="p-2.5 border-t border-white/30 text-center align-middle">${footerTotals.others.toFixed(2)}</td>
                  <td className="p-2.5 border-t border-white/30 text-center align-middle">${footerTotals.toRefund.toFixed(2)}</td>
                  <td className="p-2.5 border-t border-white/30 text-center align-middle">${footerTotals.refunds.toFixed(2)}</td>
                  <td className="p-2.5 border-t border-white/30 text-center align-middle">${footerTotals.overall.toFixed(2)}</td>
                  <td className="p-2.5 border-t border-white/30 text-center align-middle right-0 z-20" />
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

export default CollectRefund;
