import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  FaSort, FaSortUp, FaSortDown, FaChevronLeft, FaChevronRight, FaPlus, FaEdit, FaSave, FaTimes, FaEye, FaEyeSlash
} from "react-icons/fa";
import { formatInTimeZone } from "date-fns-tz";
import useSort from "../hooks/useSort";

const PAGE_SIZE = 20;
const TEAMS = ["Shankar", "Vinutha"];
const ROLES = ["Admin", "Sales", "Support"];

function formatDate(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, "America/Chicago", "dd MMM yyyy, hh:mm a zzz");
}

export default function ViewUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
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
        const { data } = await axios.get("http://localhost:5000/api/users");
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
    if (teamFilter) out = out.filter(u => u.team === teamFilter);
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
  }, [users, teamFilter, roleFilter, normalized]);

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
      await axios.delete(`http://localhost:5000/api/users/${id}`);
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
      if (edited[k] !== original[k]) payload[k] = edited[k];
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
      const { data } = await axios.patch(`http://localhost:5000/api/users/${u._id}`, changes);
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

        <div className="flex flex-wrap items-center gap-3">
          <input
            className="px-3 py-2 rounded border border-gray-300 text-sm"
            placeholder="Search name, email, team, role…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
          <select
            className="px-3 py-2 rounded border border-gray-300 text-sm bg-white"
            value={teamFilter}
            onChange={(e) => { setTeamFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="">All Teams</option>
            {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            className="px-3 py-2 rounded border border-gray-300 text-sm bg-white"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <button
            onClick={() => (window.location.href = "/create-user")}
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-[#2c5d81] hover:bg-blue-700 text-white text-sm"
          >
            <FaPlus /> Create User
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <div className="max-h-[75vh] overflow-y-auto bg-black/10 backdrop-blur rounded">
          <table className="min-w-[1000px] w-full text-white">
            <thead className="sticky top-0 bg-[#5c8bc1] z-10">
              <tr>
                {[
                  { key: "firstName", label: "First Name" },
                  { key: "lastName", label: "Last Name" },
                  { key: "email", label: "Email" },
                  { key: "team", label: "Team" },
                  { key: "role", label: "Role" },
                  { key: "createdAt", label: "Created" },
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
                <th className="p-3 text-left border-b border-white/20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-6 text-white" colSpan={7}>⏳ Loading…</td></tr>
              ) : error ? (
                <tr><td className="p-6 text-red-300" colSpan={7}>{error}</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td className="p-6 text-white/80" colSpan={7}>No users found.</td></tr>
              ) : (
                pageRows.map(u => {
                  const isEditing = editingId === u._id;
                  return (
                    <tr key={u._id} className="even:bg-white/5 odd:bg-white/10 hover:bg-white/20 transition">
                      <td className="p-3">
                        {isEditing ? (
                          <input
                            name="firstName"
                            value={editForm.firstName}
                            onChange={onEditChange}
                            className="w-full rounded px-2 py-1 text-black"
                          />
                        ) : u.firstName}
                      </td>
                      <td className="p-3">
                        {isEditing ? (
                          <input
                            name="lastName"
                            value={editForm.lastName}
                            onChange={onEditChange}
                            className="w-full rounded px-2 py-1 text-black"
                          />
                        ) : u.lastName}
                      </td>
                      <td className="p-3">
                        {isEditing ? (
                          <input
                            type="email"
                            name="email"
                            value={editForm.email}
                            onChange={onEditChange}
                            className="w-full rounded px-2 py-1 text-black"
                          />
                        ) : u.email}
                      </td>
                      <td className="p-3">
                        {isEditing ? (
                          <select
                            name="team"
                            value={editForm.team}
                            onChange={onEditChange}
                            className="w-full rounded px-2 py-1 text-black"
                          >
                            <option value="">Select team</option>
                            {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        ) : u.team}
                      </td>
                      <td className="p-3">
                        {isEditing ? (
                          <select
                            name="role"
                            value={editForm.role}
                            onChange={onEditChange}
                            className="w-full rounded px-2 py-1 text-black"
                          >
                            <option value="">Select role</option>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : u.role}
                      </td>
                      <td className="p-3">{formatDate(u.createdAt)}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2 items-center">
                          {!isEditing ? (
                            <>
                              <button
                                className="px-2 py-1 text-xs rounded bg-slate-600 hover:bg-slate-700 inline-flex items-center gap-1"
                                onClick={() => window.alert(JSON.stringify(u, null, 2))}
                              >
                                View
                              </button>
                              <button
                                className="px-2 py-1 text-xs rounded bg-amber-500 hover:bg-amber-600 inline-flex items-center gap-1"
                                onClick={() => startEdit(u)}
                              >
                                <FaEdit /> Edit
                              </button>
                              <button
                                className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-700"
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
                                  className="rounded px-2 py-1 pr-8 text-black"
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
                                className="px-2 py-1 text-xs rounded bg-green-600 hover:bg-green-700 inline-flex items-center gap-1 disabled:opacity-60"
                                onClick={() => saveEdit(u)}
                              >
                                <FaSave /> {saving ? "Saving…" : "Save"}
                              </button>
                              <button
                                className="px-2 py-1 text-xs rounded bg-gray-500 hover:bg-gray-600 inline-flex items-center gap-1"
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
        <span className="text-white">Page {currentPage} of {totalPages}</span>
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
