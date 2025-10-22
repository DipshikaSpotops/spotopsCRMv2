// src/pages/Purchases.jsx
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
import { formatInTimeZone } from "date-fns-tz";

const TZ = "America/Chicago";
const ROWS_PER_PAGE = 25;

// LocalStorage keys (namespaced for Purchases)
const LS_PAGE = "purchases_page";
const LS_FILTER = "purchases_filter_v2";
const LS_SORTBY = "purchases_sortBy";
const LS_SORTORDER = "purchases_sortOrder";
const LS_HILITE = "purchases_highlightedOrderNo";
const LS_SEARCH = "purchases_search";

/* ---------- helpers ---------- */
function parseMoney(n) {
  const x = Number.parseFloat(n);
  return Number.isFinite(x) ? x : 0;
}
function parseShippingDetails(s) {
  if (!s || typeof s !== "string") return { type: "", amount: 0 };
  const [typePart, amountPart] = s.split(":");
  const amount = parseMoney((amountPart || "").trim());
  return { type: (typePart || "").trim(), amount };
}

/* Map raw order → computed row */
function computeRow(order) {
  const addl = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];
  let totalPart = 0,
    totalShip = 0,
    totalOthers = 0,
    totalRefunds = 0,
    totalOverallAfterRefund = 0;

  addl.forEach((info) => {
    const part = parseMoney(info.partPrice);
    const others = parseMoney(info.others);
    const refunds = parseMoney(info.refundedAmount);
    const { amount: ship } = parseShippingDetails(info.shippingDetails);
    totalPart += part;
    totalShip += ship;
    totalOthers += others;
    totalRefunds += refunds;
    totalOverallAfterRefund += part + ship + others - refunds;
  });

  return {
    _id: order._id,
    orderNo: order.orderNo,
    orderDate: order.orderDate,
    additionalInfo: addl,
    totals: {
      part: totalPart,
      ship: totalShip,
      others: totalOthers,
      refunds: totalRefunds,
      overallAfterRefund: totalOverallAfterRefund,
    },
  };
}

/* Grand total for “Card charged” lines only */
function computeGrandCardChargedUSD(orders) {
  let total = 0;
  for (const o of orders) {
    const addl = Array.isArray(o.additionalInfo) ? o.additionalInfo : [];
    for (const info of addl) {
      if (info?.paymentStatus === "Card charged") {
        const { amount: ship } = parseShippingDetails(info.shippingDetails);
        const part = parseMoney(info.partPrice);
        const others = parseMoney(info.others);
        const ref = parseMoney(info.refundedAmount);
        total += Math.max(0, part + ship + others - ref);
      }
    }
  }
  return total;
}

/* Per-yard cell with Show/Hide (same color as your sample) */
function YardCell({ ai }) {
  const [open, setOpen] = useState(false);
  if (!ai) return <td className={`${baseCellClass}`} />;

  const { type, amount } = parseShippingDetails(ai.shippingDetails);
  return (
    <td className={`${baseCellClass} text-left align-top`}>
      <div className="flex items-start justify-between gap-2">
        <div className="whitespace-nowrap font-medium">{ai.yardName || "-"}</div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          className="text-blue-400 text-xs underline hover:text-blue-300"
        >
          {open ? "Hide Details" : "Show Details"}
        </button>
      </div>

      {open && (
        <div className="mt-2 text-sm text-white/90 border-t border-white/20 pt-2 space-y-1">
          {(ai.phone || ai.email) && (
            <div className="text-xs">
              {ai.phone || "-"} {ai.phone && ai.email ? "|" : ""} {ai.email || ""}
            </div>
          )}
          <div className="text-xs">
            <b>Payment Status:</b> {ai.paymentStatus || "-"}
          </div>
          <div className="text-xs">
            <b>Part:</b> {parseMoney(ai.partPrice).toFixed(2)} {" | "}
            <b>{type ? `${type}` : "Shipping"}:</b> {amount.toFixed(2)} {" | "}
            <b>Others:</b> {parseMoney(ai.others).toFixed(2)}
          </div>
        </div>
      )}
    </td>
  );
}

/** Normalize any filter into { month, year } in America/Chicago.
 *  This avoids API issues with open-ended "current month" ranges. */
function toMonthYearFilter(filter) {
  if (filter?.month && filter?.year) return { month: filter.month, year: filter.year };
  if (filter?.start && filter?.end) {
    const m = formatInTimeZone(new Date(filter.start), TZ, "MMM");
    const y = parseInt(formatInTimeZone(new Date(filter.start), TZ, "yyyy"), 10);
    return { month: m, year: y };
  }
  return buildDefaultFilter();
}

const Purchases = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);
  const hasMountedRef = useRef(false);

  // ---- initial state (URL/LS) ----
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

  const [activeFilter, setActiveFilter] = useState(getInitialFilter());
  const [currentFilter, setCurrentFilter] = useState(getInitialFilter());

  const [page, setPage] = useState(getInitialPage());
  const [sortBy, setSortBy] = useState(getInitialSortBy());
  const [sortOrder, setSortOrder] = useState(getInitialSortOrder());

  const [searchInput, setSearchInput] = useState(getInitialSearch());
  const [appliedQuery, setAppliedQuery] = useState(getInitialSearch());

  const [hilite, setHilite] = useState(localStorage.getItem(LS_HILITE) || null);

  // ---- Fetch ALL pages via RTK Query (no axios) ----
  // IMPORTANT: always send month/year to API (normalized to CST) to avoid empty current-month results.
  const normalizedForApi = toMonthYearFilter(activeFilter);
  const queryArgs = useMemo(() => {
    const params = buildParams({
      filter: normalizedForApi, // <— normalized
      query: appliedQuery || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined,
    });
    return Object.fromEntries(params.entries());
  }, [normalizedForApi, appliedQuery, sortBy, sortOrder]);

  const {
    data: allOrders = [],
    isFetching,
    isLoading,
    error,
  } = useGetMonthlyOrdersAllQuery(queryArgs, { skip: !activeFilter });

  // Filter to only orders that include at least one "Card charged" yard
  const yardOrders = useMemo(
    () =>
      (allOrders || []).filter(
        (o) =>
          Array.isArray(o.additionalInfo) &&
          o.additionalInfo.some((ai) => ai?.paymentStatus === "Card charged")
      ),
    [allOrders]
  );

  // Compute rows + grand total from yardOrders
  const rows = useMemo(() => yardOrders.map(computeRow), [yardOrders]);
  const grandCardCharged = useMemo(() => computeGrandCardChargedUSD(yardOrders), [yardOrders]);

  // Search (client-side)
  const yardText = (row) =>
    (row.additionalInfo || [])
      .map((ai) => {
        const { type, amount } = parseShippingDetails(ai.shippingDetails);
        return [
          ai.yardName || "",
          ai.phone || "",
          ai.email || "",
          ai.paymentStatus || "",
          String(ai.partPrice ?? ""),
          type ? `${type}` : "",
          amount ? `${amount}` : "",
          String(ai.others ?? ""),
        ]
          .join(" ")
          .toLowerCase();
      })
      .join(" | ");

  const filtered = useMemo(() => {
    const q = (appliedQuery || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const orderNoHit = String(r.orderNo || "").toLowerCase().includes(q);
      const dateHit = formatDate(r.orderDate).toLowerCase().includes(q);
      const yardHit = yardText(r).includes(q);
      return orderNoHit || dateHit || yardHit;
    });
  }, [rows, appliedQuery]);

  // Sorting (client-side)
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

    const [type, idxStr] = sortBy.startsWith("yard-") ? sortBy.split("-") : [sortBy, null];

    const getVal = (row) => {
      switch (type) {
        case "orderNo":
          return (row.orderNo || "").toString().toLowerCase();
        case "orderDate": {
          const t = new Date(row.orderDate || 0).getTime();
          return Number.isFinite(t) ? t : 0;
        }
        case "yard": {
          const idx = Number(idxStr) || 0;
          const cell = row.additionalInfo?.[idx] || {};
          return (cell.yardName || `${cell.phone || ""} ${cell.email || ""}`)
            .toString()
            .toLowerCase();
        }
        case "totalPart":
          return row.totals.part;
        case "totalShipping":
          return row.totals.ship;
        case "others":
          return row.totals.others;
        case "refunds":
          return row.totals.refunds;
        case "overall":
          return row.totals.overallAfterRefund;
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

  // Pagination
  const totalRows = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows = sorted.slice(start, start + ROWS_PER_PAGE);

  // Dynamic yard columns (current page)
  const maxYardsOnPage = useMemo(
    () =>
      pageRows.reduce(
        (m, r) =>
          Math.max(m, Array.isArray(r.additionalInfo) ? r.additionalInfo.length : 0),
        0
      ),
    [pageRows]
  );

  // Footer sums (current page)
  const footer = useMemo(() => {
    return pageRows.reduce(
      (acc, r) => {
        acc.part += r.totals.part;
        acc.ship += r.totals.ship;
        acc.others += r.totals.others;
        return acc;
      },
      { part: 0, ship: 0, others: 0 }
    );
  }, [pageRows]);

  // Highlight persistence + auto-scroll
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
        const el = document.getElementById(`purch-row-${match._id || match.orderNo}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [pageRows, hilite]);

  // Keep saved page/filter/search/sort in URL + LS
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
    }

    localStorage.setItem(LS_PAGE, String(safePage));
    localStorage.setItem(LS_SORTBY, sortBy || "");
    localStorage.setItem(LS_SORTORDER, sortOrder || "");
    localStorage.setItem(LS_SEARCH, appliedQuery || "");
    writeFilterToLS(activeFilter);
    setCurrentFilter(activeFilter);

    const sp = new URLSearchParams(location.search);
    sp.set("page", String(safePage));
    if (appliedQuery?.trim()) sp.set("q", appliedQuery.trim());
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

  // Right rail controls
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
          setPage(1); // reset page only when user changes search
        }}
        onClear={() => {
          setSearchInput("");
          setAppliedQuery("");
          localStorage.removeItem(LS_SEARCH);
          setPage(1); // reset on clear
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
          setPage(1); // reset page when filter changes
        }}
      />
    </>
  );

  return (
    <StickyDataPage
      title="Purchases (Only card charged yards)"
      totalLabel={`Total Orders: ${totalRows} | Card Charged: $${grandCardCharged.toFixed(2)}`}
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
                <th
                  onClick={() => handleSort("orderNo")}
                  className={`${baseHeadClass} sticky left-0 top-0 bg-[#5c8bc1] z-50`}
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

                {Array.from({ length: maxYardsOnPage }).map((_, i) => (
                  <th
                    key={`yard-h-${i}`}
                    onClick={() => handleSort(`yard-${i}`)}
                    className={`${baseHeadClass}`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Yard {i + 1} <SortIcon name={`yard-${i}`} />
                    </div>
                  </th>
                ))}

                <th onClick={() => handleSort("totalPart")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Total Part Price <SortIcon name="totalPart" />
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
                <th onClick={() => handleSort("refunds")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Refunds ($) <SortIcon name="refunds" />
                  </div>
                </th>
                <th onClick={() => handleSort("overall")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Overall Purchase Cost ($) <SortIcon name="overall" />
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
                  <td colSpan={maxYardsOnPage + 8} className="p-6 text-center text-white/80">
                    No orders found.
                  </td>
                </tr>
              ) : (
                pageRows.map((row, idx) => {
                  const isHi = hilite === String(row.orderNo);
                  const yardCells = Array.from({ length: maxYardsOnPage }).map((_, i) => (
                    <YardCell key={`yard-${row.orderNo}-${i}`} ai={row.additionalInfo?.[i]} />
                  ));
                  return (
                    <tr
                      key={row._id || row.orderNo}
                      id={`purch-row-${row._id || row.orderNo}`}
                      onClick={() => toggleHighlight(row.orderNo)}
                      className={`transition text-sm cursor-pointer ${
                        isHi ? "bg-yellow-500/20 ring-2 ring-yellow-400" : idx % 2 === 0 ? "bg-white/10" : "bg-white/5"
                      } hover:bg-white/20`}
                    >
                      <td
                        className={`
                          ${baseCellClass} text-left sticky left-0 z-30
                          bg-gradient-to-r from-[#3788d9] via-[#553790] to-[#6969b5] text-[#e1ebeb]
                          dark:bg-[#1e1e1e] dark:text-[#e1ebeb] dark:bg-none
                        `}
                      >
                        {row.orderNo}
                      </td>
                      <td className={`${baseCellClass} text-left`}>{formatDate(row.orderDate)}</td>
                      {yardCells}
                      <td className={`${baseCellClass} text-left`}>${row.totals.part.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>${row.totals.ship.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>${row.totals.others.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>${row.totals.refunds.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>${row.totals.overallAfterRefund.toFixed(2)}</td>
                      <td className={`${baseCellClass} text-left`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Persist state before navigating
                            localStorage.setItem(LS_HILITE, String(row.orderNo));
                            localStorage.setItem(LS_PAGE, String(safePage));
                            localStorage.setItem(LS_SORTBY, sortBy || "");
                            localStorage.setItem(LS_SORTORDER, sortOrder || "");
                            localStorage.setItem(LS_SEARCH, appliedQuery || "");
                            try {
                              localStorage.setItem(LS_FILTER, JSON.stringify(activeFilter || {}));
                            } catch {}
                            navigate(`/order-details?orderNo=${encodeURIComponent(row.orderNo)}`);
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

            {/* Footer: matching first-col bg in dark mode + centered values */}
            {pageRows.length > 0 && (
              <tfoot className="sticky bottom-0 text-white z-30">
                <tr className="bg-gradient-to-r from-[#3788d9] via-[#553790] to-[#6969b5] dark:bg-[#1e1e1e] dark:bg-none">
                  {/* sticky blank for order no col */}
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
                  <td className="p-2.5 border-t border-white/30 text-center align-middle">
                    ${footer.part.toFixed(2)}
                  </td>
                  <td className="p-2.5 border-t border-white/30 text-center align-middle">
                    ${footer.ship.toFixed(2)}
                  </td>
                  <td className="p-2.5 border-t border-white/30 text-center align-middle">
                    ${footer.others.toFixed(2)}
                  </td>
                  {/* trailing blanks to align columns */}
                  <td className="p-2.5 border-t border-white/30 text-center align-middle" />
                  <td className="p-2.5 border-t border-white/30 text-center align-middle" />
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

export default Purchases;
