// src/pages/MakeStatistics.jsx
import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import StateDropdown from "../components/StateDropdown";
import { STATES } from "../data/states";

// Helper to get full state name from code
function getStateName(stateCode) {
  if (!stateCode) return "Unknown";
  const state = STATES.find((s) => s.code === stateCode.toUpperCase());
  return state ? state.name : stateCode;
}

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
  { key: "make", label: "Make" },
  { key: "part", label: "Part" },
  { key: "state", label: "State" },
  { key: "count", label: "Orders Count" },
];

/* ---------- Extra totals for modal ---------- */
const extraTotals = (rows) => {
  const totalOrders = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const uniqueMakes = new Set(rows.map((r) => r.make)).size;
  const uniqueParts = new Set(rows.map((r) => r.part)).size;
  const uniqueStates = new Set(rows.map((r) => r.state)).size;

  return [
    { name: "Total Orders", value: totalOrders.toLocaleString() },
    { name: "Unique Makes", value: uniqueMakes },
    { name: "Unique Parts", value: uniqueParts },
    { name: "Unique States", value: uniqueStates },
  ];
};

/* ---------- Page ---------- */
export default function MakeStatistics() {
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
  const [totalLabel, setTotalLabel] = useState("Total Orders: 0");
  
  // Make filter - restore from localStorage
  const LS_MAKE_FILTER_KEY = "makeStatisticsMakeFilter";
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
  
  const [selectedMake, setSelectedMake] = useState(getLS(LS_MAKE_FILTER_KEY, ""));
  
  // Use ref to access latest selectedMake in fetchOverride
  const selectedMakeRef = useRef(selectedMake);
  useEffect(() => {
    selectedMakeRef.current = selectedMake;
  }, [selectedMake]);

  const renderCell = useCallback(
    (row, key) => {
      switch (key) {
        case "make":
          return <span className="font-semibold">{row.make || "—"}</span>;
        
        case "part":
          return row.part || "—";
        
        case "state":
          const stateCode = row.state || "";
          const stateName = getStateName(stateCode);
          return stateName || "—";
        
        case "count":
          return Number(row.count || 0).toLocaleString();
        
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

  // Fetch from makeStatistics endpoint with date filtering
  const fetchOverride = useCallback(async ({ filter, query, sortBy, sortOrder }) => {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const params = paramsBuilder({ filter });
    const stats = await API.get(`/orders/makeStatistics`, { params, headers });
    const data = Array.isArray(stats.data) ? stats.data : [];
    
    // Apply client-side filtering if needed
    let filtered = data;
    
    // Filter by selected make if provided (use ref to get latest value)
    const currentMake = selectedMakeRef.current;
    if (currentMake && currentMake !== "") {
      filtered = filtered.filter((stat) => {
        const statMake = (stat.make || "").trim();
        const filterMake = currentMake.trim();
        return statMake.toLowerCase() === filterMake.toLowerCase();
      });
    }
    
    // Filter by query/search if provided
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      filtered = filtered.filter((stat) => {
        const make = (stat.make || "").toLowerCase();
        const part = (stat.part || "").toLowerCase();
        const stateCode = (stat.state || "").toLowerCase();
        const stateName = getStateName(stat.state || "").toLowerCase();
        return (
          make.includes(q) ||
          part.includes(q) ||
          stateCode.includes(q) ||
          stateName.includes(q)
        );
      });
    }
    
    // Sort
    if (sortBy) {
      filtered.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        const dir = sortOrder === "desc" ? -1 : 1;
        
        if (typeof aVal === "number" && typeof bVal === "number") {
          return (aVal - bVal) * dir;
        }
        
        // For state column, sort by full name instead of code
        if (sortBy === "state") {
          const aName = getStateName(aVal || "").toLowerCase();
          const bName = getStateName(bVal || "").toLowerCase();
          return aName.localeCompare(bName) * dir;
        }
        
        const aStr = String(aVal || "").toLowerCase();
        const bStr = String(bVal || "").toLowerCase();
        return aStr.localeCompare(bStr) * dir;
      });
    }
    
    return filtered;
  }, [paramsBuilder]);
  
  // Get unique makes from all available data for dropdown
  const [availableMakes, setAvailableMakes] = useState([]);
  
  // Fetch all makes for dropdown (without date filter)
  useEffect(() => {
    const fetchAllMakes = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        // Fetch without date filter to get all makes
        const stats = await API.get(`/orders/makeStatistics`, { headers });
        const data = Array.isArray(stats.data) ? stats.data : [];
        const uniqueMakes = [...new Set(data.map((s) => s.make).filter(Boolean))].sort();
        setAvailableMakes(uniqueMakes);
      } catch (err) {
        console.error("Failed to fetch makes for dropdown", err);
      }
    };
    fetchAllMakes();
  }, []);

  // Prepare make dropdown options
  const makeOptions = useMemo(() => {
    const options = [
      { value: "", label: "Select Make" }
    ];
    availableMakes.forEach((make) => {
      options.push({
        value: make,
        label: make
      });
    });
    return options;
  }, [availableMakes]);

  // Handle make filter change
  const handleMakeChange = useCallback((newMake) => {
    setSelectedMake(newMake);
    setLS(LS_MAKE_FILTER_KEY, newMake);
    // Trigger refetch - use setTimeout to ensure state is updated first
    setTimeout(() => {
      if (window.__ordersTableRefs?.makeStatistics?.refetch) {
        window.__ordersTableRefs.makeStatistics.refetch();
      }
    }, 0);
  }, []);

  const onRowsChange = useCallback((rows) => {
    // Sum the count column
    const totalOrders = rows.reduce(
      (sum, row) => sum + (Number(row.count) || 0),
      0
    );
    setTotalLabel(`Total Orders: ${totalOrders.toLocaleString()}`);
  }, []);

  return (
    <OrdersTable
      title="Make Statistics"
      endpoint="/orders/makeStatistics"
      storageKeys={{
        page: "makeStatisticsPage",
        search: "makeStatisticsSearch",
        filter: "makeStatisticsFilter",
        hilite: "makeStatisticsHilite",
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
      tableId="makeStatistics"
      customFilters={
        <StateDropdown
          options={makeOptions}
          value={selectedMake}
          onChange={handleMakeChange}
          className="ml-2"
        />
      }
    />
  );
}
