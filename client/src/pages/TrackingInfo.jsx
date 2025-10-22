// src/pages/TrackingInfo.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import StickyDataPage from "../layouts/StickyDataPage";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import SearchBar from "../components/SearchBar";

import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";

// Shared utils + styles
import {
  formatDateSafe,
  prettyFilterLabel,
  buildDefaultFilter,
} from "../utils/dateUtils";
import { buildParams } from "../utils/apiParams";
import { baseHeadClass, baseCellClass } from "../utils/tableStyles";

// RTK Query service
import { useGetMonthlyOrdersAllQuery } from "../services/monthlyOrdersApi";

const ROWS_PER_PAGE = 25;
const TZ = "America/Chicago";

// LS keys
const LS_PAGE = "tracking_page";
const LS_SEARCH = "tracking_search";
const LS_FILTER = "tracking_filter_v2";
const LS_SORTBY = "tracking_sortBy";
const LS_SORTDIR = "tracking_sortDir";
const LS_HILITE = "highlightedOrderNo";

// ---- filter helpers (same pattern as MonthlyOrders) ----
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

// --------- flatten each order's additionalInfo into multiple tracking rows ----------
function projectTrackingRows(order) {
  const out = [];
  const addl = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];

  addl.forEach((info) => {
    if (info.trackingNo && String(info.trackingNo).length > 0) {
      out.push({
        orderDate: order.orderDate,
        orderNo: order.orderNo,
        trackingLabel: "Tracking No",
        trackingValue: String(info.trackingNo),
        labelDate: Array.isArray(info.labelCreationDate) ? info.labelCreationDate[0] || "" : "",
        shipping: info.shippingDetails || "",
        shippedOn: info.partShippedDate || "",
        eta: info.eta || "",
        delivered: info.deliveredDate || "",
        voided: false,
      });
    }

    if (info.yardTrackingNumber) {
      out.push({
        orderDate: order.orderDate,
        orderNo: order.orderNo,
        trackingLabel: "Replacement Tracking (Yard)",
        trackingValue: String(info.yardTrackingNumber),
        labelDate: info.escRepYardTrackingDate || "",
        shipping: `${info.yardShippingMethod || ""} ${info.yardOwnShipping || ""}`.trim(),
        shippedOn: info.inTransitpartYardDate || "",
        eta: info.yardTrackingETA || "",
        delivered: info.yardDeliveredDate || "",
        voided: false,
      });
    }

    if (info.customerTrackingNumberReplacement) {
      out.push({
        orderDate: order.orderDate,
        orderNo: order.orderNo,
        trackingLabel: "Replacement Tracking (Cust)",
        trackingValue: String(info.customerTrackingNumberReplacement),
        labelDate: info.escRepCustTrackingDate || "",
        shipping: `${info.customerShippingMethodReplacement || ""} ${info.custOwnShipReplacement || ""}`.trim(),
        shippedOn: info.inTransitpartCustDate || "",
        eta: info.customerETAReplacement || "",
        delivered: info.repPartCustDeliveredDate || "",
        voided: false,
      });
    }

    if (info.returnTrackingCust) {
      out.push({
        orderDate: order.orderDate,
        orderNo: order.orderNo,
        trackingLabel: "Return Tracking",
        trackingValue: String(info.returnTrackingCust),
        labelDate: info.escRetTrackingDate || "",
        shipping: `${info.customerShippingMethodReturn || ""} ${info.custOwnShippingReturn || ""}`.trim(),
        shippedOn: info.inTransitReturnDate || "",
        eta: info.custretPartETA || "",
        delivered: info.returnDeliveredDate || "",
        voided: false,
      });
    }

    // Histories -> VOIDED rows
    if (Array.isArray(info.trackingHistory) && info.trackingHistory.length > 0) {
      const labelDates = (Array.isArray(info.labelCreationDate) ? info.labelCreationDate.slice(1) : []);
      info.trackingHistory.forEach((t, i) => {
        out.push({
          orderDate: order.orderDate,
          orderNo: order.orderNo,
          trackingLabel: "Tracking No",
          trackingValue: String(t),
          labelDate: labelDates[i] || "N/A",
          shipping: "",
          shippedOn: "",
          eta: "VOIDED",
          delivered: "",
          voided: true,
        });
      });
    }

    if (Array.isArray(info.escRepTrackingHistoryYard) && info.escRepTrackingHistoryYard.length > 0) {
      const labelDates = Array.isArray(info.escrepBOLhistoryYard) ? info.escrepBOLhistoryYard : [];
      info.escRepTrackingHistoryYard.forEach((t, i) => {
        out.push({
          orderDate: order.orderDate,
          orderNo: order.orderNo,
          trackingLabel: "Replacement Tracking No (Yard)",
          trackingValue: String(t),
          labelDate: labelDates[i] || "N/A",
          shipping: "",
          shippedOn: "",
          eta: "VOIDED",
          delivered: "",
          voided: true,
        });
      });
    }

    if (Array.isArray(info.escRepTrackingHistoryCust) && info.escRepTrackingHistoryCust.length > 0) {
      const labelDates = Array.isArray(info.escrepBOLhistoryCust) ? info.escrepBOLhistoryCust : [];
      info.escRepTrackingHistoryCust.forEach((t, i) => {
        out.push({
          orderDate: order.orderDate,
          orderNo: order.orderNo,
          trackingLabel: "Replacement Tracking No (Cust)",
          trackingValue: String(t),
          labelDate: labelDates[i] || "N/A",
          shipping: "",
          shippedOn: "",
          eta: "VOIDED",
          delivered: "",
          voided: true,
        });
      });
    }

    if (Array.isArray(info.escReturnTrackingHistory) && info.escReturnTrackingHistory.length > 0) {
      const labelDates = Array.isArray(info.escReturnBOLhistory) ? info.escReturnBOLhistory : [];
      info.escReturnTrackingHistory.forEach((t, i) => {
        out.push({
          orderDate: order.orderDate,
          orderNo: order.orderNo,
          trackingLabel: "Return Tracking No",
          trackingValue: String(t),
          labelDate: labelDates[i] || "N/A",
          shipping: "",
          shippedOn: "",
          eta: "VOIDED",
          delivered: "",
          voided: true,
        });
      });
    }
  });

  return out;
}

const TrackingInfo = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);

  // ---- initial state from URL/LS ----
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
  const getInitialSortBy = () => {
    const sp = new URLSearchParams(location.search);
    return sp.get("sortBy") || localStorage.getItem(LS_SORTBY) || "orderDate";
  };
  const getInitialSortDir = () => {
    const sp = new URLSearchParams(location.search);
    return sp.get("sortOrder") || localStorage.getItem(LS_SORTDIR) || "desc";
  };

  const [activeFilter, setActiveFilter] = useState(getInitialFilter());
  const [currentFilter, setCurrentFilter] = useState(getInitialFilter());

  const [page, setPage] = useState(getInitialPage());
  const [searchInput, setSearchInput] = useState(getInitialSearch());
  const [appliedQuery, setAppliedQuery] = useState(getInitialSearch());

  const [sortBy, setSortBy] = useState(getInitialSortBy());
  const [sortOrder, setSortOrder] = useState(getInitialSortDir());

  // NEW: highlight state (persisted)
  const [hilite, setHilite] = useState(localStorage.getItem(LS_HILITE) || null);

  // ---- background load via RTK Query ----
  const queryArgs = useMemo(() => {
    const params = buildParams({
      filter: activeFilter,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined,
      query: appliedQuery || undefined,
    });
    return Object.fromEntries(params.entries());
  }, [activeFilter, sortBy, sortOrder, appliedQuery]);

  const { data: allOrders = [], isLoading, isFetching, error } =
    useGetMonthlyOrdersAllQuery(queryArgs, { skip: !activeFilter });

  // ---- shape -> rows ----
  const trackingRows = useMemo(() => {
    const filteredOrders = (allOrders || []).filter(
      (o) =>
        Array.isArray(o.additionalInfo) &&
        o.additionalInfo.some(
          (info) => Array.isArray(info.labelCreationDate) && info.labelCreationDate.length > 0
        )
    );
    return filteredOrders.flatMap(projectTrackingRows);
  }, [allOrders]);

  // search
  const filtered = useMemo(() => {
    const q = (appliedQuery || "").trim().toLowerCase();
    if (!q) return trackingRows;
    return trackingRows.filter((r) => {
      const joined = [
        r.orderNo,
        formatDateSafe(r.orderDate),
        r.trackingLabel,
        r.trackingValue,
        r.labelDate,
        r.shipping,
        r.shippedOn,
        r.eta,
        r.delivered,
      ]
        .join(" ")
        .toLowerCase();
      return joined.includes(q);
    });
  }, [trackingRows, appliedQuery]);

  // sort
  const sorted = useMemo(() => {
    const val = (r) => {
      switch (sortBy) {
        case "orderNo":
          return String(r.orderNo || "").toLowerCase();
        case "orderDate": {
          const t = new Date(r.orderDate || 0).getTime();
          return Number.isFinite(t) ? t : 0;
        }
        case "tracking":
          return `${r.trackingLabel} ${r.trackingValue}`.toLowerCase();
        case "labelDate": {
          const t = new Date(r.labelDate || 0).getTime();
          return Number.isFinite(t) ? t : 0;
        }
        case "shipping":
          return String(r.shipping || "").toLowerCase();
        case "shippedOn": {
          const t = new Date(r.shippedOn || 0).getTime();
          return Number.isFinite(t) ? t : 0;
        }
        case "eta": {
          if (r.eta === "VOIDED") return -Infinity;
          const t = new Date(r.eta || 0).getTime();
          return Number.isFinite(t) ? t : 0;
        }
        case "delivered": {
          const t = new Date(r.delivered || 0).getTime();
          return Number.isFinite(t) ? t : 0;
        }
        default:
          return "";
      }
    };

    return [...filtered].sort((a, b) => {
      const A = val(a);
      const B = val(b);
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

  // sync URL + LS
  useEffect(() => {
    localStorage.setItem(LS_PAGE, String(safePage));
    localStorage.setItem(LS_SEARCH, appliedQuery || "");
    localStorage.setItem(LS_SORTBY, sortBy || "");
    localStorage.setItem(LS_SORTDIR, sortOrder || "");
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

    window.history.replaceState(null, "", `?${sp.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, appliedQuery, activeFilter, sortBy, sortOrder]);

  // NEW: toggle & persist highlight
  const toggleHighlight = (orderNo) => {
    setHilite((prev) => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      if (next) localStorage.setItem(LS_HILITE, next);
      else localStorage.removeItem(LS_HILITE);
      return next;
    });
  };

  // NEW: auto-scroll highlighted row when present on the current page
  useEffect(() => {
    if (!hilite || !pageRows?.length) return;
    const onPage = pageRows.find((r) => String(r.orderNo) === String(hilite));
    if (onPage) {
      // delay until DOM paint
      setTimeout(() => {
        const el = document.getElementById(`trk-row-${onPage.orderNo}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [pageRows, hilite]);

  const handleSort = (key) => {
    let nextBy = key;
    let nextDir = "asc";
    if (sortBy === key) nextDir = sortOrder === "asc" ? "desc" : "asc";
    setSortBy(nextBy);
    setSortOrder(nextDir);
    setPage(1);
  };

  const SortIcon = ({ name }) =>
    sortBy === name ? (sortOrder === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />) : <FaSort className="opacity-70 text-xs" />;

  if (isLoading) return <div className="p-6 text-center text-white">⏳ Loading…</div>;
  if (error) return <div className="p-6 text-center text-red-300">Failed to load data.</div>;

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
      title="Tracking Info"
      totalLabel={`Rows: ${totalRows}`}
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
        <div className="max-h-[82vh] overflow-y-auto scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
          <table className="min-w-[1200px] w-full bg-black/20 backdrop-blur-md text-white border-separate border-spacing-0">
            <thead className="sticky top-0 bg-[#5c8bc1] z-[60]">
              <tr>
                <th onClick={() => handleSort("orderDate")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Order Date <SortIcon name="orderDate" />
                  </div>
                </th>
                <th onClick={() => handleSort("orderNo")} className={`${baseHeadClass} sticky left-0 z-40`}>
                  <div className="flex items-center justify-center gap-1">
                    Order No <SortIcon name="orderNo" />
                  </div>
                </th>
                <th onClick={() => handleSort("tracking")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Tracking <SortIcon name="tracking" />
                  </div>
                </th>
                <th onClick={() => handleSort("labelDate")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Label Creation <SortIcon name="labelDate" />
                  </div>
                </th>
                <th onClick={() => handleSort("shipping")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Shipping <SortIcon name="shipping" />
                  </div>
                </th>
                <th onClick={() => handleSort("shippedOn")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Shipped On <SortIcon name="shippedOn" />
                  </div>
                </th>
                <th onClick={() => handleSort("eta")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    ETA <SortIcon name="eta" />
                  </div>
                </th>
                <th onClick={() => handleSort("delivered")} className={`${baseHeadClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    Delivered <SortIcon name="delivered" />
                  </div>
                </th>
                <th className={`${baseHeadClass}`}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-white/80">
                    No rows found.
                  </td>
                </tr>
              ) : (
                pageRows.map((r, idx) => {
                  const isHi = hilite === String(r.orderNo);
                  const trackingText = `${r.trackingLabel}: ${r.trackingValue}`;
                  return (
                    <tr
                      id={`trk-row-${r.orderNo}`}
                      key={`${r.orderNo}-${idx}`}
                      onClick={() => toggleHighlight(r.orderNo)}
                      className={`transition text-sm cursor-pointer ${
                        isHi
                          ? "bg-yellow-500/20 ring-2 ring-yellow-400"
                          : idx % 2 === 0
                          ? "bg-white/10"
                          : "bg-white/5"
                      } hover:bg-white/20`}
                    >
                      <td className={`${baseCellClass}`}>{formatDateSafe(r.orderDate)}</td>

                      {/* Sticky first data column (order no) — keep bg in sync */}
                      <td className={`${baseCellClass} sticky left-0 z-30 bg-inherit`}>{r.orderNo}</td>

                      <td className={`${baseCellClass}`}>{trackingText}</td>
                      <td className={`${baseCellClass}`}>{r.labelDate || ""}</td>
                      <td className={`${baseCellClass}`}>{r.shipping || ""}</td>
                      <td className={`${baseCellClass}`}>{r.shippedOn || ""}</td>
                      <td className={`${baseCellClass}`}>
                        {r.eta === "VOIDED" ? (
                          <span className="text-red-400 font-semibold">VOIDED</span>
                        ) : (
                          r.eta || ""
                        )}
                      </td>
                      <td className={`${baseCellClass}`}>{r.delivered || ""}</td>
                      <td className={`${baseCellClass}`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            localStorage.setItem(LS_HILITE, String(r.orderNo));
                            localStorage.setItem(LS_PAGE, String(safePage));
                            setHilite(String(r.orderNo));
                            navigate(`/order-details?orderNo=${encodeURIComponent(r.orderNo)}`);
                          }}
                          className="px-3 py-1 text-xs rounded bg-[#2c5d81] hover:bg-blue-700 text-white"
                          title="View Order"
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

      {isFetching && (
        <div className="p-2 text-center text-xs text-white/70">Updating…</div>
      )}
    </StickyDataPage>
  );
};

export default TrackingInfo;
