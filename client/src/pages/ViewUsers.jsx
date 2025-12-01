import React, { useEffect, useMemo, useState } from "react";
import API from "../api";
import {
  FaSort, FaSortUp, FaSortDown, FaChevronLeft, FaChevronRight, FaPlus, FaEdit, FaSave, FaTimes, FaEye, FaEyeSlash
} from "react-icons/fa";
import { formatInTimeZone } from "date-fns-tz";
import useSort from "../hooks/useSort";

const PAGE_SIZE = 20;
const TEAMS = ["Shankar", "Vinutha"];
const ROLES = ["Admin", "Sales", "Support"];

// Memoized date formatting with cache for performance
const dateFormatCache = new Map();
const MAX_CACHE_SIZE = 1000;

function formatDate(dt) {
  if (!dt) return "—";
  
  // Check cache first
  if (dateFormatCache.has(dt)) {
    return dateFormatCache.get(dt);
  }
  
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "—";
  
  const formatted = formatInTimeZone(d, "America/Chicago", "dd MMM yyyy, hh:mm a zzz");
  
  // Cache the result (with size limit to prevent memory issues)
  if (dateFormatCache.size >= MAX_CACHE_SIZE) {
    const firstKey = dateFormatCache.keys().next().value;
    dateFormatCache.delete(firstKey);
  }
  dateFormatCache.set(dt, formatted);
  
  return formatted;
}

export default function ViewUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    firstName: "", lastName: "", email: "", team: "", role: "", password: ""
  });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  // sort: default by createdAt desc
  const { sortBy, sortOrder, handleSort, sortData } = useSort("createdAt", "desc");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // API base URL already includes /api, so use "users" not "/api/users"
        const { data } = await API.get("users");
        if (mounted) setUsers(Array.isArray(data) ? data : []);
      } catch (e) {
        if (mounted) setError("Failed to load users.");
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // search + filters on the full dataset
  const normalized = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    let out = users;
    if (roleFilter) out = out.filter(u => u.role === roleFilter);
    if (normalized) {
      out = out.filter(u => {
        const fields = [
          u.firstName, u.lastName, u.email, u.team, u.role,
        ].filter(Boolean).map(x => x.toString().toLowerCase());
        const name = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
        return fields.some(f => f.includes(normalized)) || name.includes(normalized);
      });
    }
    return out;
  }, [users, roleFilter, normalized]);

  // sort then paginate
  const sorted = useMemo(() => sortData(filtered), [filtered, sortBy, sortOrder, sortData]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = useMemo(() => sorted.slice(pageStart, pageStart + PAGE_SIZE), [sorted, pageStart]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this user? This cannot be undone.")) return;
    try {
      // API base URL already includes /api, so use "users" not "/api/users"
      await API.delete(`users/${id}`);
      setUsers(prev => prev.filter(u => u._id !== id));
    } catch (e) {
      alert("Failed to delete user.");
      console.error(e);
    }
  };

  const startEdit = (u) => {
    setEditingId(u._id);
    setShowPwd(false);
    setEditForm({
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      email: u.email || "",
      team: u.team || "",
      role: u.role || "",
      password: "", // empty => unchanged
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ firstName: "", lastName: "", email: "", team: "", role: "", password: "" });
    setShowPwd(false);
  };

  const onEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(f => ({ ...f, [name]: value }));
  };

  // only send changed fields
  function diffPayload(original, edited) {
    const payload = {};
    ["firstName", "lastName", "email", "team", "role"].forEach(k => {
      const newVal = edited[k];
      const oldVal = original[k];

      // Skip if value didn't actually change
      if (newVal === oldVal) return;

      // Never send empty-string enums; they are invalid for the schema and
      // will trigger a 500 from the server due to Mongoose validation.
      if ((k === "team" || k === "role") && newVal === "") {
        return;
      }

      payload[k] = newVal;
    });
    if (edited.password && edited.password.length >= 6) {
      payload.password = edited.password; // backend will hash
    }
    return payload;
  }

  const saveEdit = async (u) => {
    const changes = diffPayload(u, editForm);
    if (Object.keys(changes).length === 0) {
      // nothing changed
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      // API base URL already includes /api, so use "users" not "/api/users"
      const { data } = await API.patch(`users/${u._id}`, changes);
      // merge response into local list (without password)
      setUsers(prev => prev.map(x => (x._id === u._id ? { ...x, ...data } : x)));
      cancelEdit();
    } catch (e) {
      const msg =
        e?.response?.status === 409 ? "Email already exists." :
        e?.response?.data?.message || "Failed to update user.";
      alert(msg);
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-6">
      {/* Header / Controls */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white underline decoration-1">Users</h1>
          <p className="text-sm text-white/70">Total Users: <strong>{sorted.length}</strong></p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Search bar - matching OrdersTable style */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setCurrentPage(1);
            }}
            className="relative w-[280px]"
          >
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearch("");
                  setCurrentPage(1);
                }
              }}
              placeholder="Search… (press Enter)"
              className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 w-full"
              aria-label="Search users"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
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

          {/* Role dropdown - matching OrdersTable style */}
          <select
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30 text-sm"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="" className="bg-[#0f1b2a] text-white">All Roles</option>
            {ROLES.map(r => <option key={r} value={r} className="bg-[#0f1b2a] text-white">{r}</option>)}
          </select>

          <button
            onClick={() => (window.location.href = "/create-user")}
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-[#2c5d81] hover:bg-blue-700 text-white text-sm"
          >
            <FaPlus /> Create User
          </button>
        </div>
      </div>

      {/* Table - matching OrdersTable style */}
      <div className="hidden md:block max-h-[76vh] overflow-y-auto overflow-x-auto rounded-xl ring-1 ring-white/10 shadow
                   scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
        <table className="min-w-[1000px] w-full bg-black/20 backdrop-blur-md text-white">
          <thead className="sticky top-0 bg-[#5c8bc1] z-20 text-black">
            <tr>
              {[
                { key: "firstName", label: "First Name" },
                { key: "lastName", label: "Last Name" },
                { key: "email", label: "Email" },
                { key: "role", label: "Role" },
                { key: "createdAt", label: "Created" },
              ].map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="p-3 text-left cursor-pointer border-r border-white/30 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {col.label} {sortBy === col.key ? (
                      sortOrder === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />
                    ) : (
                      <FaSort className="text-xs text-white/60" />
                    )}
                  </div>
                </th>
              ))}
              <th className="p-3 text-left whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-6 text-center text-white/80" colSpan={6}>⏳ Loading…</td></tr>
            ) : error ? (
              <tr><td className="p-6 text-center text-red-300" colSpan={6}>{error}</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td className="p-6 text-center text-white/80" colSpan={6}>No users found.</td></tr>
            ) : (
              pageRows.map(u => {
                const isEditing = editingId === u._id;
                return (
                  <tr key={u._id} className="transition text-sm even:bg-white/5 odd:bg-white/10 hover:bg-white/20">
                    <td className="p-2.5 border-r border-white/20 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          name="firstName"
                          value={editForm.firstName}
                          onChange={onEditChange}
                          className="w-full rounded px-2 py-1 text-black"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : u.firstName || "—"}
                    </td>
                    <td className="p-2.5 border-r border-white/20 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          name="lastName"
                          value={editForm.lastName}
                          onChange={onEditChange}
                          className="w-full rounded px-2 py-1 text-black"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : u.lastName || "—"}
                    </td>
                    <td className="p-2.5 border-r border-white/20 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="email"
                          name="email"
                          value={editForm.email}
                          onChange={onEditChange}
                          className="w-full rounded px-2 py-1 text-black"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : u.email || "—"}
                    </td>
                    <td className="p-2.5 border-r border-white/20 whitespace-nowrap">
                      {isEditing ? (
                        <select
                          name="role"
                          value={editForm.role}
                          onChange={onEditChange}
                          className="w-full rounded px-2 py-1 text-black"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">Select role</option>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : u.role || "—"}
                    </td>
                    <td className="p-2.5 border-r border-white/20 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                        {!isEditing ? (
                          <>
                            <button
                              className="px-2 py-1 text-xs rounded bg-slate-600 hover:bg-slate-700 inline-flex items-center gap-1 text-white"
                              onClick={() => window.alert(JSON.stringify(u, null, 2))}
                            >
                              View
                            </button>
                            <button
                              className="px-2 py-1 text-xs rounded bg-amber-500 hover:bg-amber-600 inline-flex items-center gap-1 text-white"
                              onClick={() => startEdit(u)}
                            >
                              <FaEdit /> Edit
                            </button>
                            <button
                              className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => handleDelete(u._id)}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Optional password while editing (empty = unchanged) */}
                            <div className="relative">
                              <input
                                type={showPwd ? "text" : "password"}
                                name="password"
                                value={editForm.password}
                                onChange={onEditChange}
                                placeholder="New password (optional)"
                                className="rounded px-2 py-1 pr-8 text-black text-xs"
                              />
                              <button
                                type="button"
                                className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-600"
                                onClick={() => setShowPwd(s => !s)}
                              >
                                {showPwd ? <FaEyeSlash /> : <FaEye />}
                              </button>
                            </div>

                            <button
                              disabled={saving}
                              className="px-2 py-1 text-xs rounded bg-green-600 hover:bg-green-700 inline-flex items-center gap-1 disabled:opacity-60 text-white"
                              onClick={() => saveEdit(u)}
                            >
                              <FaSave /> {saving ? "Saving…" : "Save"}
                            </button>
                            <button
                              className="px-2 py-1 text-xs rounded bg-gray-500 hover:bg-gray-600 inline-flex items-center gap-1 text-white"
                              onClick={cancelEdit}
                            >
                              <FaTimes /> Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination - matching OrdersTable style */}
      <div className="mt-4 flex items-center justify-end gap-2 text-white font-medium">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          className={`h-6 px-2 rounded-full transition ${currentPage === 1
            ? "bg-gray-600 text-gray-400 cursor-not-allowed"
            : "bg-gray-700 hover:bg-gray-600"
            }`}
          aria-label="Previous page"
        >
          <FaChevronLeft size={12} />
        </button>

        <span className="h-6 px-3 inline-flex items-center justify-center bg-gray-800 rounded-full text-xs shadow">
          Page <strong className="mx-1">{currentPage}</strong> of {totalPages}
        </span>

        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          className={`h-6 px-2 rounded-full transition ${currentPage === totalPages
            ? "bg-gray-600 text-gray-400 cursor-not-allowed"
            : "bg-gray-700 hover:bg-gray-600"
            }`}
          aria-label="Next page"
        >
          <FaChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
