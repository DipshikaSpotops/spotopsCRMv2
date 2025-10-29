// src/pages/InTransitOrders.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import axios from "axios";
import moment from "moment-timezone";
import { formatInTimeZone } from "date-fns-tz";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import StickyDataPage from "../layouts/StickyDataPage";
import DataTable from "../components/table/StickyTable";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import API from "../api";

const TZ = "America/Chicago";
const URL = `${API}/orders/inTransitOrders`;

const LS_PAGE_KEY   = "inTransitPage";
const LS_SEARCH_KEY = "inTransitSearch";
const LS_HILITE_KEY = "inTransitHighlightedOrderNo";
const LS_FILTER_KEY = "ito_filter_v1";       
const SCROLL_KEY    = "inTransitScrollTop";

const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const buildDefaultFilter = () => {
  const now = new Date();
  return { month: monthNames[now.getMonth()], year: now.getFullYear() };
};
const readFilterFromLS = () => {
  try {
    const raw = localStorage.getItem(LS_FILTER_KEY);
    if (!raw) return null;
    const f = JSON.parse(raw);
    if (f && ((f.month && f.year) || (f.start && f.end))) return f;
  } catch {}
  return null;
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

const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d)) return "Invalid Date";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
};

const InTransitOrders = () => {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.removeItem("udp_range");
    localStorage.removeItem("udp_shownDate");
    localStorage.removeItem("monthlyFilter");
  }, []);

  /* state */
  const contentRef = useRef(null); // <-- scrollbox ref inside StickyDataPage
  const [restoredScroll, setRestoredScroll] = useState(false);

  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [isFetching, setBusy]   = useState(false);
  const [error, setError]       = useState("");

  const [currentPage, setCurrentPage] = useState(
    parseInt(localStorage.getItem(LS_PAGE_KEY) || "1", 10)
  );
  const [totalPages, setTotalPages]   = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  // sort newest-oldest first by default
  const [sortBy, setSortBy]       = useState("orderDate");
  const [sortOrder, setSortOrder] = useState("desc");

  const [expandedIds, setExpandedIds] = useState(new Set());

  // controlled filter (namespaced in LS)
  const [currentFilter, setCurrentFilter] =
    useState(readFilterFromLS() || buildDefaultFilter());

  // search: typed vs applied (persist)
  const [searchInput, setSearchInput]   = useState(localStorage.getItem(LS_SEARCH_KEY) || "");
  const [appliedQuery, setAppliedQuery] = useState(localStorage.getItem(LS_SEARCH_KEY) || "");

  // highlight
  const [highlightedOrderNo, setHighlightedOrderNo] =
    useState(localStorage.getItem(LS_HILITE_KEY) || null);

  /* effects: persistence */
  useEffect(() => {
    localStorage.setItem(LS_PAGE_KEY, String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    try { localStorage.setItem(LS_FILTER_KEY, JSON.stringify(currentFilter || {})); } catch {}
  }, [currentFilter]);

  /* fetch */
  const fetchOrders = async (
    filter = {},
    page   = 1,
    q      = appliedQuery,
    sKey   = sortBy,
    sDir   = sortOrder,
    opts   = { silent: false }
  ) => {
    try {
      if (!opts.silent && !loading) setLoading(true);
      else setBusy(true);

      const params = new URLSearchParams();
      if (filter.start && filter.end) {
        params.set("start", filter.start);
        params.set("end", filter.end);
      } else if (filter.month && filter.year) {
        params.set("month", filter.month);
        params.set("year", filter.year);
      } else {
        const def = buildDefaultFilter();
        params.set("month", def.month);
        params.set("year", def.year);
      }
      params.set("page", String(page));
      if (q)      params.set("q", q);
      if (sKey)   params.set("sortBy", sKey);
      if (sDir)   params.set("sortOrder", sDir);

      const { data } = await axios.get(`${URL}?${params.toString()}`);

      setOrders(data.orders || []);
      setTotalPages(data.totalPages || 1);
      setTotalOrders(data.totalOrders || 0);
      setCurrentPage(data.currentPage || page);
      setError("");
    } catch (e) {
      console.error("Error fetching in-transit orders:", e);
      setError("Failed to load in-transit orders.");
      setOrders([]);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  };

  // refetch on deps
  useEffect(() => {
    if (!currentFilter) return;
    fetchOrders(currentFilter, currentPage, appliedQuery, sortBy, sortOrder, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilter, currentPage, appliedQuery, sortBy, sortOrder]);

  // expand all when searching; collapse when cleared
  useEffect(() => {
    const hasQuery = appliedQuery.trim().length > 0;
    setExpandedIds(hasQuery ? new Set(orders.map(o => o._id)) : new Set());
  }, [orders, appliedQuery]);

  // restore scroll first, then (if not restored) center highlight
  useLayoutEffect(() => {
    if (!orders?.length) return;

    const raw = sessionStorage.getItem(SCROLL_KEY);
    const box = contentRef.current;
    if (raw && box) {
      box.scrollTo({ top: parseInt(raw, 10) || 0, behavior: "auto" });
      sessionStorage.removeItem(SCROLL_KEY);
      setRestoredScroll(true);
    }
  }, [orders]);

  useEffect(() => {
    if (!highlightedOrderNo || !orders?.length) return;
    if (restoredScroll) return; // already exact-restored

    const match = orders.find(o => String(o.orderNo) === String(highlightedOrderNo));
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`row-${match._id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [orders, highlightedOrderNo, restoredScroll]);

  // safe bottom padding for horizontal scrollbar overlap guard
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      const h = Math.max(12, el.offsetHeight - el.clientHeight);
      el.style.setProperty("--sb", `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  /* ui helpers */
  const clearHighlight = () => {
    setHighlightedOrderNo(null);
    localStorage.removeItem(LS_HILITE_KEY);
  };

  const toggleHighlight = (orderNo) => {
    setHighlightedOrderNo(prev => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      if (next) localStorage.setItem(LS_HILITE_KEY, next);
      else localStorage.removeItem(LS_HILITE_KEY);
      return next;
    });
  };

  const handleSort = (field) => {
    if (field === "action") return;
    clearHighlight();
    const nextBy  = field;
    const nextDir = sortBy === field ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
    setSortBy(nextBy);
    setSortOrder(nextDir);
    setCurrentPage(1);
    fetchOrders(currentFilter || buildDefaultFilter(), 1, appliedQuery, nextBy, nextDir, { silent: true });
  };

  /* columns for DataTable */
  const columns = [
    { key: "orderDate",    label: "Order Date",    sortable: true },
    { key: "orderNo",      label: "Order No",      sortable: true },
    { key: "pReq",         label: "Part Name",     sortable: true },
    { key: "salesAgent",   label: "Sales Agent",   sortable: true },
    { key: "customerName", label: "Customer Name", sortable: true },
    { key: "yardName",     label: "Yard Details" },
    { key: "lastComment",  label: "Last Comment" },
    { key: "orderStatus",  label: "Order Status" },
    { key: "action",       label: "Action" },
  ];

  /* cell rendering */
  const cellRenderer = (order, key) => {
    if (key === "orderDate") return <span className="text-[#e1ebeb]">{formatDate(order.orderDate)}</span>;

    if (key === "orderNo") {
      return (
        <div className="flex justify-between items-center gap-x-2">
          <span>{order.orderNo}</span>
        </div>
      );
    }

    if (key === "pReq") return order.pReq || order.partName || "N/A";
    if (key === "salesAgent") return order.salesAgent || "N/A";
    if (key === "customerName")
      return order.customerName || `${order.fName || ""} ${order.lName || ""}` || "N/A";

    if (key === "yardName") {
      return (
        <div>
          {(order.additionalInfo || []).map((yard, i) => (
            <div key={i} className="mb-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{yard.yardName || "N/A"}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedIds(prev => {
                      const next = new Set(prev);
                      next.has(order._id) ? next.delete(order._id) : next.add(order._id);
                      return next;
                    });
                  }}
                  className="text-blue-400 text-xs underline hover:text-blue-300"
                >
                  {expandedIds.has(order._id) ? "Hide Details" : "Show Details"}
                </button>
              </div>
              {expandedIds.has(order._id) && (
                <div className="mt-2 text-sm">
                  {yard.trackingNo?.[0] && <div><b>Tracking:</b> {yard.trackingNo[0]}</div>}
                  {yard.status && <div><b>Status:</b> {yard.status}</div>}
                  {yard.expShipDate && <div><b>Expected Shipping:</b> {yard.expShipDate}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (key === "lastComment") {
      const raw =
        order.lastComment ??
        (() => {
          const arr = Array.isArray(order.supportNotes) ? order.supportNotes : [];
          if (!arr.length) return "";
          return String(arr[arr.length - 1] || "").trim();
        })();
      if (!raw) return "N/A";
      const words = raw.split(/\s+/);
      return (
        <span className="whitespace-pre-line">
          {words.reduce((acc, w, i) => acc + w + ((i + 1) % 5 === 0 ? "\n" : " "), "").trim()}
        </span>
      );
    }

    if (key === "orderStatus") return order.orderStatus || "";

    if (key === "action") {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            // save scroll (fixes small jump when coming back)
            const box = contentRef.current;
            if (box) {
              sessionStorage.setItem(SCROLL_KEY, String(box.scrollTop || 0));
            }
            // persist highlight + page so we restore on back
            localStorage.setItem(LS_HILITE_KEY, String(order.orderNo));
            localStorage.setItem(LS_PAGE_KEY, String(currentPage));
            setHighlightedOrderNo(String(order.orderNo));
            navigate(`/order-details?orderNo=${encodeURIComponent(order.orderNo)}`);
          }}
          className="px-3 py-1 text-xs rounded bg-[#2c5d81] hover:bg-blue-700 text-white"
        >
          View
        </button>
      );
    }

    // default
    return String(order[key] ?? "");
  };

  /* header right controls (search + datepicker) */
  const rightControls = (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = searchInput.trim();
          const base = currentFilter || buildDefaultFilter();
          if (q) localStorage.setItem(LS_SEARCH_KEY, q);
          else localStorage.removeItem(LS_SEARCH_KEY);
          setAppliedQuery(q);
          setCurrentPage(1);
          fetchOrders(base, 1, q, sortBy, sortOrder, { silent: true });
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
              localStorage.removeItem(LS_SEARCH_KEY);
              setCurrentPage(1);
              fetchOrders(currentFilter || buildDefaultFilter(), 1, "", sortBy, sortOrder, { silent: true });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSearchInput("");
              setAppliedQuery("");
              localStorage.removeItem(LS_SEARCH_KEY);
              setCurrentPage(1);
              fetchOrders(currentFilter || buildDefaultFilter(), 1, "", sortBy, sortOrder, { silent: true });
            }
          }}
          placeholder="Search… (press Enter)"
          className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 min-w-[260px]"
          aria-label="Search in-transit orders"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setAppliedQuery("");
              localStorage.removeItem(LS_SEARCH_KEY);
              setCurrentPage(1);
              fetchOrders(currentFilter || buildDefaultFilter(), 1, "", sortBy, sortOrder, { silent: true });
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
        <input type="submit" hidden />
      </form>

      <UnifiedDatePicker
        key={JSON.stringify(currentFilter)}
        value={currentFilter}
        onFilterChange={(filter) => {
          const next = filter && Object.keys(filter).length ? filter : buildDefaultFilter();
          setCurrentFilter(next);
          setCurrentPage(1);
          // fetch occurs via effect on currentFilter
        }}
      />
    </>
  );

  if (loading) return <div className="p-6 text-center text-white">⏳ Loading Orders...</div>;
  if (error)   return <div className="p-6 text-center text-red-300">{error}</div>;

  return (
    <StickyDataPage
      title="In Transit Orders"
      totalLabel={`Total Orders: ${totalOrders}`}
      badge={
        currentFilter && (
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
            {prettyFilterLabel(currentFilter)}
          </span>
        )
      }
      page={currentPage}
      totalPages={totalPages}
      onPrevPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
      onNextPage={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
      rightControls={rightControls}
      contentRef={contentRef} // StickyDataPage should forward this to its scrollbox
    >
      <DataTable
        columns={columns}
        rows={orders}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        cellRenderer={(row, key) => (
          <div
            className={`${
              key !== "action" ? "border-r border-white/20" : ""
            } whitespace-nowrap`}
            onClick={() => toggleHighlight(row.orderNo)}
          >
            {cellRenderer(row, key)}
          </div>
        )}
        rowRenderer={(row, i) => {
          const isHi = highlightedOrderNo === String(row.orderNo);
          return (
            <tr
              key={row._id}
              id={`row-${row._id}`}
              className={`transition text-sm cursor-pointer ${
                isHi ? "bg-yellow-500/20 ring-2 ring-yellow-400"
                     : i % 2 === 0 ? "bg-white/10" : "bg-white/5"
              } hover:bg-white/20`}
              onClick={() => toggleHighlight(row.orderNo)}
            >
              {columns.map((c) => (
                <td key={c.key} className="p-2.5 align-top">
                  {cellRenderer(row, c.key)}
                </td>
              ))}
            </tr>
          );
        }}
      />

      {isFetching && (
        <div className="p-2 text-center text-white/70 text-xs">Updating…</div>
      )}
    </StickyDataPage>
  );
};

export default InTransitOrders;
