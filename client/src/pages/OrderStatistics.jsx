// src/pages/OrderStatistics.jsx
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import StateDropdown from "../components/StateDropdown";
import { formatInTimeZone } from "date-fns-tz";
import { STATES } from "../data/states";

const TZ = "America/Chicago";

// Helper to get full state name from code
function getStateName(stateCode) {
  if (!stateCode) return "Unknown";
  const state = STATES.find((s) => s.code === stateCode.toUpperCase());
  return state ? state.name : stateCode;
}

// localStorage helpers
const getJSON = (k) => {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

function readAuthFromStorage() {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        role: parsed?.user?.role || localStorage.getItem("role") || undefined,
        email: parsed?.user?.email || localStorage.getItem("email") || undefined,
      };
    }
  } catch (err) {
    console.warn("Failed to parse auth storage", err);
  }
  
  return {
    role: localStorage.getItem("role") || undefined,
    email: localStorage.getItem("email") || undefined,
  };
}

/* ---------- Columns ---------- */
const columns = [
  { key: "state", label: "State" },
  { key: "total", label: "Total Orders" },
  { key: "cancelled", label: "Cancelled" },
  { key: "disputed", label: "Disputed" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "sameDayCancellation", label: "Same Day Cancellation" },
];

/* ---------- Helpers ---------- */
function formatDateSafe(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}


/* ---------- Extra totals for modal ---------- */
const extraTotals = (rows) => {
  const totals = rows.reduce(
    (acc, row) => ({
      total: acc.total + (Number(row.total) || 0),
      cancelled: acc.cancelled + (Number(row.cancelled) || 0),
      disputed: acc.disputed + (Number(row.disputed) || 0),
      fulfilled: acc.fulfilled + (Number(row.fulfilled) || 0),
      sameDayCancellation: acc.sameDayCancellation + (Number(row.sameDayCancellation) || 0),
    }),
    { total: 0, cancelled: 0, disputed: 0, fulfilled: 0, sameDayCancellation: 0 }
  );

  return [
    { name: "Total Orders", value: totals.total },
    { name: "Total Cancelled", value: totals.cancelled },
    { name: "Total Disputed", value: totals.disputed },
    { name: "Total Fulfilled", value: totals.fulfilled },
    { name: "Total Same Day Cancellation", value: totals.sameDayCancellation },
  ];
};

/* ---------- Page ---------- */
export default function OrderStatistics() {
  const { role, email } = useMemo(() => readAuthFromStorage(), []);
  
  // Only allow Admin and specific email
  const isAdmin = role === "Admin";
  const isAuthorizedEmail = email?.toLowerCase() === "50starsauto110@gmail.com";
  const isAuthorized = isAdmin || isAuthorizedEmail;
  
  // Show unauthorized message if user doesn't have access
  if (!isAuthorized) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h1>
          <p className="text-white/70">
            This page is only accessible to Admin accounts and 50starsauto110@gmail.com.
          </p>
          <p className="text-white/50 mt-2">Your current role: {role || "Not set"}</p>
          <p className="text-white/50">Your email: {email || "Not set"}</p>
        </div>
      </div>
    );
  }

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [totalLabel, setTotalLabel] = useState("Total Rows: 0");
  
  // Initialize default sort for Order Statistics (total descending) - run immediately
  // Always set to total descending on page load, regardless of saved value
  const LS_SORT_BY_KEY = "orderStatisticsPage_sortBy";
  const LS_SORT_ORDER_KEY = "orderStatisticsPage_sortOrder";
  localStorage.setItem(LS_SORT_BY_KEY, "total");
  localStorage.setItem(LS_SORT_ORDER_KEY, "desc");
  
  // State filter - restore from localStorage
  const LS_STATE_FILTER_KEY = "orderStatisticsStateFilter";
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
  
  const [selectedState, setSelectedState] = useState(getLS(LS_STATE_FILTER_KEY, ""));

  const renderCell = useCallback(
    (row, key) => {
      switch (key) {
        case "state":
          const stateCode = row.state || "";
          const stateName = getStateName(stateCode);
          return stateName || "—";
        
        case "total":
          return Number(row.total || 0).toLocaleString();
        
        case "cancelled":
          return Number(row.cancelled || 0).toLocaleString();
        
        case "disputed":
          return Number(row.disputed || 0).toLocaleString();
        
        case "fulfilled":
          return Number(row.fulfilled || 0).toLocaleString();
        
        case "sameDayCancellation":
          return Number(row.sameDayCancellation || 0).toLocaleString();
        
        default:
          return row[key] ?? "—";
      }
    },
    []
  );

  // Build params with date filtering (same as MonthlyOrders)
  const paramsBuilder = useCallback(({ filter }) => {
    const params = {};
    if (filter?.start && filter?.end) {
      params.start = filter.start;
      params.end = filter.end;
    } else {
      params.month = filter?.month;
      params.year = filter?.year;
    }
    return params;
  }, []);

  // Use ref to access latest selectedState in fetchOverride
  const selectedStateRef = useRef(selectedState);
  useEffect(() => {
    selectedStateRef.current = selectedState;
  }, [selectedState]);

  // Fetch from statistics endpoint with date filtering
  const fetchOverride = useCallback(async ({ filter, query, sortBy, sortOrder, selectedAgent, userRole, firstName }) => {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const params = paramsBuilder({ filter });
    const stats = await API.get(`/orders/statistics`, { params, headers });
    const data = Array.isArray(stats.data) ? stats.data : [];
    
    // Apply client-side filtering if needed
    let filtered = data;
    
    // Filter by selected state if provided (use ref to get latest value)
    const currentState = selectedStateRef.current;
    if (currentState && currentState !== "") {
      filtered = filtered.filter((stat) => {
        const statState = (stat.state || "").toUpperCase().trim();
        const filterState = currentState.toUpperCase().trim();
        return statState === filterState;
      });
    }
    
    // Filter by query/search if provided (search by both code and full name)
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      filtered = filtered.filter((stat) => {
        const stateCode = (stat.state || "").toLowerCase();
        const stateName = getStateName(stat.state || "").toLowerCase();
        return stateCode.includes(q) || stateName.includes(q);
      });
    }
    
    // ALWAYS sort by total descending for Order Statistics page
    // This ensures data is pre-sorted correctly regardless of what OrdersTable's sortBy is
    filtered.sort((a, b) => {
      const aTotal = Number(a.total || 0);
      const bTotal = Number(b.total || 0);
      return bTotal - aTotal; // Always descending by total
    });
    
    // If user wants to sort by other numeric columns (cancelled, disputed, etc.), allow it
    // But only if sortBy is explicitly set to one of those columns (not "state" or "orderDate")
    if (sortBy && sortBy !== "state" && sortBy !== "orderDate" && sortBy !== "total") {
      if (sortBy === "cancelled" || sortBy === "disputed" || sortBy === "fulfilled" || sortBy === "sameDayCancellation") {
        filtered.sort((a, b) => {
          const aVal = Number(a[sortBy] || 0);
          const bVal = Number(b[sortBy] || 0);
          const dir = sortOrder === "desc" ? -1 : 1;
          return (aVal - bVal) * dir;
        });
      }
    }
    
    return filtered;
  }, [paramsBuilder]);

  const onRowsChange = useCallback((rows) => {
    // Sum the Total Orders column across all states so it matches Monthly Orders
    const totalOrders = rows.reduce(
      (sum, row) => sum + (Number(row.total) || 0),
      0
    );
    setTotalLabel(`Total Orders: ${totalOrders.toLocaleString()}`);
  }, []);

  // Get unique states from all available data (fetch all states regardless of date filter for dropdown)
  const [availableStates, setAvailableStates] = useState([]);
  
  // Fetch all states for dropdown (without date filter)
  useEffect(() => {
    const fetchAllStates = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        // Fetch without date filter to get all states
        const stats = await API.get(`/orders/statistics`, { headers });
        const data = Array.isArray(stats.data) ? stats.data : [];
        const uniqueStates = [...new Set(data.map((s) => s.state).filter(Boolean))].sort();
        setAvailableStates(uniqueStates);
      } catch (err) {
        console.error("Failed to fetch states for dropdown", err);
      }
    };
    fetchAllStates();
  }, []);

  // Prepare state dropdown options
  const stateOptions = useMemo(() => {
    const options = [
      { value: "", label: "Select State" }
    ];
    availableStates.forEach((stateCode) => {
      const stateName = getStateName(stateCode);
      options.push({
        value: stateCode,
        label: `${stateName} (${stateCode})`
      });
    });
    return options;
  }, [availableStates]);

  // Handle state filter change
  const handleStateChange = useCallback((newState) => {
    setSelectedState(newState);
    setLS(LS_STATE_FILTER_KEY, newState);
    // Trigger refetch - use setTimeout to ensure state is updated first
    setTimeout(() => {
      if (window.__ordersTableRefs?.orderStatistics?.refetch) {
        window.__ordersTableRefs.orderStatistics.refetch();
      }
    }, 0);
  }, []);


  return (
    <OrdersTable
      title="Order Statistics"
      endpoint="/orders/statistics"
      storageKeys={{
        page: "orderStatisticsPage",
        search: "orderStatisticsSearch",
        filter: "orderStatisticsFilter",
        hilite: "orderStatisticsHilite",
      }}
      columns={columns}
      renderCell={renderCell}
      showAgentFilter={false}
      showTotalsButton={true}
      extraTotals={extraTotals}
      paramsBuilder={paramsBuilder}
      fetchOverride={fetchOverride}
      onRowsChange={onRowsChange}
      totalLabel={totalLabel}
      showTotalsNearPill={true}
      hideDefaultActions={true}
      tableId="orderStatistics"
      customFilters={
        <StateDropdown
          options={stateOptions}
          value={selectedState}
          onChange={handleStateChange}
          className="ml-2"
        />
      }
    />
  );
}
