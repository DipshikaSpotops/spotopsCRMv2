import React, { useEffect, useState } from "react";
import API from "../api";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { formatInTimeZone } from "date-fns-tz";
import { FaSort, FaSortDown, FaSortUp, FaChevronLeft, FaChevronRight, FaTimes } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import moment from "moment-timezone";

/* ---------- constants & helpers ---------- */
const TZ = "America/Chicago";
const LS_PAGE = "inTransitOrdersPage";
const LS_SEARCH = "inTransitOrdersSearch";
const LS_HILITE = "inTransitHighlightedOrderNo";
const LS_FILTER = "ito_filter_v2";

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
/* ---------------------------------------- */

const InTransitOrders = () => {
  const navigate = useNavigate();
  const location = useLocation();

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

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");

  const [currentPage, setCurrentPage] = useState(getInitialPage());
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  const [sortBy, setSortBy] = useState(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("sortBy") || "orderDate";
  });
  const [sortOrder, setSortOrder] = useState(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("sortOrder") || "desc"; // newest → oldest default
  });

  const [searchInput, setSearchInput] = useState(getInitialSearch());
  const [appliedQuery, setAppliedQuery] = useState(getInitialSearch());

  const [activeFilter, setActiveFilter] = useState(getInitialFilter());
  const [currentFilter, setCurrentFilter] = useState(getInitialFilter());

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [highlightedOrderNo, setHighlightedOrderNo] = useState(localStorage.getItem(LS_HILITE) || null);

  const toggleHighlight = (orderNo) => {
    setHighlightedOrderNo((prev) => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      if (next) localStorage.setItem(LS_HILITE, next);
      else localStorage.removeItem(LS_HILITE);
      return next;
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    if (isNaN(date)) return "Invalid Date";
    return formatInTimeZone(date, TZ, "do MMM, yyyy");
  };

  const fetchOrders = async (
    filter = {},
    page = 1,
    q = "",
    sortKey = sortBy,
    sortDir = sortOrder,
    options = { silent: false }
  ) => {
    try {
      if (!hasLoadedOnce && !options.silent) setLoading(true);
      else setIsFetching(true);

      const params = new URLSearchParams();

      if (filter?.start && filter?.end) {
        params.set("start", filter.start);
        params.set("end", filter.end);
      } else if (filter?.month && filter?.year) {
        params.set("month", filter.month);
        params.set("year", filter.year);
      } else {
        const def = buildDefaultFilter();
        params.set("month", def.month);
        params.set("year", def.year);
      }

      params.set("page", String(page));
      if (q) params.set("q", q);
      if (sortKey) params.set("sortBy", sortKey);
      if (sortDir) params.set("sortOrder", sortDir);

      const { data } = await API.get(`/orders/inTransitOrders?${params.toString()}`);
      setOrders(data.orders || []);
      setTotalPages(data.totalPages || 1);
      setTotalOrders(data.totalOrders || 0);
      setCurrentPage(data.currentPage || page);
    } catch (err) {
      console.error("Error fetching in-transit orders:", err);
      setError("Failed to load in-transit orders.");
    } finally {
      setLoading(false);
      setIsFetching(false);
      setHasLoadedOnce(true);
    }
  };

  // Fetch on deps
  useEffect(() => {
    if (!activeFilter) return;
    fetchOrders(activeFilter, currentPage, appliedQuery, sortBy, sortOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, currentPage, appliedQuery, sortBy, sortOrder]);

  // Persist page + q + filter + sort to URL + LS
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

  // Expand all rows when searching
  useEffect(() => {
    const hasQuery = appliedQuery.trim().length > 0;
    setExpandedIds(hasQuery ? new Set(orders.map((o) => o._id)) : new Set());
  }, [orders, appliedQuery]);

  const handleSort = (field) => {
    if (field === "action") return;
    let nextSortBy = field;
    let nextSortOrder = "asc";
    if (sortBy === field) nextSortOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);

    const base = activeFilter || buildDefaultFilter();
    setCurrentPage(1);
    fetchOrders(base, 1, appliedQuery, nextSortBy, nextSortOrder, { silent: true });
  };

  const toggleRowExpansion = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="p-6 text-center text-white">⏳ Loading Orders...</div>;
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  return (
    <div className="min-h-screen p-6">
      <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-3xl font-bold text-white underline decoration-1">In Transit Orders</h2>
          <div className="mt-1 flex items-center gap-4">
            <p className="text-sm text-white/70">
              Total Orders: <strong>{totalOrders}</strong>
            </p>

            {currentFilter && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
                {prettyFilterLabel(currentFilter)}
              </span>
            )}

            <div className="flex items-center gap-2 text-white font-medium">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className={`px-3 py-1 rounded-full transition ${
                  currentPage === 1 ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-gray-700 hover:bg-gray-600"
                }`}
                aria-label="Previous page"
              >
                <FaChevronLeft size={14} />
              </button>
              <span className="px-4 py-1 bg-gray-800 rounded-full text-sm shadow">
                Page <strong>{currentPage}</strong> of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className={`px-3 py-1 rounded-full transition ${
                  currentPage === totalPages ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-gray-700 hover:bg-gray-600"
                }`}
                aria-label="Next page"
              >
                <FaChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          {/* Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = searchInput.trim();
              const base = currentFilter || activeFilter || buildDefaultFilter();
              localStorage.setItem(LS_SEARCH, q);
              setAppliedQuery(q);
              setCurrentPage(1);
              fetchOrders(base, 1, q, sortBy, sortOrder, { silent: true });
            }}
            className="relative flex w-full sm:w-auto"
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search…(press Enter)"
              className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 min-w-[260px]"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  const base = currentFilter || activeFilter || buildDefaultFilter();
                  setSearchInput("");
                  setAppliedQuery("");
                  localStorage.removeItem(LS_SEARCH);
                  setCurrentPage(1);
                  fetchOrders(base, 1, "", sortBy, sortOrder, { silent: true });
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
              >
                <FaTimes />
              </button>
            )}
            <input type="submit" hidden />
          </form>

          {/* Date Picker */}
          <UnifiedDatePicker
            key={JSON.stringify(currentFilter)}
            value={currentFilter}
            onFilterChange={(filter) => {
              const nextFilter = filter && Object.keys(filter).length ? filter : buildDefaultFilter();
              setActiveFilter(nextFilter);
              setCurrentFilter(nextFilter);
              setCurrentPage(1);
              fetchOrders(nextFilter, 1, appliedQuery, sortBy, sortOrder, { silent: true });
            }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="max-h-[80vh] overflow-y-auto scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
          <table className="min-w-[1200px] w-full bg-black/20 backdrop-blur-md text-white">
            <thead className="sticky top-0 bg-[#5c8bc1] z-20">
              <tr>
                {[
                  { key: "orderDate", label: "Order Date" },
                  { key: "orderNo", label: "Order No" },
                  { key: "pReq", label: "Part Name" },
                  { key: "salesAgent", label: "Sales Agent" },
                  { key: "customerName", label: "Customer Name" },
                  { key: "yardName", label: "Yard Details" },
                  { key: "orderStatus", label: "Order Status" },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="p-3 text-left cursor-pointer border-r border-white/30 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortBy === col.key
                        ? sortOrder === "asc"
                          ? <FaSortUp className="text-xs" />
                          : <FaSortDown className="text-xs" />
                        : <FaSort className="text-xs text-white/60" />}
                    </div>
                  </th>
                ))}
                <th className="p-3 text-left">Action</th>
              </tr>
            </thead>

            <tbody>
              {orders.map((order) => (
                <tr
                  key={order._id}
                  id={`row-${order._id}`}
                  onClick={() => toggleHighlight(order.orderNo)}
                  className={`transition text-sm cursor-pointer ${
                    highlightedOrderNo === String(order.orderNo)
                      ? "bg-yellow-500/20 ring-2 ring-yellow-400"
                      : "even:bg-white/5 odd:bg-white/10 hover:bg-white/20"
                  }`}
                >
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{formatDate(order.orderDate)}</td>
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{order.orderNo}</td>
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{order.pReq || "N/A"}</td>
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{order.salesAgent}</td>
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{order.customerName || `${order.fName || ""} ${order.lName || ""}`}</td>
                  <td className="p-2.5 border-r border-white/20">
                    {(order.additionalInfo || []).map((yard, i) => (
                      <div key={i} className="mb-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{yard.yardName || "N/A"}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowExpansion(order._id);
                            }}
                            className="text-blue-400 text-xs underline hover:text-blue-300"
                          >
                            {expandedIds.has(order._id) ? "Hide Details" : "Show Details"}
                          </button>
                        </div>
                        {expandedIds.has(order._id) && (
                          <div className="mt-2 text-xs text-bodyText">
                            <div><b>Status:</b> {yard.status || "N/A"}</div>
                            <div><b>Expected Shipping:</b> {yard.expShipDate || "N/A"}</div>
                            <div><b>Expedite:</b> {yard.expediteShipping === "true" ? "Yes" : "No"}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{order.orderStatus || ""}</td>
                  <td className="p-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        localStorage.setItem(LS_HILITE, String(order.orderNo));
                        localStorage.setItem(LS_PAGE, String(currentPage));
                        setHighlightedOrderNo(String(order.orderNo));
                        navigate(`/order-details?orderNo=${encodeURIComponent(order.orderNo)}`);
                      }}
                      className="px-3 py-1 text-xs rounded bg-[#2c5d81] hover:bg-blue-700 text-white"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {isFetching && <div className="p-2 text-center text-xs text-white/70">Updating…</div>}
        </div>
      </div>
    </div>
  );
};

export default InTransitOrders;
