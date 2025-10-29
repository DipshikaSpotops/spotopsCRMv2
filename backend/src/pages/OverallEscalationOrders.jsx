import React, { useEffect, useState } from "react";
import API from "../api";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { formatInTimeZone } from "date-fns-tz";
import { FaSort, FaSortDown, FaSortUp, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import useSort from "../hooks/useSort";
import moment from "moment-timezone";

const prettyFilterLabel = (filter) => {
  if (!filter) return "";
  if (filter.month && filter.year) return `${filter.month} ${filter.year}`;

  if (filter.start && filter.end) {
    const TZ = "America/Chicago";
    const s = moment.tz(filter.start, TZ);
    const e = moment.tz(filter.end, TZ);
    if (s.isSame(s.clone().startOf("month")) && e.isSame(s.clone().endOf("month"))) {
      return s.format("MMM YYYY");
    }
    return `${s.format("D MMM YYYY")} – ${e.format("D MMM YYYY")}`;
  }
  return "";
};

const OverallEscalationOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  const [currentFilter, setCurrentFilter] = useState(null);

  // multi-expand so search can open all
  const [expandedIds, setExpandedIds] = useState(new Set());

  // search state (persist if you like)
  const [searchInput, setSearchInput] = useState(localStorage.getItem("overallEscSearch") || "");
  const [appliedQuery, setAppliedQuery] = useState(localStorage.getItem("overallEscSearch") || "");

  // client-side sorter (for non-server fields)
  const { sortBy, sortOrder, handleSort: handleClientSort, sortData, setSortKey, setSortDir } = useSort();

  // server sort state (only used for orderDate/orderNo)
  const [serverSortBy, setServerSortBy] = useState("orderDate");
  const [serverSortOrder, setServerSortOrder] = useState("desc");

  const buildDefaultFilter = () => {
    const now = new Date();
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return { month: monthNames[now.getMonth()], year: now.getFullYear() };
  };

  // fetch with optional q + server sort
  const fetchOrders = async (filter = {}, page = 1, q = "", sBy = serverSortBy, sOrder = serverSortOrder) => {
    try {
      if (!hasLoadedOnce) setLoading(true); else setIsFetching(true);

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
      if (q) params.set("q", q);

      // always send server sort so orderDate/orderNo work across pages;
      // backend will ignore unknown fields safely (we only pass two below)
      params.set("sortBy", sBy);
      params.set("sortOrder", sOrder);

      const { data } = await API.get(`/orders/overallEscalationOrders?${params.toString()}`);

      // compute UI-only fields
      const processed = (data.orders || []).map((order) => {
        const yardName = order.additionalInfo?.[0]?.yardName || "N/A";
        const refundAmount = parseFloat(order.custRefAmount || 0);
        const escalationStatus = order.additionalInfo?.[0]?.escTicked === "Yes" ? "Yes" : "";

        return {
          ...order,
          yardName,
          refundAmount,
          escalationStatus,
        };
      });

      setOrders(processed);
      setTotalOrders(data.totalOrders || processed.length);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(data.currentPage || page);
    } catch (err) {
      console.error("Error fetching overall escalation orders:", err);
      setError("Failed to load overall escalations.");
    } finally {
      setLoading(false);
      setIsFetching(false);
      setHasLoadedOnce(true);
    }
  };

  // init default filter once
  useEffect(() => {
    if (currentFilter === null) setCurrentFilter(buildDefaultFilter());
  }, [currentFilter]);

  // refetch when filter/page/q/server sort changes
  useEffect(() => {
    if (currentFilter) {
      fetchOrders(currentFilter, currentPage, appliedQuery, serverSortBy, serverSortOrder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilter, currentPage, appliedQuery, serverSortBy, serverSortOrder]);

  // expand all when searching; collapse when cleared
  useEffect(() => {
    const hasQuery = appliedQuery.trim().length > 0;
    setExpandedIds(hasQuery ? new Set(orders.map(o => o._id)) : new Set());
  }, [orders, appliedQuery]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d)) return "Invalid Date";
    return formatInTimeZone(d, "America/Chicago", "do MMM, yyyy");
  };

  const toggleRowExpansion = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // click header: if orderDate/orderNo → server sort; else client sort
  const handleHeaderSort = (key) => {
    if (key === "orderDate" || key === "orderNo") {
      const nextOrder =
        serverSortBy === key ? (serverSortOrder === "asc" ? "desc" : "asc") : "asc";
      setServerSortBy(key);
      setServerSortOrder(nextOrder);
      // reset client sorter visual to match header
      setSortKey(key);
      setSortDir(nextOrder);
      // jump to first page so sort makes sense globally
      setCurrentPage(1);
    } else {
      // purely client-side sort for other fields
      handleClientSort(key);
    }
  };

  if (loading) return <div className="p-6 text-center text-white">⏳ Loading Orders...</div>;
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  // Client-side sort for non-server columns; since server already sorted for orderDate/orderNo,
  // this will keep order for those keys as-is.
  const sortedOrders = sortData(orders);

  return (
    <div className="min-h-screen p-6">
      {/* Header + Pagination + Filter */}
      <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* LEFT: title + meta */}
        <div className="flex flex-col">
          <h2 className="text-3xl font-bold text-white underline decoration-1">
            Overall Escalations
          </h2>

          <div className="mt-1 flex items-center gap-4">
            <p className="text-sm text-white/70">
              Total Orders: <strong>{totalOrders}</strong>
            </p>
            {currentFilter && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
                {prettyFilterLabel(currentFilter)}
              </span>
            )}
            {/* Pager */}
            <div className="flex items-center gap-2 text-white font-medium">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className={`px-3 py-1 rounded-full transition ${
                  currentPage === 1 ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-gray-700 hover:bg-gray-600"
                }`}
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
              >
                <FaChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Search + Date Filter */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          {/* Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = searchInput.trim();
              localStorage.setItem("overallEscSearch", q);
              setAppliedQuery(q);
              setCurrentPage(1);
              fetchOrders(currentFilter || buildDefaultFilter(), 1, q, serverSortBy, serverSortOrder);
            }}
            className="relative flex w-full sm:w-auto"
          >
            <input
              value={searchInput}
              onChange={(e) => {
                const v = e.target.value;
                setSearchInput(v);
                if (v.trim() === "" && appliedQuery !== "") {
                  localStorage.removeItem("overallEscSearch");
                  setAppliedQuery("");
                  setCurrentPage(1);
                  fetchOrders(currentFilter || buildDefaultFilter(), 1, "", serverSortBy, serverSortOrder);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  const base = currentFilter || buildDefaultFilter();
                  setSearchInput("");
                  setAppliedQuery("");
                  localStorage.removeItem("overallEscSearch");
                  setCurrentPage(1);
                  fetchOrders(base, 1, "", serverSortBy, serverSortOrder);
                }
              }}
              placeholder="Search… (press Enter)"
              className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 min-w-[260px]"
              aria-label="Search overall escalations"
            />
            {!!searchInput && (
              <button
                type="button"
                onClick={() => {
                  const base = currentFilter || buildDefaultFilter();
                  setSearchInput("");
                  setAppliedQuery("");
                  localStorage.removeItem("overallEscSearch");
                  setCurrentPage(1);
                  fetchOrders(base, 1, "", serverSortBy, serverSortOrder);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
            <input type="submit" hidden />
          </form>

          {/* Date picker */}
          <UnifiedDatePicker
            onFilterChange={(filter) => {
              const nextFilter = filter && Object.keys(filter).length ? filter : buildDefaultFilter();
              setCurrentFilter(nextFilter);
              setCurrentPage(1);
              fetchOrders(nextFilter, 1, appliedQuery, serverSortBy, serverSortOrder);
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
                  { key: "escalationStatus", label: "Escalation Status" },
                  { key: "orderStatus", label: "Order Status" },
                ].map((col) => {
                  const isServerKey = col.key === "orderDate" || col.key === "orderNo";
                  const active = (isServerKey ? serverSortBy : sortBy) === col.key;
                  const dir = isServerKey ? serverSortOrder : sortOrder;

                  return (
                    <th
                      key={col.key}
                      onClick={() => handleHeaderSort(col.key)}
                      className="p-3 text-left text-tHead cursor-pointer border-r border-white/30 whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {active ? (
                          dir === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />
                        ) : (
                          <FaSort className="text-xs text-white/60" />
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="p-3 text-left font-poppins text-tHead">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedOrders.map((order) => (
                <tr
                  key={order._id}
                  className="even:bg-white/5 odd:bg-white/10 hover:bg-white/20 transition text-sm"
                >
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                    {formatDate(order.orderDate)}
                  </td>

                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-bodyText">
                    <div className="flex justify-between items-center gap-x-2">
                      <span>{order.orderNo}</span>
                      <button
                        onClick={() => toggleRowExpansion(order._id)}
                        className="text-blue-400 text-xs underline hover:text-blue-300"
                      >
                        {expandedIds.has(order._id) ? "Hide Details" : "Show Details"}
                      </button>
                    </div>
                  </td>

                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-bodyText text-sm text-white/90">
                    <div>
                      <div className="flex justify-between items-center whitespace-nowrap text-bodyText">
                        <span>{order.pReq || order.partName || "N/A"}</span>
                      </div>
                      {expandedIds.has(order._id) && (
                        <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                          <b>{order.year} {order.make} {order.model}</b>
                          <div><b>Desc:</b> {order.desc}</div>
                          <div><b>Part No:</b> {order.partNo}</div>
                          <div><b>VIN:</b> {order.vin}</div>
                          <div><b>Warranty:</b> {order.warranty} days</div>
                          <div><b>Programming:</b> {order.programmingRequired ? "Yes" : "No"}</div>
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-bodyText">
                    {order.salesAgent || "N/A"}
                  </td>

                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-bodyText text-sm text-white/90">
                    <div>
                      <div className="flex justify-between items-center text-bodyText">
                        <span>
                          {order.customerName || `${order.fName || ""} ${order.lName || ""}` || "N/A"}
                        </span>
                      </div>
                      {expandedIds.has(order._id) && (
                        <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                          <div><b>Email:</b> {order.email}</div>
                          <div><b>Phone:</b> {order.phone}</div>
                          <div>
                            <b>Address:</b> {order.sAddressStreet}, {order.sAddressCity}, {order.sAddressState}, {order.sAddressZip}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>

                  <td
                    className={[
                      "p-2.5 border-r border-white/20 whitespace-nowrap",
                      order.orderStatus === "Order Fulfilled" && order.escalationStatus === "Yes"
                        ? "bg-green-200/40 text-green-900 font-medium rounded"
                        : order.orderStatus === "Order Cancelled"
                        ? "bg-red-200/40 text-red-900 font-medium rounded"
                        : order.orderStatus === "Dispute"
                        ? "bg-orange-200/40 text-orange-900 font-medium rounded"
                        : order.orderStatus === "Refunded"
                        ? "bg-purple-200/40 text-purple-900 font-medium rounded"
                        : "text-bodyText",
                    ].join(" ")}
                  >
                    {order.escalationStatus}
                  </td>

                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-bodyText">
                    {order.orderStatus || ""}
                  </td>

                  <td className="p-2.5">
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1 text-xs rounded bg-[#2c5d81] hover:bg-blue-700 text-white">
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {isFetching && (
                <tr>
                  <td colSpan={8} className="p-3 text-center text-white/70">Refreshing…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OverallEscalationOrders;
