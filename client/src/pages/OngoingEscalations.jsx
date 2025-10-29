import React, { useState, useEffect } from "react";
import API from "../api";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { formatInTimeZone } from "date-fns-tz";
import { FaSort, FaSortUp, FaSortDown, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import useSort from "../hooks/useSort";

const OngoingEscalationOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  // multi-expand so search can expand all
  const [expandedIds, setExpandedIds] = useState(new Set());

  // remember filter selection
  const [activeFilter, setActiveFilter] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // search (persist like other pages)
  const [searchInput, setSearchInput] = useState(localStorage.getItem("ongoingEscSearch") || "");
  const [appliedQuery, setAppliedQuery] = useState(localStorage.getItem("ongoingEscSearch") || "");

  const { sortBy, sortOrder, handleSort, sortData } = useSort();

  const calculateOverallSpending = (order) => {
    if (!order.additionalInfo || order.additionalInfo.length === 0) return 0;
    const total = order.additionalInfo.reduce((sum, info) => {
      if (info.paymentStatus !== "Card charged") return sum;
      const shippingCost = info.shippingDetails
        ? parseFloat(info.shippingDetails.match(/\d+/)?.[0]) || 0
        : 0;
      const partPrice = parseFloat(info.partPrice || 0);
      const others = parseFloat(info.others || 0);
      const refundedAmount = parseFloat(info.refundedAmount || 0);
      const yardOwnShipping = parseFloat(info.yardOwnShipping || 0);
      const custOwnShippingReturn = parseFloat(info.custOwnShippingReturn || 0);
      const custOwnShipReplacement = parseFloat(info.custOwnShipReplacement || 0);
      return (
        sum +
        partPrice +
        shippingCost +
        others -
        refundedAmount +
        yardOwnShipping +
        custOwnShippingReturn -
        custOwnShipReplacement
      );
    }, 0);
    return isNaN(total) ? 0 : parseFloat(total.toFixed(2));
  };

  const buildDefaultFilter = () => {
    const now = new Date();
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return { month: monthNames[now.getMonth()], year: now.getFullYear() };
  };

  // server fetch with optional search
  const fetchOrders = async (filter = {}, page = 1, q = "") => {
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

      const { data } = await API.get(`/orders/ongoingEscalationOrders?${params.toString()}`);

      const raw = data.orders || [];

      // compute UI-only fields
      const processed = raw.map((order) => {
        const cancelledBy = Array.from(
          new Set(
            (order.orderHistory || [])
              .filter(
                (entry) =>
                  typeof entry === "string" &&
                  (entry.includes("Order status updated to Order Cancelled") ||
                   entry.includes("Order Cancelled"))
              )
              .map((entry) => {
                const parts = entry.split(" by ");
                return parts[1]?.split(" on ")[0] || "Unknown";
              })
          )
        ).join(", ");

        const yardName = order.additionalInfo?.[0]?.yardName || "N/A";
        const refundAmount = parseFloat(order.custRefAmount || 0);
        const overallSpending = calculateOverallSpending(order);
        const escalationStatus = order.additionalInfo?.[0]?.escTicked === "Yes" ? "Yes" : "";

        return {
          ...order,
          cancelledBy,
          yardName,
          refundAmount,
          overallSpending,
          escalationStatus,
        };
      });

      setOrders(processed);
      setTotalPages(data.totalPages || 1);
      setTotalOrders(data.totalOrders || processed.length);
      setCurrentPage(data.currentPage || page);
    } catch (err) {
      console.error("Error fetching ongoing escalations:", err);
      setError("Failed to load ongoing escalations.");
    } finally {
      setLoading(false);
      setIsFetching(false);
      setHasLoadedOnce(true);
    }
  };

  // init default filter once
  useEffect(() => {
    if (activeFilter === null) setActiveFilter(buildDefaultFilter());
  }, [activeFilter]);

  // refetch on filter/page/appliedQuery
  useEffect(() => {
    if (activeFilter) {
      fetchOrders(activeFilter, currentPage, appliedQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, currentPage, appliedQuery]);

  // auto-expand all rows during a search; collapse when cleared
  useEffect(() => {
    const hasQuery = appliedQuery.trim().length > 0;
    setExpandedIds(hasQuery ? new Set(orders.map((o) => o._id)) : new Set());
  }, [orders, appliedQuery]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    if (isNaN(date)) return "Invalid Date";
    return formatInTimeZone(date, "America/Chicago", "do MMM, yyyy");
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
  if (error)   return <div className="p-6 text-center text-red-300">{error}</div>;

  const sortedOrders = sortData(orders);

  return (
    <div className="min-h-screen p-6">
      {/* Header + Pagination + Filter */}
      <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">

        {/* LEFT: title + totals + pager */}
        <div className="flex flex-col">
          <h2 className="text-3xl font-bold text-white underline decoration-1">
            Ongoing Escalations
          </h2>

          <div className="mt-1 flex items-center gap-4">
            <p className="text-sm text-white/70">
              Total Orders: <strong>{totalOrders}</strong>
            </p>

            <div className="flex items-center gap-2 text-white font-medium">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className={`px-3 py-1 rounded-full transition ${
                  currentPage === 1
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-gray-700 hover:bg-gray-600"
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
                  currentPage === totalPages
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                <FaChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Search + Date filter */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          {/* Search (enter to apply; X/backspace clears) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = searchInput.trim();
              localStorage.setItem("ongoingEscSearch", q);
              setAppliedQuery(q);
              setCurrentPage(1);
              fetchOrders(activeFilter || buildDefaultFilter(), 1, q);
            }}
            className="relative flex w-full sm:w-auto"
          >
            <input
              value={searchInput}
              onChange={(e) => {
                const v = e.target.value;
                setSearchInput(v);
                if (v.trim() === "" && appliedQuery !== "") {
                  localStorage.removeItem("ongoingEscSearch");
                  setAppliedQuery("");
                  setCurrentPage(1);
                  fetchOrders(activeFilter || buildDefaultFilter(), 1, "");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  const base = activeFilter || buildDefaultFilter();
                  setSearchInput("");
                  localStorage.removeItem("ongoingEscSearch");
                  setAppliedQuery("");
                  setCurrentPage(1);
                  fetchOrders(base, 1, "");
                }
              }}
              placeholder="Search… (press Enter)"
              className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 min-w-[260px]"
              aria-label="Search ongoing escalations"
            />
            {!!searchInput && (
              <button
                type="button"
                onClick={() => {
                  const base = activeFilter || buildDefaultFilter();
                  setSearchInput("");
                  localStorage.removeItem("ongoingEscSearch");
                  setAppliedQuery("");
                  setCurrentPage(1);
                  fetchOrders(base, 1, "");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
            <input type="submit" hidden />
          </form>

          {/* Date filter */}
          <UnifiedDatePicker
            onFilterChange={(filter) => {
              const nextFilter =
                filter && Object.keys(filter).length ? filter : buildDefaultFilter();
              setActiveFilter(nextFilter);
              setCurrentPage(1);
              // Keep applied search while changing date
              fetchOrders(nextFilter, 1, appliedQuery);
            }}
          />
        </div>
      </div>

      {/* Orders Table */}
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
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="p-3 text-left text-tHead cursor-pointer border-r border-white/30 whitespace-nowrap"
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
                <th className="p-3 text-left font-poppins text-tHead">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortData(orders).map((order) => (
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
                        <span>{order.customerName || `${order.fName || ""} ${order.lName || ""}` || "N/A"}</span>
                      </div>
                      {expandedIds.has(order._id) && (
                        <div className="mt-2 border-t border-white/20 pt-2 text-xs space-y-1">
                          <div><b>Email:</b> {order.email}</div>
                          <div><b>Phone:</b> {order.phone}</div>
                          <div><b>Address:</b> {order.sAddressStreet}, {order.sAddressCity}, {order.sAddressState}, {order.sAddressZip}</div>
                        </div>
                      )}
                    </div>
                  </td>

                  <td
                    className={[
                      "p-2.5 border-r border-white/20 whitespace-nowrap",
                      order.orderStatus === "Order Fulfilled" && order.escalationStatus === "Yes"
                        ? "bg-green-200/40 text-green-900 font-medium rounded"
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
                <tr><td colSpan={8} className="p-3 text-center text-white/70">Refreshing…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OngoingEscalationOrders;
