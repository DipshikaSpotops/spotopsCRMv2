import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { formatInTimeZone } from "date-fns-tz";
import {
  FaSort,
  FaSortUp,
  FaSortDown,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";

const TZ = "America/Chicago";
const ROWS_PER_PAGE = 25;
const API_BASE = "http://localhost:5000/orders/monthlyOrders";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const buildDefaultFilter = () => {
  const now = new Date();
  return { month: MONTHS[now.getUTCMonth()], year: now.getUTCFullYear() };
};

function formatDateSafe(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}

const DeliveryReport = () => {
  const [rawOrders, setRawOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState(null);

  // UI
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState(null); // 'orderNo' | 'orderDate' | `yard-<i>`
  const [sortOrder, setSortOrder] = useState("asc");

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const handleSort = (key) => {
    if (sortBy === key) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  // Init default filter
  useEffect(() => {
    if (!activeFilter) setActiveFilter(buildDefaultFilter());
  }, [activeFilter]);

  const buildBaseUrl = (filter = {}) => {
    const params = new URLSearchParams();
    params.set("limit", ROWS_PER_PAGE.toString());

    if (filter.start && filter.end) {
      params.set("start", filter.start);
      params.set("end", filter.end);
    } else if (filter.month && filter.year) {
      params.set("month", filter.month);
      params.set("year", String(filter.year));
    } else {
      const def = buildDefaultFilter();
      params.set("month", def.month);
      params.set("year", String(def.year));
    }

    return `${API_BASE}?${params.toString()}`;
  };

  // Fetch ALL pages using server totalPages
  const fetchAllOrders = async (filter = {}) => {
    try {
      setLoading(true);
      const base = buildBaseUrl(filter);
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const first = await axios.get(`${base}&page=1`, { headers });
      const firstOrders = first.data?.orders || [];
      const totalPages = first.data?.totalPages || 1;

      let all = [...firstOrders];
      if (totalPages > 1) {
        const reqs = [];
        for (let p = 2; p <= totalPages; p++) {
          reqs.push(axios.get(`${base}&page=${p}`, { headers }));
        }
        const results = await Promise.all(reqs);
        results.forEach((r) => {
          all = all.concat(r.data?.orders || []);
        });
      }

      setRawOrders(all);
      setCurrentPage(1);
      setError("");
    } catch (err) {
      console.error("Error fetching monthly orders:", err);
      setError("Failed to load data.");
      setRawOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeFilter) fetchAllOrders(activeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  /**
   * Process rows:
   * - Keep yard infos as-is for display.
   * - Prepare yard sort values (yard name + shippingDetails) for yard column sorts.
   */
  const processedRows = useMemo(() => {
    return (rawOrders || []).map((order) => {
      const infos = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];

      const yardSortVals = infos.map((info) => {
        const shipping = (info?.shippingDetails || "").toLowerCase();
        return `${info?.yardName || ""} ${shipping}`.toLowerCase();
      });

      return {
        ...order,
        _yardInfos: infos,
        _yardSortVals: yardSortVals,
      };
    });
  }, [rawOrders]);

  // Sorting
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

  // Client-side pagination
  const totalFilteredOrders = processedRows.length;
  const clientTotalPages = Math.max(1, Math.ceil(sortedRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, clientTotalPages);
  const pageStart = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows = sortedRows.slice(pageStart, pageStart + ROWS_PER_PAGE);

  // Dynamic yard columns based on current page (like your HTML)
  const maxYardsOnPage = useMemo(
    () => pageRows.reduce((m, r) => Math.max(m, r._yardInfos.length), 0),
    [pageRows]
  );

  if (loading) return <div className="p-6 text-center text-white">⏳ Loading…</div>;
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  const SortIcon = ({ name }) =>
    sortBy === name
      ? sortOrder === "asc"
        ? <FaSortUp className="text-xs" />
        : <FaSortDown className="text-xs" />
      : <FaSort className="text-xs text-white/60" />;

  // Yard cell renderer (Delivery Time details)
  const renderYardCell = (order, i) => {
    const yard = order._yardInfos[i];
    if (!yard) return null;

    const {
      yardName, phone, poSentDate, partDeliveredDate,
      status, trackingNo, paymentStatus
    } = yard;

    // Delivered in N days (poSentDate -> partDeliveredDate)
    let deliveredDays = "";
    if (partDeliveredDate && poSentDate) {
      const diff = Math.ceil(
        (new Date(partDeliveredDate) - new Date(poSentDate)) / (1000 * 60 * 60 * 24)
      );
      if (!isNaN(diff)) deliveredDays = diff;
    }

    // Days since customer approved (Chicago), if not delivered
    let sinceApproved = "";
    if (status !== "Part delivered" && order.customerApprovedDate) {
      const dallasNow = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
      const diff2 = Math.ceil(
        (dallasNow - new Date(order.customerApprovedDate)) / (1000 * 60 * 60 * 24)
      );
      if (!isNaN(diff2)) sinceApproved = diff2;
    }

    return (
      <div className="whitespace-pre-line">
        {(yardName || phone) && (
          <div className="font-medium whitespace-nowrap">
            {yardName || "N/A"}{phone ? ` | ${phone}` : ""}
          </div>
        )}
        {poSentDate && <div>PO Sent - {poSentDate}</div>}
        {paymentStatus && <div>{paymentStatus}</div>}
        {trackingNo && <div>{trackingNo}</div>}
        {status && <div>{status}</div>}
        {(status === "Part delivered" || status === "Escalation") && deliveredDays && (
          <div>Delivered in {deliveredDays} days</div>
        )}
        {sinceApproved && <div>{sinceApproved} days since Customer Approved</div>}
      </div>
    );
  };

  return (
    <div className="min-h-screen p-6">
      {/* Header + Pagination + Filter (exact theme) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-3xl font-bold text-[#04356d]">Delivery Time Report</h2>
            <p className="text-sm text-[#04356d]/70">
              Total Orders: <strong>{totalFilteredOrders}</strong>
            </p>
          </div>

          {/* Pagination beside title */}
          <div className="flex items-center gap-4">
            <button
              disabled={safePage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-3 py-1 bg-gray-700 rounded text-white disabled:opacity-50"
              title="Previous"
            >
              <FaChevronLeft />
            </button>

            <span className="text-[#04356d]">
              Page {safePage} of {clientTotalPages}
            </span>

            <button
              disabled={safePage === clientTotalPages}
              onClick={() => setCurrentPage((p) => Math.min(clientTotalPages, p + 1))}
              className="flex items-center gap-1 px-3 py-1 bg-gray-700 rounded text-white disabled:opacity-50"
              title="Next"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>

        {/* Date filter */}
        <UnifiedDatePicker
          tz={TZ}
          onFilterChange={(filter) => {
            const next = filter && Object.keys(filter).length ? filter : buildDefaultFilter();
            setActiveFilter(next);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Table with the same theme (no sticky cols) */}
      <div className="overflow-x-auto">
        <div className="max-h-[80vh] overflow-y-auto scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
          <table className="min-w-[1100px] w-full bg-black/20 backdrop-blur-md text-white">
            <thead className="sticky top-0 bg-[#5c8bc1] z-20">
              <tr>
                <th
                  onClick={() => handleSort("orderNo")}
                  className="p-3 text-left cursor-pointer border-r border-white/30 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    Order No <SortIcon name="orderNo" />
                  </div>
                </th>

                <th
                  onClick={() => handleSort("orderDate")}
                  className="p-3 text-left cursor-pointer border-r border-white/30 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    Order Date <SortIcon name="orderDate" />
                  </div>
                </th>

                {/* Dynamic Yard columns */}
                {Array.from({ length: maxYardsOnPage }).map((_, i) => (
                  <th
                    key={`yard-h-${i}`}
                    onClick={() => handleSort(`yard-${i}`)}
                    className="p-3 text-left cursor-pointer border-r border-white/30 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      {`Yard ${i + 1}`} <SortIcon name={`yard-${i}`} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={2 + maxYardsOnPage} className="p-6 text-center text-white/80">
                    No orders found.
                  </td>
                </tr>
              ) : (
                pageRows.map((o) => (
                  <tr
                    key={o._id || o.orderNo}
                    className="even:bg-white/5 odd:bg-white/10 hover:bg-white/20 transition text-sm"
                  >
                    <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                      {o.orderNo}
                    </td>

                    <td className="p-2.5 border-r border-white/20 whitespace-nowrap">
                      {formatDateSafe(o.orderDate)}
                    </td>

                    {Array.from({ length: maxYardsOnPage }).map((_, i) => (
                      <td
                        key={`yard-c-${o.orderNo}-${i}`}
                        className="p-2.5 border-r border-white/20 whitespace-pre-line align-top"
                      >
                        {renderYardCell(o, i)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DeliveryReport;
