// src/pages/CustomerApproved.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { formatInTimeZone } from "date-fns-tz";
import { useNavigate } from "react-router-dom";
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

const API_BASE = "http://localhost:5000";

const toDallasPretty = (dateLike) => {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (isNaN(d)) return "";
  return formatInTimeZone(d, "America/Chicago", "do MMM, yyyy HH:mm");
};

const CustomerApproved = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // expand logic
  const [expandedIds, setExpandedIds] = useState(new Set());

  // ✨ NEW: split typing vs applied query
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");

  const [currentFilter, setCurrentFilter] = useState(null); // {month,year} OR {start,end}
  const navigate = useNavigate();

  // Fetch helper
  const fetchOrders = async (filter = {}) => {
    try {
      setLoading(true);
      let url = "";
      const q = filter.q ? `&q=${encodeURIComponent(filter.q)}` : "";

      if (filter.start && filter.end) {
        url = `${API_BASE}/orders/customerApproved?start=${filter.start}&end=${filter.end}${q}`;
      } else if (filter.month && filter.year) {
        url = `${API_BASE}/orders/customerApproved?month=${filter.month}&year=${filter.year}${q}`;
      } else {
        // default = current Dallas month
        const nowDallas = moment().tz("America/Chicago");
        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const month = monthNames[nowDallas.month()];
        const year = nowDallas.year();
        url = `${API_BASE}/orders/customerApproved?month=${month}&year=${year}${q}`;
        setCurrentFilter({ month, year });
      }

      const { data } = await axios.get(url);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching customer approved orders:", err);
      setError("Failed to load customer approved orders.");
    } finally {
      setLoading(false);
    }
  };

  // Initial load -> Dallas month
  useEffect(() => {
    const nowDallas = moment().tz("America/Chicago");
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const month = monthNames[nowDallas.month()];
    const year = nowDallas.year();
    const initialFilter = { month, year };
    setCurrentFilter(initialFilter);
    fetchOrders({ ...initialFilter, q: appliedQuery || undefined });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔁 Re-fetch when appliedQuery changes (e.g., after pressing Enter / clearing)
  useEffect(() => {
    if (!currentFilter) return;
    fetchOrders({ ...currentFilter, q: appliedQuery || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedQuery]);

  // ✨ Auto-expand when a query is APPLIED; collapse when cleared
  useEffect(() => {
    const hasQuery = appliedQuery.trim().length > 0;
    setExpandedIds(hasQuery ? new Set(orders.map((o) => o._id)) : new Set());
  }, [orders, appliedQuery]);

  // Date filter change (keep the APPLIED query, not the typed input)
  const handleFilterChange = (filter) => {
    setCurrentFilter(filter);
    fetchOrders({ ...filter, q: appliedQuery || undefined });
  };

  // Search submit (Enter only)
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchInput.trim();
    setAppliedQuery(q); // triggers the re-fetch + auto-expand via effects
  };

  // Manual toggle on a single card
  const toggleDetails = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-6 grid gap-5 justify-center grid-cols-[repeat(auto-fill,minmax(280px,280px))]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-44 rounded-xl border border-white/15 bg-white/10 animate-pulse" />
        ))}
      </div>
    );
  }
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-3">
        {/* Left: title + totals */}
        <div className="flex items-start gap-6">
          <div>
            <h2 className="text-3xl font-bold text-white underline decoration-1 leading-tight -mb-0.5">
              Customer Approved
            </h2>
            <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-4">
              <p className="text-sm text-white/70">
                Total Orders: <strong>{orders.length}</strong>
              </p>
              {currentFilter && (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
                  {prettyFilterLabel(currentFilter)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: search + date picker */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <form onSubmit={handleSearchSubmit} className="relative flex w-full sm:w-auto">
            <input
              value={searchInput} // typed text only
              onChange={(e) => {
              const v = e.target.value;
              setSearchInput(v);
              if (v.trim() === "" && appliedQuery !== "") {
                setAppliedQuery("");  
              }
            }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchInput("");
                  setAppliedQuery("");   // also clears applied query
                }
              }}
              placeholder="Search...(press Enter)"
              className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 min-w-[260px]"
              aria-label="Search customer approved orders"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setAppliedQuery(""); // clearing triggers refetch + collapse
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
            <input type="submit" hidden />
          </form>

          <div className="shrink-0">
            <UnifiedDatePicker onFilterChange={handleFilterChange} />
          </div>
        </div>
      </div>

      {/* Orders */}
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center text-white/80 py-14">
          <div className="text-3xl mb-2">🗂️</div>
          <p className="text-lg font-medium">
            {currentFilter?.start || currentFilter?.month
              ? "No results found in this range."
              : "No customer approved orders found."}
          </p>
          <p className="text-sm text-white/60 mt-1">Try a different search or date range.</p>
        </div>
      ) : (
        <div className="grid md:gap-6 gap-5 justify-center grid-cols-[repeat(auto-fill,minmax(280px,280px))]">
          {orders.map((order) => (
            <div
              key={order._id}
              className="w-[280px] rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-5 border border-white/30 bg-white/20 backdrop-blur-lg"
            >
              {/* Header row */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-white/80">Order No</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-green-400/30 text-green-50 border border-green-300/30">
                  {order.orderStatus}
                </span>
              </div>

              {/* Order no + copy */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">{order.orderNo}</h3>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(String(order.orderNo || ""))}
                  className="text-xs px-2 py-1 rounded-md border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition"
                  title="Copy order number"
                >
                  Copy
                </button>
              </div>

              {/* Key details */}
              <div className="space-y-1 text-sm text-white/80">
                <div><b>Date:</b> {toDallasPretty(order.orderDate)}</div>
                <div><b>Sales:</b> {order.salesAgent || "N/A"}</div>
                <div className="truncate" title={order.customerName || `${order.fName || ""} ${order.lName || ""}`}>
                  <b>Cust:</b> {order.customerName || `${order.fName || ""} ${order.lName || ""}` || "N/A"}
                </div>
              </div>

              {/* Expand/collapse */}
              <button
                onClick={() => toggleDetails(order._id)}
                className="mt-3 text-[13px] text-blue-300 underline hover:text-blue-400 transition"
              >
                {expandedIds.has(order._id) ? "Hide Details" : "Show Details"}
              </button>

              {expandedIds.has(order._id) && (
                <div className="mt-3 space-y-2 text-sm text-white/80 border-t border-white/20 pt-3">
                  <div>
                    <b>Email:</b> {order.email || "N/A"} <br />
                    <b>Phone:</b> {order.phone || "N/A"}
                  </div>
                  <div>
                    <b>Billing Address:</b><br />
                    {order.bAddressStreet || ""} {order.bAddressCity || ""} {order.bAddressState || ""} {order.bAddressZip || ""}
                  </div>
                  <div>
                    <b>Shipping Address:</b><br />
                    {order.sAddressStreet || ""} {order.sAddressCity || ""} {order.sAddressState || ""} {order.sAddressZip || ""}
                  </div>
                  <div>
                    <b>Part:</b> {order.partName || order.pReq || "N/A"} <br />
                    {order.costP && <span><b>Est. Price:</b> ${order.costP} <br /></span>}
                    {order.soldP && <span><b>Sold Price:</b> ${order.soldP} <br /></span>}
                    {order.expediteShipping === "true" && <span>🚀 Expedite Shipping<br /></span>}
                    {order.dsCall === "true" && <span>📞 DS Call<br /></span>}
                  </div>
                  <div>
                    <b>Vehicle:</b> {order.year} {order.make} {order.model} <br />
                    <b>VIN:</b> {order.vin || "N/A"}
                  </div>
                </div>
              )}

              {/* Process button */}
              <div className="mt-3">
                <button
                  onClick={() =>
                    navigate(`/order-details?orders/${encodeURIComponent(order.orderNo)}`)
                  }
                  className="w-full bg-gradient-to-r from-[#6c9e6a] to-[#bdc9bd] text-white font-medium px-3 py-2 rounded-lg shadow hover:from-[#39a872] hover:to-[#5eb663] transition-all"
                >
                  Process
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomerApproved;
