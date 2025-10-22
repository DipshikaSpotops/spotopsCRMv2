import React, { useEffect, useState } from "react";
import axios from "axios";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { formatInTimeZone } from "date-fns-tz";
import { FaSort, FaSortUp, FaSortDown, FaChevronLeft, FaChevronRight, FaTimes } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import moment from "moment-timezone";

/* ---------- constants ---------- */
const TZ = "America/Chicago";
const LS_PAGE_KEY   = "yardProcessingPage";
const LS_SEARCH_KEY = "yardProcessingSearch";
const LS_HILITE_KEY = "yardProcessingHighlightedOrderNo";
const LS_FILTER_KEY = "ypo_filter_v2";

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

const getLastSupportNoteFormatted = (order) => {
  const raw = order.lastComment ?? (() => {
    const arr = Array.isArray(order.supportNotes) ? order.supportNotes : [];
    if (!arr.length) return "";
    return String(arr[arr.length - 1] || "").trim();
  })();
  if (!raw) return "N/A";
  const words = raw.split(/\s+/);
  return words.reduce((acc, w, i) => acc + w + ((i + 1) % 5 === 0 ? "\n" : " "), "").trim();
};
/* -------------------------------- */

const YardProcessingOrders = () => {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.removeItem("udp_range");
    localStorage.removeItem("udp_shownDate");
    localStorage.removeItem("monthlyFilter");
  }, []);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");

  const [currentPage, setCurrentPage] = useState(parseInt(localStorage.getItem(LS_PAGE_KEY) || "1", 10));
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  // ✅ newest first
  const [sortBy, setSortBy] = useState("orderDate");
  const [sortOrder, setSortOrder] = useState("desc");

  const [searchInput, setSearchInput] = useState(localStorage.getItem(LS_SEARCH_KEY) || "");
  const [appliedQuery, setAppliedQuery] = useState(localStorage.getItem(LS_SEARCH_KEY) || "");

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [highlightedOrderNo, setHighlightedOrderNo] = useState(localStorage.getItem(LS_HILITE_KEY) || null);

  const [currentFilter, setCurrentFilter] = useState(readFilterFromLS() || buildDefaultFilter());

  /* persist page + filter */
  useEffect(() => {
    localStorage.setItem(LS_PAGE_KEY, String(currentPage));
  }, [currentPage]);
  useEffect(() => {
    try { localStorage.setItem(LS_FILTER_KEY, JSON.stringify(currentFilter || {})); } catch {}
  }, [currentFilter]);

  /* fetch orders */
  const fetchOrders = async (
    filter = {},
    page = 1,
    q = appliedQuery,
    sBy = sortBy,
    sDir = sortOrder,
    opts = { silent: false }
  ) => {
    try {
      if (!opts.silent && !loading) setLoading(true);
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
      if (sBy) params.set("sortBy", sBy);
      if (sDir) params.set("sortOrder", sDir);

      const url = `http://localhost:5000/orders/yardProcessingOrders?${params.toString()}`;
      const { data } = await axios.get(url);

      setOrders(data.orders || []);
      setTotalPages(data.totalPages || 1);
      setTotalOrders(data.totalOrders || 0);
      setCurrentPage(data.currentPage || page);
      setError("");
    } catch (err) {
      console.error("Error fetching yard processing orders:", err);
      setError("Failed to load orders.");
      setOrders([]);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  };

  /* effects */
  useEffect(() => {
    if (!currentFilter) return;
    fetchOrders(currentFilter, currentPage, appliedQuery, sortBy, sortOrder, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilter, currentPage, appliedQuery, sortBy, sortOrder]);

  useEffect(() => {
    setExpandedIds(appliedQuery.trim() ? new Set(orders.map(o => o._id)) : new Set());
  }, [orders, appliedQuery]);

  useEffect(() => {
    if (!highlightedOrderNo || !orders?.length) return;
    const match = orders.find(o => String(o.orderNo) === String(highlightedOrderNo));
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`row-${match._id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [orders, highlightedOrderNo]);

  /* helpers */
  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d)) return "Invalid Date";
    return formatInTimeZone(d, TZ, "do MMM, yyyy");
  };

  const handleSort = (field) => {
    if (field === "action") return;
    const nextSortBy = field;
    const nextSortOrder = sortBy === field ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setCurrentPage(1);
    fetchOrders(currentFilter || buildDefaultFilter(), 1, appliedQuery, nextSortBy, nextSortOrder, { silent: true });
  };

  const clearSearch = () => {
    setSearchInput("");
    setAppliedQuery("");
    localStorage.removeItem(LS_SEARCH_KEY);
    setCurrentPage(1);
    fetchOrders(currentFilter || buildDefaultFilter(), 1, "", sortBy, sortOrder, { silent: true });
  };

  const toggleRowExpansion = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* render */
  if (loading) return <div className="p-6 text-center text-white">⏳ Loading Orders...</div>;
  if (error)   return <div className="p-6 text-center text-red-300">{error}</div>;

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-3xl font-bold text-white underline decoration-1">Yard Processing Orders</h2>
          <div className="mt-1 flex items-center gap-4">
            <p className="text-sm text-white/70">Total Orders: <strong>{totalOrders}</strong></p>
            {currentFilter && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
                {prettyFilterLabel(currentFilter)}
              </span>
            )}
            <div className="flex items-center gap-2 text-white font-medium">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className={`px-3 py-1 rounded-full ${currentPage === 1 ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-gray-700 hover:bg-gray-600"}`}
              >
                <FaChevronLeft size={14} />
              </button>
              <span className="px-4 py-1 bg-gray-800 rounded-full text-sm shadow">
                Page <strong>{currentPage}</strong> of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className={`px-3 py-1 rounded-full ${currentPage === totalPages ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-gray-700 hover:bg-gray-600"}`}
              >
                <FaChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Search + Date Picker */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = searchInput.trim();
              setAppliedQuery(q);
              if (q) localStorage.setItem(LS_SEARCH_KEY, q);
              else localStorage.removeItem(LS_SEARCH_KEY);
              setCurrentPage(1);
              fetchOrders(currentFilter || buildDefaultFilter(), 1, q, sortBy, sortOrder, { silent: true });
            }}
            className="relative flex w-full sm:w-[280px]"
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search… (press Enter)"
              className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 w-full"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
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
              setCurrentFilter(next);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* Table */}
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
                  { key: "lastComment", label: "Last Comment" },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="p-3 text-left cursor-pointer border-r border-white/30 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortBy === col.key
                        ? (sortOrder === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />)
                        : <FaSort className="text-xs text-white/60" />}
                    </div>
                  </th>
                ))}
                <th className="p-3 text-left">Order Status</th>
                <th className="p-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order._id}
                  id={`row-${order._id}`}
                  onClick={() => setHighlightedOrderNo(order.orderNo)}
                  className={`transition text-sm cursor-pointer ${
                    highlightedOrderNo === String(order.orderNo)
                      ? "bg-yellow-500/20 ring-2 ring-yellow-400"
                      : "even:bg-white/5 odd:bg-white/10 hover:bg-white/20"
                  }`}
                >
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{formatDate(order.orderDate)}</td>
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{order.orderNo}</td>
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{order.pReq || "N/A"}</td>
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{order.salesAgent || "N/A"}</td>
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
                          <div className="mt-2 text-xs">
                            <div><b>Status:</b> {yard.status || "N/A"}</div>
                            <div><b>Expected Ship:</b> {yard.expShipDate || "N/A"}</div>
                            <div><b>Expedite:</b> {yard.expediteShipping === "true" ? "Yes" : "No"}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="p-2.5 border-r border-white/20 whitespace-pre-line">{getLastSupportNoteFormatted(order)}</td>
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{order.orderStatus || ""}</td>
                  <td className="p-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        localStorage.setItem(LS_HILITE_KEY, String(order.orderNo));
                        localStorage.setItem(LS_PAGE_KEY, String(currentPage));
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

export default YardProcessingOrders;
