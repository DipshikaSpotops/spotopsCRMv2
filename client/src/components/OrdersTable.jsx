// src/components/OrdersTable.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import API from "../api";
import { useNavigate } from "react-router-dom";
import UnifiedDatePicker from "./UnifiedDatePicker";
import AgentDropdown from "./AgentDropdown";
import { formatInTimeZone } from "date-fns-tz";
import { prettyFilterLabel } from "../utils/dateUtils";
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

// utils - memoized for performance
const currency = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// Memoize date formatting to avoid recreating Date objects on every render
// Using a simple cache for frequently accessed dates
const dateFormatCache = new Map();
const MAX_CACHE_SIZE = 1000;

const formatDateSafe = (dateStr) => {
  if (!dateStr) return "—";
  
  // Check cache first
  if (dateFormatCache.has(dateStr)) {
    return dateFormatCache.get(dateStr);
  }
  
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  
  const formatted = formatInTimeZone(d, TZ, "do MMM, yyyy");
  
  // Cache the result (with size limit to prevent memory issues)
  if (dateFormatCache.size >= MAX_CACHE_SIZE) {
    // Clear oldest entries (simple FIFO)
    const firstKey = dateFormatCache.keys().next().value;
    dateFormatCache.delete(firstKey);
  }
  dateFormatCache.set(dateStr, formatted);
  
  return formatted;
};

const buildDefaultFilter = () => {
  const now = new Date();
  const month = formatInTimeZone(now, TZ, "MMM");
  const year = Number(formatInTimeZone(now, TZ, "yyyy"));
  return { month, year, limit: "all" };
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
  } catch { }
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
  } catch { }
};

/* =========================
   GP helpers (exactly like SalesData)
   ========================= */
/**
 * Extract numeric shipping value from shippingDetails string
 * Handles both "Own shipping: X" and "Yard shipping: X" formats
 * Always extracts from shippingDetails, never from ownShipping/yardShipping fields
 */
function parseShippingValue(field = "") {
  if (typeof field !== "string" || !field) return 0;
  // Match "Own shipping: X" or "Yard shipping: X" (case-insensitive, handles decimals)
  const match = field.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? 0 : num;
  }
  return 0;
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
    const escOwnShipReplacement = parseFloat(info?.custOwnShipReplacement) || 0;
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
/**
 * Extract numeric shipping value from shippingDetails string
 * Handles both "Own shipping: X" and "Yard shipping: X" formats
 * Always extracts from shippingDetails, never from ownShipping/yardShipping fields
 */
function parseShippingCostStrict(field) {
  if (!field || typeof field !== "string") return 0;
  // Match "Own shipping: X" or "Yard shipping: X" (case-insensitive, handles decimals)
  const match = field.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
  if (match) {
    const num = parseFloat(match[1]);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

/** Your exact yard spending formulas per yard */
function computeYardSpendForInfo(info = {}) {
  const shippingCost = parseShippingCostStrict(info?.shippingDetails);
  const partPrice = parseFloat(info?.partPrice || 0) || 0;
  const others = parseFloat(info?.others || 0) || 0;
  const refundedAmount = parseFloat(info?.refundedAmount || 0) || 0;
  const custOwnShipReplacement = parseFloat(info?.custOwnShipReplacement || 0) || 0;
  const yardOwnShipping = parseFloat(info?.yardOwnShipping || 0) || 0;
  const custOwnShippingReturn = parseFloat(info?.custOwnShippingReturn || 0) || 0;

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
  onRowsChange,
  paramsBuilder,
  fetchOverride,
  totalLabel,
  showTotalsNearPill = false,
  hideDefaultActions = false, // New prop to hide default Actions column
  rowsPerPage = ROWS_PER_PAGE, // allow per-page override
}) {
  const navigate = useNavigate();

  // validate storage keys
  const LS_PAGE_KEY = storageKeys?.page || "ordersTablePage";
  const LS_SEARCH_KEY = storageKeys?.search || "ordersTableSearch";
  const LS_FILTER_KEY = storageKeys?.filter || "ordersTableFilter";
  const LS_HILITE_KEY = storageKeys?.hilite || "ordersTableHilite";
  const LS_AGENT_KEY = `${LS_PAGE_KEY}_agent`;
  const LS_SORT_BY_KEY = `${LS_PAGE_KEY}_sortBy`;
  const LS_SORT_ORDER_KEY = `${LS_PAGE_KEY}_sortOrder`;
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
  const [selectedAgent, setSelectedAgent] = useState(getLS(LS_AGENT_KEY, "Select"));

  const [searchInput, setSearchInput] = useState(getLS(LS_SEARCH_KEY, ""));
  const [appliedQuery, setAppliedQuery] = useState(getLS(LS_SEARCH_KEY, ""));

  const [currentPage, setCurrentPage] = useState(
    parseInt(getLS(LS_PAGE_KEY, "1"), 10)
  );

  // sort - restore from localStorage
  const [sortBy, setSortBy] = useState(getLS(LS_SORT_BY_KEY, "orderDate"));
  const [sortOrder, setSortOrder] = useState(getLS(LS_SORT_ORDER_KEY, "desc"));

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

  // role (for admin agent filter and Edit button)
  const [userRole, setUserRole] = useState(null);
  const [firstName, setFirstName] = useState("");
  useEffect(() => {
    // Get role with fallback (like Sidebar does)
    const roleFromStorage = (() => {
      try {
        const raw = localStorage.getItem("auth");
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed?.user?.role || undefined;
        }
      } catch {}
      return localStorage.getItem("role") || undefined;
    })();
    setUserRole(roleFromStorage);
    setFirstName((localStorage.getItem("firstName") || "").trim());
  }, []);

  // persist page + scroll to top on manual page change
  useEffect(() => {
    setLS(LS_PAGE_KEY, String(currentPage));
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage]);

  // build params
  const defaultBuildParams = (filter = {}) => {
    const params = { /* no limit by default to avoid 500s on some endpoints */ };
    if (filter.start && filter.end) {
      // if filter already has ISO strings, no need to re-ISO them
      params.start = filter.start;
      params.end = filter.end;
    } else {
      const month = filter.month || buildDefaultFilter().month;
      const year = filter.year || buildDefaultFilter().year;
      params.month = month;
      params.year = year;
    }
    return params;
  };
  // compute endpoint URL
  const endpointURL = useMemo(() => {
    return /^https?:\/\//i.test(endpoint) ? endpoint : endpoint;
  }, [endpoint]);


  // fetch data
  const fetchOrders = useCallback(
    async (filter) => {
      setLoading(true);
      setError("");
      try {
        const baseFilter = filter || activeFilter || buildDefaultFilter();
        const params = typeof paramsBuilder === "function"
          ? paramsBuilder({
            filter: baseFilter,
            query: appliedQuery,
            sortBy,
            sortOrder,
            selectedAgent,
            userRole,
            firstName,
          })
          : defaultBuildParams(baseFilter);

        let data = [];
        if (typeof fetchOverride === "function") {
          // Let the parent fully control how rows are fetched (e.g., merge 2 endpoints)
          data = await fetchOverride({
            filter: baseFilter,
            query: appliedQuery,
            sortBy,
            sortOrder,
            selectedAgent,
            userRole,
            firstName,
          });
        } else {
          console.log("[OrdersTable] GET", endpointURL, params);
          const res = await API.get(endpointURL, { params });
          data = Array.isArray(res.data)
            ? res.data
            : Array.isArray(res.data?.orders)
              ? res.data.orders
              : [];
        }
        setOrders(data);
      } catch (e) {
        if (e?.response) {
          console.error("Error fetching orders:", {
            status: e.response.status,
            url: (e.config?.baseURL || "") + (e.config?.url || ""),
            data: e.response.data,
          });
        } else {
          console.error("Error fetching orders:", e);
        }
        setError("Failed to load orders.");
        setOrders([]);
      } finally {
        setLoading(false);
      }
    },
    [activeFilter, endpointURL, appliedQuery, sortBy, sortOrder, selectedAgent, userRole, firstName, fetchOverride, paramsBuilder]
  );

  useEffect(() => {
    if (activeFilter) {
      setJSON(LS_FILTER_KEY, activeFilter);
      fetchOrders(activeFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  // Restore and apply search query, agent filter, and sort state on mount if they exist in localStorage
  // This ensures all filters and sorting are restored when coming back to the page
  useEffect(() => {
    const savedSearch = getLS(LS_SEARCH_KEY, "");
    if (savedSearch && savedSearch !== appliedQuery) {
      // Always sync both searchInput and appliedQuery with saved value on mount
      // This handles cases where the component remounts and needs to restore state
      setSearchInput(savedSearch);
      setAppliedQuery(savedSearch);
    }
    // Restore selected agent from localStorage
    const savedAgent = getLS(LS_AGENT_KEY, "Select");
    if (savedAgent && savedAgent !== "Select" && savedAgent !== selectedAgent) {
      setSelectedAgent(savedAgent);
    }
    // Restore sort state from localStorage
    const savedSortBy = getLS(LS_SORT_BY_KEY, "");
    const savedSortOrder = getLS(LS_SORT_ORDER_KEY, "");
    if (savedSortBy && savedSortBy !== sortBy) {
      setSortBy(savedSortBy);
    }
    if (savedSortOrder && savedSortOrder !== sortOrder) {
      setSortOrder(savedSortOrder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        : denominatorEndpoint; // relative; API.baseURL will prefix
      console.log("[OrdersTable] GET (denom)", url, params);
      const res = await API.get(url, { params });
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
  }, [computeCancellationRate, activeFilter, userRole, firstName, selectedAgent, denominatorEndpoint]);

  useEffect(() => {
    fetchDenominator();
  }, [fetchDenominator]);

  // derived rows - optimized to avoid unnecessary object spreading
  const rowsWithDerived = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    
    return orders.map((o) => {
      // Only compute GP if needed
      const currentGP = showGP ? calculateCurrentGP(o) : 0;
      let actualGP = parseFloat(o?.actualGP);
      if (isNaN(actualGP)) actualGP = 0;

      const customerName =
        o?.fName && o?.lName ? `${o.fName} ${o.lName}` : o?.customerName || "";
      const partName = o?.pReq || o?.partName || "";

      // Derived fields for sorting - only compute if needed
      const yards = Array.isArray(o?.additionalInfo) ? o.additionalInfo : [];
      const firstYardName = yards[0]?.yardName || "";
      const refundedBy = getRefundedByFromHistory(o) || o?.refundedBy || "";
      const cancelledBy = getCancelledByFromHistory(o) || o?.cancelledBy || "";
      const totalYardSpend = computeTotalYardSpend(o);

      // Create new object with derived fields (avoid spreading entire object if possible)
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

  // search filter - optimized with early returns
  const searchedRows = useMemo(() => {
    const value = (appliedQuery || "").trim().toLowerCase();
    if (!value) return agentFiltered;
    if (agentFiltered.length === 0) return agentFiltered;

    // Pre-compile regex for faster matching (if value is long enough)
    const useRegex = value.length > 2;
    const regex = useRegex ? new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    const match = (txt) => {
      if (txt == null) return false;
      if (useRegex && regex) {
        return regex.test(String(txt));
      }
      return typeof txt === "string"
        ? txt.toLowerCase().includes(value)
        : typeof txt === "number" && String(txt).toLowerCase().includes(value);
    };

    return agentFiltered.filter((order) => {
      // Check basic fields first (most common matches)
      if (
        match(order.orderNo) ||
        match(order._customerName || order.customerName) ||
        match(order.salesAgent) ||
        match(order._partName || order.pReq || order.partName) ||
        match(order.orderStatus)
      ) {
        return true;
      }

      // Check other fields
      if (
        match(order.soldP) ||
        match(order.grossProfit) ||
        match(order.actualGP) ||
        match(order.orderDate) ||
        match(order.email) ||
        match(order.phone) ||
        match(order.make) ||
        match(order.year) ||
        match(order.model)
      ) {
        return true;
      }

      // Check yard info (only if additionalInfo exists)
      if (Array.isArray(order.additionalInfo) && order.additionalInfo.length > 0) {
        return order.additionalInfo.some((info, idx) => {
          return (
            match(`yard ${idx + 1}`) ||
            match(info?.yardName) ||
            match(info?.email) ||
            match(info?.status) ||
            match(info?.stockNo) ||
            match(info?.trackingNo)
          );
        });
      }

      return false;
    });
  }, [agentFiltered, appliedQuery]);

  // sorting
  const handleSort = (columnKey) => {
    if (!columnKey) return;
    clearHighlight();
    if (sortBy === columnKey) {
      const newOrder = sortOrder === "asc" ? "desc" : "asc";
      setSortOrder(newOrder);
      setLS(LS_SORT_ORDER_KEY, newOrder);
    } else {
      setSortBy(columnKey);
      setLS(LS_SORT_BY_KEY, columnKey);
      const newOrder = columnKey === "orderDate" ? "desc" : "asc";
      setSortOrder(newOrder);
      setLS(LS_SORT_ORDER_KEY, newOrder);
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
      if (sortBy === "partName") v = row._partName;
      if (sortBy === "yardName") v = row._yardName;         // string
      if (sortBy === "refundedBy") v = row._refundedBy;       // string
      if (sortBy === "cancelledBy") v = row._cancelledBy;
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
  // NEW: notify parent whenever the visible, sorted rows change
  useEffect(() => {
    if (typeof onRowsChange === "function") onRowsChange(sortedRows);
  }, [sortedRows, onRowsChange]);
  // pagination
  const effectiveRowsPerPage =
    typeof rowsPerPage === "number" && rowsPerPage > 0
      ? rowsPerPage
      : ROWS_PER_PAGE;
  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / effectiveRowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * effectiveRowsPerPage;
  const pageRows = sortedRows.slice(
    pageStart,
    pageStart + effectiveRowsPerPage
  );

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
    if (!highlightedOrderNo || !tableScrollRef.current) return;
    if (restoredScroll) return;
    
    // First, check if the order is in the current page
    let match = pageRows.find((o) => String(o.orderNo) === String(highlightedOrderNo));
    
    // If not in current page, check all sorted rows to find which page it's on
    if (!match && sortedRows?.length > 0) {
      const orderIndex = sortedRows.findIndex((o) => String(o.orderNo) === String(highlightedOrderNo));
      if (orderIndex >= 0) {
        // Calculate which page this order is on
        const targetPage = Math.floor(orderIndex / effectiveRowsPerPage) + 1;
        if (targetPage !== currentPage && targetPage <= totalPages) {
          setCurrentPage(targetPage);
          // The match will be found on the next render after page change
          return;
        }
      }
    }
    
    // If found in current page, scroll to it
    if (match) {
      setTimeout(() => {
        const el = document.getElementById(`row-${match.orderNo}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [pageRows, sortedRows, highlightedOrderNo, restoredScroll, currentPage, totalPages, effectiveRowsPerPage]);

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
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-3xl font-bold text-white underline decoration-1">
          {title}
        </h2>

        {/* Show total label under title only for pages that DO NOT use "totals near pill" */}
        {!showTotalsNearPill && totalLabel && (
          <p className="text-sm text-white/70 mt-1">{totalLabel}</p>
        )}
        {/* RIGHT cluster: pager -> search (same width) -> eye */}
        <div className="ml-auto flex items-center gap-3">
          {/* Pager */}
          {showAgentFilter && userRole === "Admin" && (
            <AgentDropdown
              options={agentOptions}
              value={selectedAgent}
              onChange={(val) => {
                setSelectedAgent(val);
                // Save to localStorage, or remove if "Select" or "All"
                if (val && val !== "Select" && val !== "All") {
                  setLS(LS_AGENT_KEY, val);
                } else {
                  setLS(LS_AGENT_KEY, null);
                }
                setCurrentPage(1);
              }}
              className="ml-2"
            />
          )}
          {/* Search (same width as before) */}
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

          {/* Eye button */}
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


      {/* ===== Subheader: totals + pagination (right) ===== */}
      <div className="mb-4 flex items-center justify-between">
        {/* LEFT: totals + active filter + date picker */}
        <div className="flex items-center gap-4">
          {showTotalsNearPill ? (
            // For pages like CancelledRefundedReport
            <p className="text-sm text-white/80">{totalLabel}</p>
          ) : (
            // For all other pages
            <p className="text-sm text-white/80">
              Total Orders: <strong>{sortedRows.length}</strong>
            </p>
          )}


          {activeFilter && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
              {prettyFilterLabel(activeFilter)}
            </span>
          )}

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
        </div>

        {/* RIGHT: compact pagination */}
        <div className="flex items-center gap-2 text-white font-medium">
          <button
            disabled={safePage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className={`h-6 px-2 rounded-full transition ${safePage === 1
              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
              : "bg-gray-700 hover:bg-gray-600"
              }`}
            aria-label="Previous page"
          >
            <FaChevronLeft size={12} />
          </button>

          <span className="h-6 px-3 inline-flex items-center justify-center bg-gray-800 rounded-full text-xs shadow">
            Page <strong className="mx-1">{safePage}</strong> of {totalPages}
          </span>

          <button
            disabled={safePage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className={`h-6 px-2 rounded-full transition ${safePage === totalPages
              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
              : "bg-gray-700 hover:bg-gray-600"
              }`}
            aria-label="Next page"
          >
            <FaChevronRight size={12} />
          </button>
        </div>
      </div>
      {/* ===== Desktop table ===== */}
      <div
        ref={tableScrollRef}
        className="hidden md:block max-h-[76vh] overflow-y-auto overflow-x-auto rounded-xl ring-1 ring-white/10 shadow
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
              {!hideDefaultActions && <th className="p-3 text-left whitespace-nowrap">Actions</th>}
            </tr>
          </thead>

          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (hideDefaultActions ? 0 : 1)} className="p-6 text-center text-white/80">
                  No orders found.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const rowId = row.orderNo || row._id || `${row.orderDate || ""}-${Math.random()}`;
                const isHighlighted = highlightedOrderNo === String(row.orderNo || row._id);
                return (
                  <tr
                    key={rowId}
                    id={`row-${rowId}`}
                    onClick={() => {
                      if (row.orderNo) toggleHighlight(row.orderNo);
                      else if (row._id) toggleHighlight(row._id);
                    }}
                    className={`transition text-sm cursor-pointer ${isHighlighted
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
                    {!hideDefaultActions && (
                      <td className="p-2.5">
                        <div className="flex gap-2">
                          {(() => {
                            const restrictedStatuses = ["Placed", "Partially charged order"];
                            const isRestricted = restrictedStatuses.includes(row.orderStatus);
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isRestricted) {
                                    if (tableScrollRef.current) {
                                      sessionStorage.setItem(
                                        SCROLL_KEY,
                                        String(tableScrollRef.current.scrollTop || 0)
                                      );
                                    }
                                     if (row.orderNo) {
                                       // Immediately highlight the row before navigation
                                       setHighlightedOrderNo(String(row.orderNo));
                                       setLS(LS_HILITE_KEY, String(row.orderNo));
                                       setLS(LS_PAGE_KEY, String(safePage));
                                       // Also save current search, agent filter, sort state, and date filter to restore them when coming back
                                       // Save the applied query (what's actually filtering), but also ensure searchInput is saved if it exists
                                       const searchToSave = appliedQuery || searchInput.trim();
                                       if (searchToSave) {
                                         setLS(LS_SEARCH_KEY, searchToSave);
                                       }
                                       // Save selected agent filter
                                       if (selectedAgent && selectedAgent !== "Select") {
                                         setLS(LS_AGENT_KEY, selectedAgent);
                                       }
                                       // Save sort state
                                       if (sortBy) {
                                         setLS(LS_SORT_BY_KEY, sortBy);
                                       }
                                       if (sortOrder) {
                                         setLS(LS_SORT_ORDER_KEY, sortOrder);
                                       }
                                       if (activeFilter) {
                                         setJSON(LS_FILTER_KEY, activeFilter);
                                       }
                                       // Small delay to show highlight before navigation
                                       setTimeout(() => {
                                         navigate(gotoPath(row));
                                       }, 50);
                                     }
                                  }
                                }}
                                disabled={isRestricted}
                                className={`px-3 py-1 text-xs rounded text-white ${
                                  isRestricted
                                    ? "bg-gray-500/50 cursor-not-allowed opacity-50"
                                    : "bg-[#2c5d81] hover:bg-blue-700"
                                }`}
                                title={isRestricted ? "Order details not available for this status" : ""}
                              >
                                View
                              </button>
                            );
                          })()}
                          {userRole === "Sales" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (row.orderNo) {
                                  navigate(`/edit-order?orderNo=${encodeURIComponent(row.orderNo)}`);
                                }
                              }}
                              className="px-3 py-1 text-xs rounded bg-[#3d7ba8] hover:bg-[#4a8bb8] text-white"
                              title="Edit Order"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    )}
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
                className={`rounded-xl p-4 backdrop-blur-md border text-white transition ${isHighlighted
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

                <div className="mt-3 flex gap-2">
                  {(() => {
                    const restrictedStatuses = ["Placed", "Partially charged order"];
                    const isRestricted = restrictedStatuses.includes(row.orderStatus);
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                           if (!isRestricted && row.orderNo) {
                             // Immediately highlight the row before navigation
                             setHighlightedOrderNo(String(row.orderNo));
                             setLS(LS_HILITE_KEY, String(row.orderNo));
                             setLS(LS_PAGE_KEY, String(safePage));
                             // Also save current search, agent filter, sort state, and date filter to restore them when coming back
                             // Save the applied query (what's actually filtering), but also ensure searchInput is saved if it exists
                             const searchToSave = appliedQuery || searchInput.trim();
                             if (searchToSave) {
                               setLS(LS_SEARCH_KEY, searchToSave);
                             }
                             // Save selected agent filter
                             if (selectedAgent && selectedAgent !== "Select") {
                               setLS(LS_AGENT_KEY, selectedAgent);
                             }
                             // Save sort state
                             if (sortBy) {
                               setLS(LS_SORT_BY_KEY, sortBy);
                             }
                             if (sortOrder) {
                               setLS(LS_SORT_ORDER_KEY, sortOrder);
                             }
                             if (activeFilter) {
                               setJSON(LS_FILTER_KEY, activeFilter);
                             }
                             // Small delay to show highlight before navigation
                             setTimeout(() => {
                               navigate(gotoPath(row));
                             }, 50);
                           }
                        }}
                        disabled={isRestricted}
                        className={`flex-1 px-3 py-2 text-sm rounded text-white ${
                          isRestricted
                            ? "bg-gray-500/50 cursor-not-allowed opacity-50"
                            : "bg-[#2c5d81] hover:bg-blue-700"
                        }`}
                        title={isRestricted ? "Order details not available for this status" : ""}
                      >
                        View
                      </button>
                    );
                  })()}
                  {userRole === "Sales" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (row.orderNo) {
                          navigate(`/edit-order?orderNo=${encodeURIComponent(row.orderNo)}`);
                        }
                      }}
                      className="flex-1 px-3 py-2 text-sm rounded bg-[#3d7ba8] hover:bg-[#4a8bb8] text-white"
                      title="Edit Order"
                    >
                      Edit
                    </button>
                  )}
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
                navigator.clipboard?.writeText(text).catch(() => { });
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
