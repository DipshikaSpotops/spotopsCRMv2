import React, { useEffect, useMemo, useState } from "react";
import API from "../api";
import {
  FaSort,
  FaSortUp,
  FaSortDown,
  FaChevronLeft,
  FaChevronRight,
  FaPlus,
} from "react-icons/fa";
import { formatInTimeZone } from "date-fns-tz";
import useSort from "../hooks/useSort";

const PAGE_SIZE = 20;

function formatDate(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "—";
  return formatInTimeZone(d, "America/Chicago", "dd MMM yyyy, hh:mm a zzz");
}

export default function ViewTeams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { sortBy, sortOrder, handleSort, sortData } = useSort("teamName", "asc");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await API.get("teams");
        if (mounted) setTeams(Array.isArray(data) ? data : []);
      } catch (e) {
        if (mounted) setError("Failed to load teams.");
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const normalized = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return teams;
    return teams.filter((team) =>
      String(team.teamName || "")
        .toLowerCase()
        .includes(normalized)
    );
  }, [teams, normalized]);

  const sorted = useMemo(() => sortData(filtered), [filtered, sortBy, sortOrder, sortData]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = useMemo(
    () => sorted.slice(pageStart, pageStart + PAGE_SIZE),
    [sorted, pageStart]
  );

  return (
    <div className="min-h-screen p-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">View Teams</h1>
          <p className="text-sm text-white/70">{teams.length} team(s) total</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="relative"
          >
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search team name..."
              className="w-full sm:w-64 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 px-3 py-2 outline-none focus:ring-2 focus:ring-white/30 text-sm"
            />
          </form>

          <button
            onClick={() => {
              window.location.href = "/create-team";
            }}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded bg-[#2c5d81] hover:bg-blue-700 text-white text-sm"
          >
            <FaPlus /> Create Team
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-white/20 bg-white/10 overflow-hidden">
        <table className="min-w-full w-full text-white">
          <thead className="bg-[#5c8bc1] text-black">
            <tr>
              {[
                { key: "teamName", label: "Team Name" },
                { key: "createdAt", label: "Created" },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="p-3 text-left cursor-pointer border-r border-white/30 whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {col.label}{" "}
                    {sortBy === col.key ? (
                      sortOrder === "asc" ? (
                        <FaSortUp className="text-xs" />
                      ) : (
                        <FaSortDown className="text-xs" />
                      )
                    ) : (
                      <FaSort className="text-xs text-black/50" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-6 text-center text-white/80" colSpan={2}>
                  Loading...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td className="p-6 text-center text-red-300" colSpan={2}>
                  {error}
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td className="p-6 text-center text-white/80" colSpan={2}>
                  No teams found.
                </td>
              </tr>
            ) : (
              pageRows.map((team) => (
                <tr
                  key={team._id}
                  className="transition text-sm even:bg-white/5 odd:bg-white/10 hover:bg-white/20"
                >
                  <td className="p-2.5 border-r border-white/20 whitespace-nowrap">
                    {team.teamName || "—"}
                  </td>
                  <td className="p-2.5 whitespace-nowrap">{formatDate(team.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && sorted.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-white/80 text-sm">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded bg-white/10 border border-white/20 disabled:opacity-40"
            >
              <FaChevronLeft />
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded bg-white/10 border border-white/20 disabled:opacity-40"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
