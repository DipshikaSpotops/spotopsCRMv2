// src/components/OrdersTable.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import UnifiedDatePicker from "./UnifiedDatePicker";
import AgentDropdown from "./AgentDropdown";
import { formatInTimeZone } from "date-fns-tz";
import {
  FaChevronLeft,
  FaChevronRight,
  FaEye,
  FaSort,
  FaSortDown,
  FaSortUp,
} from "react-icons/fa";
import StickyXScrollbar from "./StickyXScrollbar";

/* =========================
   Constants / helpers
   ========================= */
const TZ = "America/Chicago";
const ROWS_PER_PAGE = 25;
const BAD_STATUSES = new Set(["Order Cancelled", "Refunded", "Dispute"]);

// You can keep this in one place (or move to env)
const API_BASE = import.meta.env.VITE_API_BASE_URL_URL
const TOKEN_API = (userId) => `${API_BASE}/auth/token/${userId}`;

// utils
const currency = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const formatDateSafe = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
};

const buildDefaultFilter = () => {
  const now = new Date();
  const month = formatInTimeZone(now, TZ, "MMM");
  const year = Number(formatInTimeZone(now, TZ, "yyyy"));
  return { month, year, limit: "all" };
};
const prettyFilterLabel = (filter) => {
  if (!filter) return "";
  if (filter.month && filter.year) return `${filter.month} ${filter.year}`;
  if (filter.start && filter.end) {
    const s = new Date(filter.start);
    const e = new Date(filter.end);
    return `${formatInTimeZone(s, TZ, "d MMM yyyy")} – ${formatInTimeZone(
      e,
      TZ,
      "d MMM yyyy"
    )}`;
  }
  return "";
};

// localStorage helpers
const getLS = (k, def = "") => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? def : v;
  } catch {
    return def;
  }
};
const setLS = (k, v) => {
  try {
    if (v == null || v === "") localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
};
const getJSON = (k) => {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const setJSON = (k, v) => {
  try {
    if (!v) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

/* =========================
   GP helpers (exactly like SalesData)
   ========================= */
function parseShippingValue(field = "") {
  if (typeof field !== "string") return 0;
  if (!field.includes(":")) return 0;
  const parts = field.split(":");
  const num = parseFloat(String(parts[1]).trim());
  return isNaN(num) ? 0 : num;
}
function calculateCurrentGP(order) {
  if (!order || !Array.isArray(order.additionalInfo) || order.additionalInfo.length === 0)
    return 0;
  let totalYardSpent = 0;
  order.additionalInfo.forEach((info) => {
    const yardPP = parseFloat(info?.partPrice) || 0;
    const shippingValueYard = parseShippingValue(info?.shippingDetails || "");
    const yardOthers = parseFloat(info?.others) || 0;
    const escOwnShipReturn = parseFloat(info?.custOwnShippingReturn) || 0;
    const escOwnShipReplacement = parseFloat(info?.custOwnShippingReplacement) || 0;
    const yardOwnShippingReplacement = parseFloat(info?.yardOwnShipping) || 0;
    const yardRefundAmount = parseFloat(info?.refundedAmount) || 0;

    const status = info?.status || "";
    const paymentStatus = info?.paymentStatus || "";
    if (
      status !== "PO cancelled" ||
      (status === "PO cancelled" && paymentStatus === "Card charged")
    ) {
      totalYardSpent +=
        yardPP +
        shippingValueYard +
        yardOthers +
        escOwnShipReturn +
        escOwnShipReplacement +
        yardOwnShippingReplacement -
        yardRefundAmount;
    }
  });

  const soldP = parseFloat(order?.soldP) || 0;
  const salesTax = parseFloat(order?.salestax) || 0;
  const custRefundedAmount = parseFloat(order?.custRefundedAmount) || 0;
  const spMinusTax = soldP - salesTax;
  const subtractRefund = spMinusTax - custRefundedAmount;
  return subtractRefund - totalYardSpent;
}
/** Parse shipping cost from "Label: 12.34" style strings */
function parseShippingCostStrict(field) {
  if (!field || typeof field !== "string") return 0;
  const parts = field.split(":");
  const n = parseFloat(parts[1]?.trim());
  return Number.isFinite(n) ? n : 0;
}

/** Your exact yard spending formulas per yard */
function computeYardSpendForInfo(info = {}) {
  const shippingCost           = parseShippingCostStrict(info?.shippingDetails);
  const partPrice              = parseFloat(info?.partPrice || 0) || 0;
  const others                 = parseFloat(info?.others || 0) || 0;
  const refundedAmount         = parseFloat(info?.refundedAmount || 0) || 0;
  const custOwnShipReplacement = parseFloat(info?.custOwnShipReplacement || 0) || 0;
  const yardOwnShipping        = parseFloat(info?.yardOwnShipping || 0) || 0;
  const custOwnShippingReturn  = parseFloat(info?.custOwnShippingReturn || 0) || 0;

  // Yard spending (the one you want to sum)
  const yardSpendTotal =
    partPrice +
    shippingCost +
    others -
    refundedAmount +
    yardOwnShipping +
    custOwnShippingReturn -
    custOwnShipReplacement;

  return { yardSpendTotal };
}

/** Sum of yardSpendTotal across all yards for an order */
function computeTotalYardSpend(order = {}) {
  const yards = Array.isArray(order?.additionalInfo) ? order.additionalInfo : [];
  return yards.reduce((sum, y) => sum + computeYardSpendForInfo(y).yardSpendTotal, 0);
}

/** Extract unique "refunded by" names from orderHistory lines:
 *  "Order status changed to Refunded by <Name> on <date> ..."
 */
function getRefundedByFromHistory(order = {}) {
  const hist = Array.isArray(order?.orderHistory) ? order.orderHistory : [];
  const names = new Set();
  hist.forEach((entry = "") => {
    if (entry.includes("Order status changed to Refunded")) {
      const parts = entry.split(" by ");
      if (parts[1]) {
        const who = parts[1].split(" on ")[0]?.trim();
        if (who) names.add(who);
      }
    }
  });
  return [...names].join(", ");
}
function getCancelledByFromHistory(order = {}) {
  const hist = Array.isArray(order?.orderHistory) ? order.orderHistory : [];
  const names = new Set();
  hist.forEach((entry = "") => {
    if (entry.includes("Order Cancelled") || entry.includes("Order status updated to Order Cancelled")) {
      const parts = entry.split(" by ");
      if (parts[1]) {
        const who = parts[1].split(" on ")[0]?.trim();
        if (who) names.add(who);
      }
    }
  });
  return [...names].join(", ");
}
/* =========================
   Small, reusable modal
   ========================= */
const GlassModal = ({ title, subtitle, onClose, children, actions }) => {
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-[92%] max-w-lg rounded-xl bg-[#0f1b2a] border border-white/15 p-5 text-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="mb-3">
            {title && <h3 className="text-lg font-semibold">{title}</h3>}
            {subtitle && <p className="text-sm text-white/80 mt-1">{subtitle}</p>}
          </div>
        )}
        {children}
        <div className="mt-4 flex items-center justify-end gap-2">
          {actions}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-[#2c5d81] hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================
   OrdersTable (reusable)
   ==========================================================

   Props:
   - title                : string header
   - endpoint             : "/orders/monthlyOrders" or full URL
   - storageKeys          : { page, search, filter, hilite }  (required)
   - columns              : [{key, label}] (display order)
   - renderCell(row,key)  : function to render cell content
   - showAgentFilter      : boolean (Admin-only dropdown)
   - showGP               : boolean (enables GP totals and derived _currentGP/_actualGP)
   - navigateTo           : function(row) -> path  (default `/order-details?orderNo=...`)
   - extraTotals          : optional function(sortedRows) => [{name, value}]  (for pages like Cancelled)
*/
export default function OrdersTable({
  title = "Orders",
  endpoint = "/orders/monthlyOrders",
  storageKeys,
  columns = [],
  renderCell,
  showAgentFilter = false,
  showGP = false,
  navigateTo,
  extraTotals,
  computeCancellationRate = false,
  denominatorEndpoint,
  showOrdersCountInTotals = true,
  showTotalsButton = true,
}) {
  const navigate = useNavigate();

  // validate storage keys
  const LS_PAGE_KEY = storageKeys?.page || "ordersTablePage";
  const LS_SEARCH_KEY = storageKeys?.search || "ordersTableSearch";
  const LS_FILTER_KEY = storageKeys?.filter || "ordersTableFilter";
  const LS_HILITE_KEY = storageKeys?.hilite || "ordersTableHilite";
  const SCROLL_KEY = `${LS_PAGE_KEY}_scrollTop`;

  // cleanup old keys (matches SalesData cleanup)
  useEffect(() => {
    localStorage.removeItem("udp_range");
    localStorage.removeItem("udp_shownDate");
    localStorage.removeItem("monthlyFilter");
  }, []);

  // raw data
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // denominator (all orders for same window/filters)
  const [denomCount, setDenomCount] = useState(0);
  const [badCount, setBadCount] = useState(0);

  // filters/search/sort/pagination
  const initFilter = getJSON(LS_FILTER_KEY) || buildDefaultFilter();
  const [activeFilter, setActiveFilter] = useState(initFilter);
  const [selectedAgent, setSelectedAgent] = useState("Select");

  const [searchInput, setSearchInput] = useState(getLS(LS_SEARCH_KEY, ""));
  const [appliedQuery, setAppliedQuery] = useState(getLS(LS_SEARCH_KEY, ""));

  const [currentPage, setCurrentPage] = useState(
    parseInt(getLS(LS_PAGE_KEY, "1"), 10)
  );

  // sort
  const [sortBy, setSortBy] = useState("orderDate");
  const [sortOrder, setSortOrder] = useState("desc");

  // highlight
  const [highlightedOrderNo, setHighlightedOrderNo] = useState(
    getLS(LS_HILITE_KEY, null)
  );
  const clearHighlight = () => {
    setHighlightedOrderNo(null);
    setLS(LS_HILITE_KEY, null);
  };
  const toggleHighlight = (orderNo) => {
    setHighlightedOrderNo((prev) => {
      const next = prev === String(orderNo) ? null : String(orderNo);
      setLS(LS_HILITE_KEY, next);
      return next;
    });
  };

  // modals
  const [showTotalsModal, setShowTotalsModal] = useState(false);

  // refs & restore
  const tableScrollRef = useRef(null);
  const [restoredScroll, setRestoredScroll] = useState(false);

  // role (for admin agent filter)
  const [userRole, setUserRole] = useState(null);
  const [firstName, setFirstName] = useState("");
  useEffect(() => {
  setUserRole((localStorage.getItem("role") || "").trim());
  setFirstName((localStorage.getItem("firstName") || "").trim());
  }, []);

  // persist page + scroll to top on manual page change
  useEffect(() => {
    setLS(LS_PAGE_KEY, String(currentPage));
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage]);

  // token bootstrap
  const ensureToken = useCallback(async () => {
    let token = null;
    try {
      token = localStorage.getItem("token");
    } catch {}
    if (token) return token;
    const userId = localStorage.getItem("userId");
    if (!userId) return null;
    try {
      const res = await axios.get(TOKEN_API(userId));
      if (res.status === 200 && res.data?.token) {
        localStorage.setItem("token", res.data.token);
        return res.data.token;
      }
    } catch (e) {
      console.error("Error fetching token:", e);
    }
    return null;
  }, []);

  // build params
  const buildParams = (filter = {}) => {
    const params = { limit: "all" };
    if (filter.start && filter.end) {
      params.start = new Date(filter.start).toISOString();
      params.end = new Date(filter.end).toISOString();
      return params;
    }
    const month = filter.month || buildDefaultFilter().month;
    const year = filter.year || buildDefaultFilter().year;
    params.month = month;
    params.year = year;
    return params;
  };

  // compute endpoint URL
  const endpointURL = useMemo(() => {
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    return `${API_BASE}${endpoint}`;
  }, [endpoint]);

  // fetch data
  const fetchOrders = useCallback(
    async (filter) => {
      setLoading(true);
      setError("");
      try {
        const token = await ensureToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const params = buildParams(filter || activeFilter || buildDefaultFilter());
        const res = await axios.get(endpointURL, { params, headers });
        const data = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.orders)
          ? res.data.orders
          : [];
        setOrders(data);
      } catch (e) {
        console.error("Error fetching orders:", e);
        setError("Failed to load orders.");
        setOrders([]);
      } finally {
        setLoading(false);
      }
    },
    [activeFilter, ensureToken, endpointURL]
  );

  useEffect(() => {
    if (activeFilter) {
      setJSON(LS_FILTER_KEY, activeFilter);
      fetchOrders(activeFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  // restore scroll after load
  useEffect(() => {
    if (!orders?.length || !tableScrollRef.current) return;
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (raw) {
      tableScrollRef.current.scrollTo({
        top: parseInt(raw, 10) || 0,
        behavior: "auto",
      });
      sessionStorage.removeItem(SCROLL_KEY);
      setRestoredScroll(true);
    }
  }, [orders, SCROLL_KEY]);
// ===== Fetch denominator for Cancellation Rate =====
const fetchDenominator = useCallback(async () => {
  if (!computeCancellationRate) return;
  try {
    const token = await ensureToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    // same date params as the grid
    const params = { ...buildParams(activeFilter || buildDefaultFilter()), limit: "all" };

    // same role narrowing as the grid
    const role = (userRole || "").toLowerCase();
    if (role === "sales") {
      params.salesAgent = firstName;
    } else if (role === "admin") {
      if (selectedAgent && selectedAgent !== "Select" && selectedAgent !== "All") {
        params.salesAgent = selectedAgent;
      }
    }

    const url = /^https?:\/\//i.test(denominatorEndpoint)
      ? denominatorEndpoint
      : `${API_BASE}${denominatorEndpoint}`;

    const res = await axios.get(url, { params, headers });
const raw = Array.isArray(res.data) ? res.data : (res.data?.orders || []);

// Denominator = ALL orders in the same window/scope
const denom = Array.isArray(raw) ? raw.length : 0;
setDenomCount(denom);

// Numerator (bad) = Cancelled + Refunded + Dispute in that same window/scope
const bad = Array.isArray(raw)
  ? raw.reduce(
      (n, o) => n + (BAD_STATUSES.has((o?.orderStatus || "").trim()) ? 1 : 0),
      0
    )
  : 0;
setBadCount(bad);
} catch (e) {
  console.error("Error fetching denominator:", e);
  setDenomCount(0);
  setBadCount(0);
}
}, [computeCancellationRate, activeFilter, ensureToken, userRole, firstName, selectedAgent, denominatorEndpoint]);

useEffect(() => {
  fetchDenominator();
}, [fetchDenominator]);

  // derived rows
  const rowsWithDerived = useMemo(() => {
  return orders.map((o) => {
    const currentGP = showGP ? calculateCurrentGP(o) : 0;
    let actualGP = parseFloat(o?.actualGP);
if (isNaN(actualGP)) actualGP = 0;

    const customerName =
      o?.fName && o?.lName ? `${o.fName} ${o.lName}` : o?.customerName || "";
    const partName = o?.pReq || o?.partName || "";

    // NEW: derived fields for sorting
    const yards = Array.isArray(o?.additionalInfo) ? o.additionalInfo : [];
    const firstYardName = yards[0]?.yardName || ""; // sort by this for "Yard Details"
    const refundedBy = getRefundedByFromHistory(o) || o?.refundedBy || "";
    const cancelledBy    = getCancelledByFromHistory(o)  || o?.cancelledBy || "";
    const totalYardSpend = computeTotalYardSpend(o);

    return {
      ...o,
      _currentGP: currentGP,
      _actualGP: actualGP,
      _customerName: customerName,
      _partName: partName,
      _yardName: firstYardName,
      _refundedBy: refundedBy,
      _cancelledBy: cancelledBy,
      _totalYardSpend: totalYardSpend,
      cancelledBy,
      
    };
  });
}, [orders, showGP]);

  // agent options
  const agentOptions = useMemo(() => {
    const set = new Set();
    rowsWithDerived.forEach((o) => {
      const a = (o?.salesAgent || "").trim();
      if (a) set.add(a);
    });
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    return ["Select", "All", ...arr];
  }, [rowsWithDerived]);

  // agent filter
const filteredByRole = useMemo(() => {
  if ((userRole || "").toLowerCase() === "sales") {
    const me = firstName.toLowerCase();
    return rowsWithDerived.filter(
      (o) => (o?.salesAgent || "").toLowerCase() === me
    );
  }
  // Admin & Support see everything
  return rowsWithDerived;
}, [rowsWithDerived, userRole, firstName]);

// 2) Admin-only agent narrowing (Select/All=no narrowing)
const agentFiltered = useMemo(() => {
  if ((userRole || "").toLowerCase() !== "admin") return filteredByRole;
  if (selectedAgent === "Select" || selectedAgent === "All") return filteredByRole;
  const needle = (selectedAgent || "").toLowerCase();
  return filteredByRole.filter(
    (o) => (o?.salesAgent || "").toLowerCase().includes(needle)
  );
}, [filteredByRole, userRole, selectedAgent]);

  // search filter
  const searchedRows = useMemo(() => {
    const value = (appliedQuery || "").trim().toLowerCase();
    if (!value) return agentFiltered;

    const match = (txt) =>
      typeof txt === "string"
        ? txt.toLowerCase().includes(value)
        : typeof txt === "number" && String(txt).toLowerCase().includes(value);

    return agentFiltered.filter((order) => {
      const basic =
        match(order.soldP) ||
        match(order.grossProfit) ||
        match(order.actualGP) ||
        match(order.orderDate) ||
        match(order.salesAgent) ||
        match(order.orderNo) ||
        match(order.customerName) ||
        match(order.pReq || order.partName) ||
        match(order.orderStatus) ||
        match(order.email) ||
        match(order.phone) ||
        match(order.make) ||
        match(order.year) ||
        match(order.model);

      const yardSearch =
        Array.isArray(order.additionalInfo) &&
        order.additionalInfo.some((info, idx) => {
          const yardLabel = `yard ${idx + 1}`;
          return (
            match(yardLabel) ||
            match(info?.yardName) ||
            match(info?.email) ||
            match(info?.status) ||
            match(info?.stockNo) ||
            match(info?.trackingNo)
          );
        });

      return basic || yardSearch;
    });
  }, [agentFiltered, appliedQuery]);

  // sorting
  const handleSort = (columnKey) => {
    if (!columnKey) return;
    clearHighlight();
    if (sortBy === columnKey) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(columnKey);
      if (columnKey === "orderDate") setSortOrder("desc");
      else setSortOrder("asc");
    }
    setCurrentPage(1);
  };

  const numericCols = new Set(
    ["soldP", "grossProfit", "_currentGP", "_actualGP"] // extend if needed
  );

  const sortedRows = useMemo(() => {
    if (!sortBy) return searchedRows;
    const key = sortBy;

    const toVal = (row) => {
      let v = row[key];
      if (sortBy === "customerName") v = row._customerName;
      if (sortBy === "partName")     v = row._partName; 
      if (sortBy === "yardName")       v = row._yardName;         // string
      if (sortBy === "refundedBy")     v = row._refundedBy;       // string
      if (sortBy === "cancelledBy")  v = row._cancelledBy;
      if (sortBy === "totalYardSpend") return parseFloat(row._totalYardSpend) || 0;
      if (String(sortBy).toLowerCase().includes("date")) {
        const t = new Date(v || 0).getTime();
        return isNaN(t) ? 0 : t;
      }
      if (numericCols.has(sortBy)) return parseFloat(v) || 0;
      return (v ?? "").toString().toLowerCase();
    };

    const arr = [...searchedRows].sort((a, b) => {
      const A = toVal(a);
      const B = toVal(b);
      if (typeof A === "number" && typeof B === "number") {
        return sortOrder === "asc" ? A - B : B - A;
      }
      return sortOrder === "asc"
        ? String(A).localeCompare(String(B))
        : String(B).localeCompare(String(A));
    });
    return arr;
  }, [searchedRows, sortBy, sortOrder]);

  // pagination
  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * ROWS_PER_PAGE;
  const pageRows = sortedRows.slice(pageStart, pageStart + ROWS_PER_PAGE);

  // totals (for the modal)
  const totals = useMemo(() => {
    let est = 0,
      cur = 0,
      act = 0;
    if (showGP) {
      sortedRows.forEach((o) => {
        est += parseFloat(o?.grossProfit || 0);
        cur += parseFloat(o?._currentGP || 0);
        act += parseFloat(o?._actualGP || 0);
      });
    }
    return { totalEstGP: est, totalCurrentGP: cur, totalActualGP: act };
  }, [sortedRows, showGP]);
useEffect(() => {
  // count cancelled + refunded + dispute in the current view
  const bad = sortedRows.reduce((acc, row) => {
    return acc + (BAD_STATUSES.has(row?.orderStatus) ? 1 : 0);
  }, 0);
  setBadCount(bad);
}, [sortedRows]);

  // scroll to highlighted row (unless we restored scroll)
  useEffect(() => {
    if (!highlightedOrderNo || !pageRows?.length || !tableScrollRef.current) return;
    if (restoredScroll) return;
    const match = pageRows.find((o) => String(o.orderNo) === String(highlightedOrderNo));
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`row-${match.orderNo}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
  }, [pageRows, highlightedOrderNo, restoredScroll]);

  // render helpers
  const SortIcon = ({ name }) =>
    sortBy === name ? (
      sortOrder === "asc" ? (
        <FaSortUp className="text-xs" />
      ) : (
        <FaSortDown className="text-xs" />
      )
    ) : (
      <FaSort className="text-xs text-white/60" />
    );

  // default view route
  const gotoPath = (row) =>
    navigateTo
      ? navigateTo(row)
      : `/order-details?orderNo=${encodeURIComponent(row.orderNo)}`;

  /* =========================
     Render
     ========================= */
  if (loading) return <div className="p-6 text-center text-white">⏳ Loading…</div>;
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  return (
    <div className="min-h-screen p-6 overflow-x-hidden">
      {/* ===== Header row ===== */}
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-3xl font-bold text-white underline decoration-1">
          {title}
        </h2>

        {showAgentFilter && userRole === "Admin" && (
          <AgentDropdown
            options={agentOptions}
            value={selectedAgent}
            onChange={(val) => {
              setSelectedAgent(val);
              setCurrentPage(1);
            }}
            className="ml-2"
          />
        )}

        {/* Right block: search + date + eye */}
        <div className="ml-auto flex items-center gap-3">
          {/* Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = (searchInput || "").trim();
              if (q) setLS(LS_SEARCH_KEY, q);
              else setLS(LS_SEARCH_KEY, null);
              setAppliedQuery(q);
              setCurrentPage(1);
            }}
            className="relative w-[280px]"
          >
            <input
              value={searchInput}
              onChange={(e) => {
                const v = e.target.value;
                setSearchInput(v);
                if (v.trim() === "" && appliedQuery !== "") {
                  setAppliedQuery("");
                  setLS(LS_SEARCH_KEY, null);
                  setCurrentPage(1);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchInput("");
                  setAppliedQuery("");
                  setLS(LS_SEARCH_KEY, null);
                  setCurrentPage(1);
                }
              }}
              placeholder="Search… (press Enter)"
              className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 w-full"
              aria-label="Search orders"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setAppliedQuery("");
                  setLS(LS_SEARCH_KEY, null);
                  setCurrentPage(1);
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
            key={JSON.stringify(activeFilter)}
            value={activeFilter}
            onFilterChange={(filter) => {
              const next =
                filter && Object.keys(filter || {}).length
                  ? { ...filter, limit: "all" }
                  : buildDefaultFilter();
              setActiveFilter(next);
              setCurrentPage(1);
            }}
          />

          {/* Eye button => totals */}
          
          {showTotalsButton && (
            <button
              onClick={() => setShowTotalsModal(true)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 bg-[#1f4c74] hover:bg-[#215784] text-white border border-white/15"
              title="View totals"
            >
              <FaEye />
           </button>
          )}
        </div>
      </div>

      {/* ===== Subheader: totals + pager ===== */}
      <div className="mb-4 flex items-center gap-4">
        <p className="text-sm text-white/80">
          Total Orders: <strong>{sortedRows.length}</strong>
        </p>

        {activeFilter && (
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
            {prettyFilterLabel(activeFilter)}
          </span>
        )}

        <div className="flex items-center gap-2 text-white font-medium">
          <button
            disabled={safePage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className={`px-3 py-1 rounded-full transition ${
              safePage === 1
                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            <FaChevronLeft size={14} />
          </button>

          <span className="px-4 py-1 bg-gray-800 rounded-full text-sm shadow">
            Page <strong>{safePage}</strong> of {totalPages}
          </span>

          <button
            disabled={safePage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className={`px-3 py-1 rounded-full transition ${
              safePage === totalPages
                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            <FaChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ===== Desktop table ===== */}
      <div
        ref={tableScrollRef}
        className="hidden md:block max-h-[80vh] overflow-y-auto overflow-x-auto rounded-xl ring-1 ring-white/10 shadow
                   scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]"
      >
        <table className="min-w-[1200px] w-full bg-black/20 backdrop-blur-md text-white">
          <thead className="sticky top-0 bg-[#5c8bc1] z-20 text-black">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="p-3 text-left cursor-pointer border-r border-white/30 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {col.label} <SortIcon name={col.key} />
                  </div>
                </th>
              ))}
              <th className="p-3 text-left whitespace-nowrap">Actions</th>
            </tr>
          </thead>

          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-6 text-center text-white/80">
                  No orders found.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const isHighlighted = highlightedOrderNo === String(row.orderNo);
                return (
                  <tr
                    key={row.orderNo || `${row.orderDate}-${Math.random()}`}
                    id={`row-${row.orderNo}`}
                    onClick={() => toggleHighlight(row.orderNo)}
                    className={`transition text-sm cursor-pointer ${
                      isHighlighted
                        ? "bg-yellow-500/20 ring-2 ring-yellow-400"
                        : "even:bg-white/5 odd:bg-white/10 hover:bg-white/20"
                    }`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="p-2.5 border-r border-white/20 whitespace-nowrap"
                      >
                        {renderCell
                          ? renderCell(row, col.key, formatDateSafe, currency)
                          : row[col.key] ?? "—"}
                      </td>
                    ))}
                    <td className="p-2.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tableScrollRef.current) {
                            sessionStorage.setItem(
                              SCROLL_KEY,
                              String(tableScrollRef.current.scrollTop || 0)
                            );
                          }
                          setLS(LS_HILITE_KEY, String(row.orderNo));
                          setLS(LS_PAGE_KEY, String(safePage));
                          setHighlightedOrderNo(String(row.orderNo));
                          navigate(gotoPath(row));
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
        </table>
      </div>
  {/* Fixed horizontal scrollbar that mirrors the table’s X scroll */}
    <StickyXScrollbar targetRef={tableScrollRef} bottom={0} height={14} />
      {/* ===== Mobile cards ===== */}
      <div className="md:hidden flex-1 min-h-0 overflow-y-auto space-y-3 mt-4">
        {pageRows.length === 0 ? (
          <div className="p-6 text-center text-white/80 bg-white/10 rounded-xl border border-white/15">
            No orders found.
          </div>
        ) : (
          pageRows.map((row) => {
            const isHighlighted = highlightedOrderNo === String(row.orderNo);
            return (
              <div
                key={row.orderNo || `${row.orderDate}-${Math.random()}`}
                id={`row-${row.orderNo}`}
                onClick={() => toggleHighlight(row.orderNo)}
                className={`rounded-xl p-4 backdrop-blur-md border text-white transition ${
                  isHighlighted
                    ? "bg-yellow-500/20 ring-2 ring-yellow-400 border-white/15"
                    : "bg-white/10 border-white/15"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{row.orderNo || "-"}</div>
                  <div className="text-xs opacity-80">{formatDateSafe(row.orderDate)}</div>
                </div>

                <div className="mt-2 text-sm opacity-90 space-y-1">
                  {/* Show a few common fields; rest are visible in table */}
                  <div>
                    <b>Agent:</b> {row.salesAgent || "-"}
                  </div>
                  <div>
                    <b>Customer:</b> {row._customerName || row.customerName || "-"}
                  </div>
                  <div>
                    <b>Status:</b> {row.orderStatus || "-"}
                  </div>
                  {showGP && (
                    <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                      <span>
                        <b>Sale:</b> {currency(row.soldP)}
                      </span>
                      <span>
                        <b>Est:</b> {currency(row.grossProfit)}
                      </span>
                      <span>
                        <b>Curr:</b> {currency(row._currentGP)}
                      </span>
                    </div>
                  )}
                  {showGP && (
                    <div className="mt-1 text-xs">
                      <b>Actual:</b> {currency(row._actualGP)}
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLS(LS_HILITE_KEY, String(row.orderNo));
                      setLS(LS_PAGE_KEY, String(safePage));
                      setHighlightedOrderNo(String(row.orderNo));
                      navigate(gotoPath(row));
                    }}
                    className="w-full px-3 py-2 text-sm rounded bg-[#2c5d81] hover:bg-blue-700 text-white"
                  >
                    View
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ===== Totals modal ===== */}
      {showTotalsModal && (
        <GlassModal
          title="Totals — Current View"
          subtitle={
            <>
              Filters: {prettyFilterLabel(activeFilter)}
              {selectedAgent !== "Select" ? ` • Agent: ${selectedAgent}` : ""}
              {appliedQuery ? ` • Search: “${appliedQuery}”` : ""}
            </>
          }
          onClose={() => setShowTotalsModal(false)}
          actions={
            <button
              onClick={() => {
                const lines = [];
                if (showOrdersCountInTotals) {
                  lines.push(["Orders", String(sortedRows.length)]);
                }
                if (showGP) {
                  lines.push(
                    ["Est GP", currency(totals.totalEstGP)],
                    ["Current GP", currency(totals.totalCurrentGP)],
                    ["Actual GP", currency(totals.totalActualGP)]
                  );
                }
                if (typeof extraTotals === "function") {
  const extra = extraTotals(sortedRows, { denomCount, badCount }) || [];
  extra.forEach((e) => lines.push([e.name, e.value]));
}
                const text = lines.map(([k, v]) => `${k}: ${v}`).join("\n");
                navigator.clipboard?.writeText(text).catch(() => {});
              }}
              className="px-3 py-2 rounded border border-white/20 hover:bg-white/10"
            >
              Copy
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-white/10">
                  <th className="text-left px-3 py-2">Metric</th>
                  <th className="text-right px-3 py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {showOrdersCountInTotals && (
                <tr className="even:bg-white/5 odd:bg-white/0">
                  <td className="px-3 py-2">Orders</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {sortedRows.length}
                  </td>
                </tr>
                )}

                {showGP && (
                  <>
                    <tr className="even:bg-white/5 odd:bg-white/0">
                      <td className="px-3 py-2">Est GP</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {currency(totals.totalEstGP)}
                      </td>
                    </tr>
                    <tr className="even:bg-white/5 odd:bg-white/0">
                      <td className="px-3 py-2">Current GP</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {currency(totals.totalCurrentGP)}
                      </td>
                    </tr>
                    <tr className="even:bg-white/5 odd:bg-white/0">
                      <td className="px-3 py-2">Actual GP</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {currency(totals.totalActualGP)}
                      </td>
                    </tr>
                  </>
                )}

                {/* Extra totals (e.g., cancellation rate, counts, etc.) */}
              {typeof extraTotals === "function" &&
  (extraTotals(sortedRows, { denomCount, badCount }) || []).map((item) => (
    <tr key={item.name} className="even:bg-white/5 odd:bg-white/0">
      <td className="px-3 py-2">{item.name}</td>
      <td className="px-3 py-2 text-right font-semibold">
        {item.value}
      </td>
    </tr>
  ))}

              </tbody>
            </table>
          </div>
        </GlassModal>
      )}
    </div>
  );
}
