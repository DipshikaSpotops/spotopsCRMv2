import React, { useEffect, useRef, useState, useCallback } from "react";
import API from "../api";
import { formatInTimeZone } from "date-fns-tz";
import { FaSort, FaSortUp, FaSortDown, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import StickyXScrollbar from "../components/StickyXScrollbar";

const rowsPerPage = 25;

const AllOrders = () => {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);        // big loader (first load only)
  const [isFetching, setIsFetching] = useState(false); // tiny/silent fetch for sort/page/search
  const [error, setError] = useState("");

  const [currentPage, setCurrentPage] = useState(parseInt(localStorage.getItem("viewAllOrdersPage") || "1", 10));
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  const [sortBy, setSortBy] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc");

  // search: input (what user is typing) vs applied (what query is in effect)
  const [searchInput, setSearchInput] = useState(localStorage.getItem("viewAllOrdersSearch") || "");
  const [appliedQuery, setAppliedQuery] = useState(localStorage.getItem("viewAllOrdersSearch") || "");

  // expand rows automatically on search
  const [expandedIds, setExpandedIds] = useState(new Set());

  // highlight state
  const [highlightedOrderNo, setHighlightedOrderNo] = useState(localStorage.getItem("highlightedOrderNo") || null);
  const toggleHighlight = (orderNo) => {
    setHighlightedOrderNo((prev) => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      localStorage.setItem("highlightedOrderNo", next || "");
      return next;
    });
  };

  // -----------------------------------------------------------------------
  const fetchOrders = async (page = 1, q = appliedQuery, sBy = sortBy, sDir = sortOrder, opts = { silent: false }) => {
    try {
      if (!opts.silent && loading === false) setLoading(true);
      if (opts.silent) setIsFetching(true);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(rowsPerPage));
      if (q) params.set("searchTerm", q);
      if (sBy) params.set("sortBy", sBy);
      if (sDir) params.set("sortOrder", sDir);

      const { data } = await API.get("/orders/ordersPerPage", { params });

      setOrders(data.orders || []);
      setTotalPages(data.totalPages || 1);
      setTotalOrders(data.totalCount || 0);
      setCurrentPage(data.currentPage || page);
      localStorage.setItem("viewAllOrdersPage", String(data.currentPage || page));
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError("Failed to load orders.");
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  };

  // initial load + whenever currentPage or appliedQuery changes
  useEffect(() => {
    fetchOrders(currentPage, appliedQuery, sortBy, sortOrder, { silent: currentPage !== 1 || !!appliedQuery || !!sortBy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, appliedQuery, sortBy, sortOrder]);

  // auto-expand on applied search; collapse when cleared
  useEffect(() => {
    setExpandedIds(appliedQuery.trim() ? new Set(orders.map((o) => o._id)) : new Set());
  }, [orders, appliedQuery]);

  // scroll to highlighted row after data loads
  useEffect(() => {
    if (!highlightedOrderNo || !orders?.length) return;
    const match = orders.find((o) => String(o.orderNo) === String(highlightedOrderNo));
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`row-${match._id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [orders, highlightedOrderNo]);

  // -----------------------------------------------------------------------
  const handleSort = (field) => {
    if (field === "action") return;
    const nextSortBy = field;
    const nextSortOrder = sortBy === field ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setCurrentPage(1);
    fetchOrders(1, appliedQuery, nextSortBy, nextSortOrder, { silent: true });
  };

  // search handlers (Enter to apply; backspace-to-clear triggers clear when empty)
  const onSearchChange = (e) => {
    const v = e.target.value;
    setSearchInput(v);
    if (v.trim() === "" && appliedQuery !== "") {
      // user cleared with backspace → clear applied query
      setAppliedQuery("");
      localStorage.removeItem("viewAllOrdersSearch");
      setCurrentPage(1);
      fetchOrders(1, "", sortBy, sortOrder, { silent: true });
    }
  };

  const onSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      const q = searchInput.trim();
      setAppliedQuery(q);
      if (q) localStorage.setItem("viewAllOrdersSearch", q);
      else localStorage.removeItem("viewAllOrdersSearch");
      setCurrentPage(1);
      fetchOrders(1, q, sortBy, sortOrder, { silent: true });
    }
    if (e.key === "Escape") {
      // quick clear
      setSearchInput("");
      setAppliedQuery("");
      localStorage.removeItem("viewAllOrdersSearch");
      setCurrentPage(1);
      fetchOrders(1, "", sortBy, sortOrder, { silent: true });
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setAppliedQuery("");
    localStorage.removeItem("viewAllOrdersSearch");
    setCurrentPage(1);
    fetchOrders(1, "", sortBy, sortOrder, { silent: true });
  };

  const toggleRowExpansion = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Memoize formatDate with caching to avoid recreating Date objects
  const dateCache = useRef(new Map());
  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return "—";
    
    // Check cache first
    if (dateCache.current.has(dateStr)) {
      return dateCache.current.get(dateStr);
    }
    
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    
    const formatted = formatInTimeZone(d, "America/Chicago", "do MMM, yyyy");
    
    // Cache the result (limit cache size to prevent memory issues)
    if (dateCache.current.size >= 500) {
      const firstKey = dateCache.current.keys().next().value;
      dateCache.current.delete(firstKey);
    }
    dateCache.current.set(dateStr, formatted);
    
    return formatted;
  }, []);

  // Memoize yard rendering logic
  const renderYardCell = useCallback((order, isExpanded) => {
    const yards = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];
    const hasAnyYard = yards.some((y) => (y?.yardName || "").trim().length > 0);
    
    if (!hasAnyYard) return <span></span>;
    
    return (
      <div className="space-y-2">
        <div className="flex-1 text-white">
          {yards.map((y, idx) => (
            <div key={idx} className="font-medium whitespace-nowrap">
              {y?.yardName || ""}
            </div>
          ))}
        </div>
        
        {isExpanded && (
          <div className="whitespace-nowrap mt-2 text-xs text-white/80 space-y-2">
            {yards.map((yard, i) => (
              <div key={i} className="border-t border-white/15 pt-2">
                <div><b>Yard:</b> {yard?.yardName || "N/A"}</div>
                <div><b>Part price:</b> ${yard?.partPrice || 0}</div>
                <div><b>Shipping:</b> {yard?.shippingDetails || "N/A"}</div>
                {yard?.others && (
                  <div><b>Others:</b> ${yard.others}</div>
                )}
                <div><b>Phone:</b> {yard?.phone || "N/A"}</div>
                <div><b>Status:</b> {yard?.status || "N/A"}</div>
                <div><b>Stock #:</b> {yard?.stockNo || "N/A"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, []);

  const tableScrollRef = useRef(null);

  // -----------------------------------------------------------------------
  if (loading) return <div className="p-6 text-center text-white">⏳ Loading Orders...</div>;
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-3xl font-bold text-white underline decoration-1">All Orders</h2>

          <div className="mt-1 flex items-center gap-4">
            <p className="text-sm text-white/70">
              Total Orders: <strong>{totalOrders}</strong>
            </p>

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

              {isFetching && <span className="ml-3 text-xs text-white/70">Updating…</span>}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="w-full lg:w-[260px] relative">
          <input
            type="text"
            value={searchInput}
            onChange={onSearchChange}
            onKeyDown={onSearchKeyDown}
            placeholder="Search… (press Enter)"
            className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 w-full"
              aria-label="Search yard processing orders"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-black"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        ref={tableScrollRef}
        className="max-h-[76vh] overflow-y-auto overflow-x-auto rounded-xl ring-1 ring-white/10 shadow scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]"
      >
        <table className="min-w-[1200px] w-full bg-black/20 backdrop-blur-md text-white">
          <thead className="sticky top-0 bg-[#5c8bc1] z-20">
            <tr>
              {[
                { key: "orderDate", label: "Order Date" },
                { key: "orderNo", label: "Order No" },
                { key: "pReq", label: "Part Info" },         // sort by pReq
                { key: "salesAgent", label: "Sales Agent" },
                { key: "customerName", label: "Customer Info" }, // computed full name
                { key: "yardName", label: "Yard Name" },     // additionalInfo[0].yardName
                { key: "orderStatus", label: "Order Status" },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="p-3 text-left cursor-pointer border-r border-white/30 text-tHead whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortBy === col.key ? (
                      sortOrder === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />
                    ) : (
                      <FaSort className="text-xs text-white/60" />
                    )}
                  </div>
                </th>
              ))}
              <th className="p-3 text-left text-tHead">Action</th>
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
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {formatDate(order.orderDate)}
                </td>

                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-bodyText">
                  <div className="flex justify-between items-center gap-x-2">
                    <span>{order.orderNo}</span>
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
                </td>

                {/* Part Info (pReq shown; details include desc, etc.) */}
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-bodyText">
                  {order.pReq || "N/A"}
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
                </td>

                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-bodyText">
                  {order.salesAgent}
                </td>

                {/* Customer Info (display best available) */}
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-bodyText">
                  {order.customerName || `${order.fName || ""} ${order.lName || ""}`.trim()}
                  {expandedIds.has(order._id) && (
                    <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                      <div><b>Email:</b> {order.email}</div>
                      <div><b>Phone:</b> {order.phone}</div>
                      <div><b>Address:</b> {order.sAddressStreet}, {order.sAddressCity}, {order.sAddressState} {order.sAddressZip}</div>
                    </div>
                  )}
                </td>

                {/* Yard Name (all yards) */}
                <td className="p-2.5 border-r border-white/20 text-bodyText">
                  {renderYardCell(order, expandedIds.has(order._id))}
                </td>

                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-bodyText">
                  {order.orderStatus}
                </td>

                <td className="p-2.5 whitespace-nowrap">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      localStorage.setItem("highlightedOrderNo", String(order.orderNo));
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
      </div>
      <StickyXScrollbar targetRef={tableScrollRef} bottom={0} height={14} />
    </div>
  );
};

export default AllOrders;
