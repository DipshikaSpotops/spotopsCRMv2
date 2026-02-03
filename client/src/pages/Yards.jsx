import React, { useEffect, useState, useMemo } from "react";
import API from "../api";
import { formatInTimeZone } from "date-fns-tz";
import { FaSort, FaSortUp, FaSortDown, FaChevronLeft, FaChevronRight, FaEdit, FaTrash } from "react-icons/fa";

const rowsPerPage = 25;

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

const Yards = () => {
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

  const [yards, setYards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");

  const [currentPage, setCurrentPage] = useState(parseInt(localStorage.getItem("yardsPage") || "1", 10));
  const [totalPages, setTotalPages] = useState(1);
  const [totalYards, setTotalYards] = useState(0);
  const [totalYardsAll, setTotalYardsAll] = useState(0);

  const [sortBy, setSortBy] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc");

  const [searchInput, setSearchInput] = useState(localStorage.getItem("yardsSearch") || "");
  const [appliedQuery, setAppliedQuery] = useState(localStorage.getItem("yardsSearch") || "");

  const [editingYard, setEditingYard] = useState(null);
  const [editForm, setEditForm] = useState({
    yardName: "",
    yardRating: "",
    phone: "",
    altNo: "",
    email: "",
    street: "",
    city: "",
    state: "",
    zipcode: "",
    country: "US",
    warranty: "",
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showTodayOnly, setShowTodayOnly] = useState(false);

  const fetchYards = async (page = 1, q = appliedQuery, sBy = sortBy, sDir = sortOrder, todayFilter = showTodayOnly, opts = { silent: false }) => {
    try {
      if (!opts.silent && loading === false) setLoading(true);
      if (opts.silent) setIsFetching(true);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(rowsPerPage));
      if (q) params.set("searchTerm", q);
      if (todayFilter) params.set("today", "true");
      if (sBy) params.set("sortBy", sBy);
      if (sDir) params.set("sortOrder", sDir);

      const { data } = await API.get("/yards/list", { params });

      setYards(data.yards || []);
      setTotalPages(data.totalPages || 1);
      setTotalYards(data.totalCount || 0);
      setTotalYardsAll(data.totalCountAll || data.totalCount || 0);
      setCurrentPage(data.currentPage || page);
      localStorage.setItem("yardsPage", String(data.currentPage || page));
    } catch (err) {
      console.error("Error fetching yards:", err);
      setError("Failed to load yards.");
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchYards(currentPage, appliedQuery, sortBy, sortOrder, showTodayOnly, { silent: currentPage !== 1 || !!appliedQuery || !!sortBy || showTodayOnly });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, appliedQuery, sortBy, sortOrder, showTodayOnly]);

  const handleSort = (field) => {
    if (field === "action") return;
    const nextSortBy = field;
    const nextSortOrder = sortBy === field ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setCurrentPage(1);
    fetchYards(1, appliedQuery, nextSortBy, nextSortOrder, showTodayOnly, { silent: true });
  };

  const onSearchChange = (e) => {
    const v = e.target.value;
    setSearchInput(v);
    if (v.trim() === "" && appliedQuery !== "") {
      setAppliedQuery("");
      localStorage.removeItem("yardsSearch");
      setCurrentPage(1);
      fetchYards(1, "", sortBy, sortOrder, showTodayOnly, { silent: true });
    }
  };

  const onSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      const q = searchInput.trim();
      setAppliedQuery(q);
      if (q) localStorage.setItem("yardsSearch", q);
      else localStorage.removeItem("yardsSearch");
      setCurrentPage(1);
      fetchYards(1, q, sortBy, sortOrder, showTodayOnly, { silent: true });
    }
    if (e.key === "Escape") {
      setSearchInput("");
      setAppliedQuery("");
      localStorage.removeItem("yardsSearch");
      setCurrentPage(1);
      fetchYards(1, "", sortBy, sortOrder, showTodayOnly, { silent: true });
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setAppliedQuery("");
    localStorage.removeItem("yardsSearch");
    setCurrentPage(1);
    fetchYards(1, "", sortBy, sortOrder, showTodayOnly, { silent: true });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "—";
      return formatInTimeZone(d, "America/Chicago", "MMM dd, yyyy HH:mm");
    } catch {
      return "—";
    }
  };

  const handleEdit = (yard) => {
    setEditingYard(yard);
    setEditForm({
      yardName: yard.yardName || "",
      yardRating: yard.yardRating || "",
      phone: yard.phone || "",
      altNo: yard.altNo || "",
      email: yard.email || "",
      street: yard.street || "",
      city: yard.city || "",
      state: yard.state || "",
      zipcode: yard.zipcode || "",
      country: yard.country || "US",
      warranty: yard.warranty || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingYard) return;
    
    try {
      await API.put(`/yards/${editingYard._id}`, editForm);
      setEditingYard(null);
      fetchYards(currentPage, appliedQuery, sortBy, sortOrder, { silent: true });
      alert("Yard updated successfully");
    } catch (err) {
      console.error("Error updating yard:", err);
      alert("Failed to update yard. Please try again.");
    }
  };

  const handleDelete = async (yardId) => {
    try {
      await API.delete(`/yards/${yardId}`);
      setShowDeleteConfirm(null);
      fetchYards(currentPage, appliedQuery, sortBy, sortOrder, { silent: true });
      alert("Yard deleted successfully");
    } catch (err) {
      console.error("Error deleting yard:", err);
      alert("Failed to delete yard. Please try again.");
    }
  };

  const handleToggleTodayYards = () => {
    const newValue = !showTodayOnly;
    setShowTodayOnly(newValue);
    setCurrentPage(1);
    fetchYards(1, appliedQuery, sortBy, sortOrder, newValue, { silent: false });
  };

  if (loading) return <div className="p-6 text-center text-white">⏳ Loading Yards...</div>;
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-3xl font-bold text-white underline decoration-1">Yards</h2>

          <div className="mt-1 flex items-center gap-4">
            <p className="text-sm text-white/70">
              {showTodayOnly ? (
                <>
                  Today's Yards: <strong>{totalYards}</strong>
                </>
              ) : appliedQuery ? (
                <>
                  Showing: <strong>{totalYards}</strong> of <strong>{totalYardsAll}</strong> yards
                </>
              ) : (
                <>
                  Total Yards: <strong>{totalYardsAll}</strong>
                </>
              )}
            </p>

            <div className="flex items-center gap-2 text-white font-medium">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className={`px-3 py-1 rounded-full transition ${
                  currentPage === 1 ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                <FaChevronLeft size={14} />
              </button>

              <span className="px-4 py-1 bg-gray-800 rounded-full text-sm shadow">
                Page <strong>{currentPage}</strong> of {totalPages}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className={`px-3 py-1 rounded-full transition ${
                  currentPage === totalPages ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                <FaChevronRight size={14} />
              </button>

              {isFetching && <span className="ml-3 text-xs text-white/70">Updating…</span>}
            </div>
          </div>
        </div>

        {/* Search and Today's Yards Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleTodayYards}
            className={`px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
              showTodayOnly
                ? "bg-green-700 hover:bg-green-800 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            {showTodayOnly ? "Show All Yards" : "Today's Yards"}
          </button>
          <div className="w-full lg:w-[260px] relative">
            <input
              type="text"
              value={searchInput}
              onChange={onSearchChange}
              onKeyDown={onSearchKeyDown}
              placeholder="Search… (press Enter)"
              className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 w-full"
              aria-label="Search yards"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-black"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[76vh] overflow-y-auto overflow-x-auto rounded-xl ring-1 ring-white/10 shadow scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
        <table className="min-w-[1200px] w-full bg-black/20 backdrop-blur-md text-white">
          <thead className="sticky top-0 bg-[#5c8bc1] z-20">
            <tr>
              {[
                { key: "yardName", label: "Yard Name" },
                { key: "street", label: "Street" },
                { key: "city", label: "City" },
                { key: "country", label: "Country" },
                { key: "zipcode", label: "Zipcode" },
                { key: "email", label: "Email" },
                { key: "phone", label: "Phone" },
                { key: "state", label: "State" },
                { key: "altNo", label: "Alt No" },
                { key: "updatedAt", label: "Updated At" },
                { key: "yardRating", label: "Yard Rating" },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="p-3 text-left cursor-pointer border-r border-white/30 text-tHead whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortBy === col.key ? (
                      sortOrder === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />
                    ) : (
                      <FaSort className="text-xs text-white/60" />
                    )}
                  </div>
                </th>
              ))}
              <th className="p-3 text-left text-tHead">Action</th>
            </tr>
          </thead>

          <tbody>
            {yards.map((yard) => (
              <tr
                key={yard._id}
                className="even:bg-white/5 odd:bg-white/10 hover:bg-white/20 transition text-sm"
              >
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {yard.yardName || "—"}
                </td>
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {yard.street || "—"}
                </td>
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {yard.city || "—"}
                </td>
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {yard.country || "—"}
                </td>
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {yard.zipcode || "—"}
                </td>
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {yard.email || "—"}
                </td>
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {yard.phone || "—"}
                </td>
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {yard.state || "—"}
                </td>
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {yard.altNo || "—"}
                </td>
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {formatDate(yard.updatedAt)}
                </td>
                <td className="p-2.5 border-r border-white/20 whitespace-nowrap text-[#e1ebeb]">
                  {yard.yardRating || "—"}
                </td>
                <td className="p-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(yard)}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs flex items-center gap-1"
                    >
                      <FaEdit size={12} />
                      Edit
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(yard._id)}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-xs flex items-center gap-1"
                    >
                      <FaTrash size={12} />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingYard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingYard(null)} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl">
            <header className="flex items-center justify-between px-5 py-3 border-b border-white/20">
              <h3 className="text-lg font-semibold">Edit Yard</h3>
              <button
                onClick={() => setEditingYard(null)}
                className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20"
              >
                ✕
              </button>
            </header>
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Yard Name</label>
                  <input
                    type="text"
                    value={editForm.yardName}
                    onChange={(e) => setEditForm({ ...editForm, yardName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Yard Rating</label>
                  <input
                    type="text"
                    value={editForm.yardRating}
                    onChange={(e) => setEditForm({ ...editForm, yardRating: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Alt No</label>
                  <input
                    type="text"
                    value={editForm.altNo}
                    onChange={(e) => setEditForm({ ...editForm, altNo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Street</label>
                  <input
                    type="text"
                    value={editForm.street}
                    onChange={(e) => setEditForm({ ...editForm, street: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">City</label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">State</label>
                  <input
                    type="text"
                    value={editForm.state}
                    onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Zipcode</label>
                  <input
                    type="text"
                    value={editForm.zipcode}
                    onChange={(e) => setEditForm({ ...editForm, zipcode: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Country</label>
                  <input
                    type="text"
                    value={editForm.country}
                    onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Warranty</label>
                  <input
                    type="number"
                    value={editForm.warranty}
                    onChange={(e) => setEditForm({ ...editForm, warranty: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>
              </div>
            </div>
            <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20">
              <button
                onClick={() => setEditingYard(null)}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition"
              >
                Save
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl">
            <header className="flex items-center justify-between px-5 py-3 border-b border-white/20">
              <h3 className="text-lg font-semibold">Confirm Delete</h3>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20"
              >
                ✕
              </button>
            </header>
            <div className="p-5">
              <p className="text-white/90">Are you sure you want to delete this yard? This action cannot be undone.</p>
            </div>
            <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition"
              >
                Delete
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default Yards;
