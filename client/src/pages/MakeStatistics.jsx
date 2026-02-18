// src/pages/MakeStatistics.jsx
import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import API from "../api";
import OrdersTable from "../components/OrdersTable";
import StateDropdown from "../components/StateDropdown";
import { STATES } from "../data/states";
import useBrand from "../hooks/useBrand";

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
  { key: "absModule", label: "ABS Module" },
  { key: "transmission", label: "Transmission" },
  { key: "engine", label: "Engine" },
  { key: "others", label: "Others" },
  { key: "total", label: "Total" },
  { key: "top3States", label: "Top 3 States" },
  { key: "top3Models", label: "Top 3 Models" },
];

/* ---------- Extra totals for modal ---------- */
const extraTotals = (rows) => {
  const totalOrders = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  const totalABS = rows.reduce((sum, row) => sum + (Number(row.absModule) || 0), 0);
  const totalTransmission = rows.reduce((sum, row) => sum + (Number(row.transmission) || 0), 0);
  const totalEngine = rows.reduce((sum, row) => sum + (Number(row.engine) || 0), 0);
  const totalOthers = rows.reduce((sum, row) => sum + (Number(row.others) || 0), 0);
  const uniqueMakes = new Set(rows.map((r) => r.make)).size;

  return [
    { name: "Total Orders", value: totalOrders.toLocaleString() },
    { name: "Total ABS Module", value: totalABS.toLocaleString() },
    { name: "Total Transmission", value: totalTransmission.toLocaleString() },
    { name: "Total Engine", value: totalEngine.toLocaleString() },
    { name: "Total Others", value: totalOthers.toLocaleString() },
    { name: "Unique Makes", value: uniqueMakes },
  ];
};

/* ---------- Page ---------- */
export default function MakeStatistics() {
  const brand = useBrand();
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
        
        case "absModule":
          return Number(row.absModule || 0).toLocaleString();
        
        case "transmission":
          return Number(row.transmission || 0).toLocaleString();
        
        case "engine":
          return Number(row.engine || 0).toLocaleString();
        
        case "others":
          return Number(row.others || 0).toLocaleString();
        
        case "total":
          return <span className="font-semibold">{Number(row.total || 0).toLocaleString()}</span>;
        
        case "top3States":
          // Format top3States string to show state names instead of codes
          if (!row.top3States || row.top3States === "—") return "—";
          const statesStr = row.top3States;
          // Replace state codes with state names
          const formatted = statesStr.replace(/([A-Z]{2,})\s*\((\d+)\)/g, (match, code, count) => {
            const stateName = getStateName(code);
            return `${stateName} (${count})`;
          });
          return <span className="text-sm">{formatted}</span>;
        
        case "top3Models":
          // Display top 3 models as-is (already formatted from backend)
          if (!row.top3Models || row.top3Models === "—") return "—";
          return <span className="text-sm">{row.top3Models}</span>;
        
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
        const top3States = (stat.top3States || "").toLowerCase();
        // Check if query matches make or any state in top3States
        return make.includes(q) || top3States.includes(q);
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
        
        
        const aStr = String(aVal || "").toLowerCase();
        const bStr = String(bVal || "").toLowerCase();
        return aStr.localeCompare(bStr) * dir;
      });
    }
    
    return filtered;
  }, [paramsBuilder, brand]);
  
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
  }, [brand]);

  // Auto-refetch when brand changes
  useEffect(() => {
    if (window.__ordersTableRefs?.makeStatistics?.refetch) {
      window.__ordersTableRefs.makeStatistics.refetch();
    }
  }, [brand]);

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
    // Sum the total column
    const totalOrders = rows.reduce(
      (sum, row) => sum + (Number(row.total) || 0),
      0
    );
    setTotalLabel(`Total Orders: ${totalOrders.toLocaleString()}`);
  }, []);

  return (
    <OrdersTable
      title="Make/Model Statistics"
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
