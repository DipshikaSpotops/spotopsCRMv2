// src/pages/ViewUserActivity.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  FaSort, FaSortUp, FaSortDown,
  FaChevronLeft, FaChevronRight,
  FaTable, FaStream, FaSearch
} from "react-icons/fa";
import { formatInTimeZone } from "date-fns-tz";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import useSort from "../hooks/useSort";

const PAGE_SIZE = 25;

// Map activity type -> label + accent (and an emoji for timeline flair)
const TYPE_META = {
  login:        { label: "Login",        accent: "bg-emerald-600",  icon: "🔑" },
  logout:       { label: "Logout",       accent: "bg-gray-500",     icon: "🚪" },
  create:       { label: "Create",       accent: "bg-blue-600",     icon: "🆕" },
  update:       { label: "Update",       accent: "bg-amber-600",    icon: "✏️" },
  delete:       { label: "Delete",       accent: "bg-rose-600",     icon: "🗑️" },
  action:       { label: "Action",       accent: "bg-indigo-600",   icon: "⚡"  },
};

function formatDate(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, "America/Chicago", "dd MMM yyyy, hh:mm a zzz");
}

export default function ViewUserActivity() {
  const [activities, setActivities]   = useState([]);
  const [users, setUsers]             = useState([]); // for filter dropdown
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  // filters / search / view mode
  const [search, setSearch]           = useState("");
  const [userId, setUserId]           = useState("");          // filter by user
  const [type, setType]               = useState("");          // filter by type
  const [currentPage, setCurrentPage] = useState(1);
  const [view, setView]               = useState("timeline");  // "timeline" | "table"
  const [dateFilter, setDateFilter]   = useState({});          // {start, end} or {month, year}

  // sort (table view only): default by timestamp desc
  const { sortBy, sortOrder, handleSort, sortData } = useSort("createdAt", "desc");

  // ===== Fetch =====
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true); setError("");
      try {
        // get users for filter dropdown (optional)
        const usersRes = await axios.get("http://localhost:5000/api/users");
        if (mounted) setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      } catch {}
      try {
        const params = buildParams({ ...dateFilter, userId, type, search: search || undefined });
        const { data } = await axios.get("http://localhost:5000/api/user-activity", { params });
        if (mounted) setActivities(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        if (mounted) setError("Failed to load activity.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [userId, type, dateFilter, search]);

  // Helpers
  function buildParams(filter) {
    const p = {};
    if (filter.start && filter.end) { p.start = filter.start; p.end = filter.end; }
    else if (filter.month && filter.year) { p.month = filter.month; p.year = filter.year; }
    if (filter.userId) p.userId = filter.userId;
    if (filter.type)   p.type   = filter.type;
    if (filter.search) p.search = filter.search;
    return p;
    // Your backend can accept these params and return filtered activity
  }

  // UnifiedDatePicker → keep raw values; pass ISO strings to backend
  const handleFilterChange = (f) => {
    setDateFilter(f || {});
    setCurrentPage(1);
  };

  // Client-side search fallback (if your API doesn’t search)
  const localSearch = search.trim().toLowerCase();
  const locallyFiltered = useMemo(() => {
    if (!localSearch) return activities;
    return activities.filter(a => {
      const hay = [
        a?.actorName, a?.actorEmail, a?.type, a?.entity, a?.summary, a?.meta && JSON.stringify(a.meta)
      ].filter(Boolean).map(x => x.toString().toLowerCase());
      return hay.some(x => x.includes(localSearch));
    });
  }, [activities, localSearch]);

  // If in table mode, we sort; timeline stays naturally by date (desc)
  const prepped = useMemo(() => {
    if (view === "table") return sortData(locallyFiltered);
    // timeline default sort: newest first
    return [...locallyFiltered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [view, locallyFiltered, sortBy, sortOrder, sortData]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(prepped.length / PAGE_SIZE));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows  = useMemo(() => prepped.slice(pageStart, pageStart + PAGE_SIZE), [prepped, pageStart]);

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#04356d]">User Activity</h1>
          <p className="text-sm text-[#04356d]/70">
            Showing <strong>{prepped.length}</strong> events
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="pl-9 pr-3 py-2 rounded border border-gray-300 text-sm"
              placeholder="Search actor, email, type, entity…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <select
            className="px-3 py-2 rounded border border-gray-300 text-sm bg-white"
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setCurrentPage(1); }}
          >
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u._id} value={u._id}>
                {u.firstName} {u.lastName} ({u.email})
              </option>
            ))}
          </select>

          <select
            className="px-3 py-2 rounded border border-gray-300 text-sm bg-white"
            value={type}
            onChange={(e) => { setType(e.target.value); setCurrentPage(1); }}
          >
            <option value="">All Types</option>
            {Object.keys(TYPE_META).map(t => (
              <option key={t} value={t}>{TYPE_META[t].label}</option>
            ))}
          </select>

          <UnifiedDatePicker onFilterChange={handleFilterChange} />

          <div className="inline-flex rounded overflow-hidden border border-gray-300">
            <button
              onClick={() => setView("timeline")}
              className={`px-3 py-2 text-sm ${view === "timeline" ? "bg-[#2c5d81] text-white" : "bg-white text-[#2c5d81]"}`}
              title="Timeline view"
            >
              <FaStream />
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-3 py-2 text-sm ${view === "table" ? "bg-[#2c5d81] text-white" : "bg-white text-[#2c5d81]"}`}
              title="Table view"
            >
              <FaTable />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="bg-white/70 rounded-lg shadow p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#04356d]">⏳ Loading activity…</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : prepped.length === 0 ? (
          <div className="p-10 text-center text-[#04356d]">
            <div className="text-xl font-semibold">No activity found</div>
            <div className="text-sm opacity-70 mt-1">Try adjusting filters or date range.</div>
          </div>
        ) : view === "timeline" ? (
          <TimelineList rows={pageRows} />
        ) : (
          <ActivityTable
            rows={pageRows}
            sortBy={sortBy}
            sortOrder={sortOrder}
            handleSort={handleSort}
          />
        )}
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          className="px-3 py-1 bg-gray-700 rounded text-white disabled:opacity-50"
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
        >
          <FaChevronLeft />
        </button>
        <span className="text-[#04356d]">Page {currentPage} of {totalPages}</span>
        <button
          className="px-3 py-1 bg-gray-700 rounded text-white disabled:opacity-50"
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
        >
          <FaChevronRight />
        </button>
      </div>
    </div>
  );
}

/* ------------------------ Subcomponents ------------------------ */

function ActivityTable({ rows, sortBy, sortOrder, handleSort }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1000px] w-full">
        <thead className="bg-[#5c8bc1] text-white sticky top-0 z-10">
          <tr>
            {[
              { key: "createdAt",  label: "Timestamp" },
              { key: "actorName",  label: "Actor" },
              { key: "actorEmail", label: "Email" },
              { key: "type",       label: "Type" },
              { key: "entity",     label: "Entity" },
              { key: "summary",    label: "Summary" },
            ].map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="p-3 text-left cursor-pointer border-b border-white/20"
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {sortBy === col.key ? (
                    sortOrder === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />
                  ) : (
                    <FaSort className="text-xs text-white/70" />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a._id} className="odd:bg-white even:bg-slate-50 hover:bg-blue-50 transition">
              <td className="p-3 align-top">{formatDate(a.createdAt)}</td>
              <td className="p-3 align-top">{a.actorName || "—"}</td>
              <td className="p-3 align-top">{a.actorEmail || "—"}</td>
              <td className="p-3 align-top">
                <TypePill type={a.type} />
              </td>
              <td className="p-3 align-top">{a.entity || "—"}</td>
              <td className="p-3 align-top">
                <div className="text-gray-900">{a.summary || "—"}</div>
                {a.meta ? (
                  <div className="mt-1 text-xs text-gray-500 break-words">
                    {typeof a.meta === "string" ? a.meta : JSON.stringify(a.meta)}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineList({ rows }) {
  return (
    <div className="p-6">
      <ol className="relative border-s border-gray-300">
        {rows.map((a, idx) => {
          const m = TYPE_META[a.type] || TYPE_META.action;
          return (
            <li key={a._id || idx} className="mb-8 ms-4">
              <span
                className={`absolute -start-3 flex h-6 w-6 items-center justify-center rounded-full ring-8 ring-white ${m.accent} text-white text-xs`}
                title={m.label}
              >
                {m.icon}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <TypePill type={a.type} />
                <span className="text-sm text-gray-500">{formatDate(a.createdAt)}</span>
              </div>
              <h3 className="mt-1 font-semibold text-gray-900">
                {a.summary || m.label}
              </h3>
              <div className="text-sm text-gray-700">
                {a.actorName || "Unknown"} {a.actorEmail ? `• ${a.actorEmail}` : ""}
                {a.entity ? ` • ${a.entity}` : ""}
              </div>
              {a.meta ? (
                <pre className="mt-2 bg-gray-50 p-3 rounded text-xs text-gray-700 overflow-auto">
                  {typeof a.meta === "string" ? a.meta : JSON.stringify(a.meta, null, 2)}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TypePill({ type }) {
  const m = TYPE_META[type] || TYPE_META.action;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full text-white ${m.accent}`}>
      {m.label}
    </span>
  );
}
