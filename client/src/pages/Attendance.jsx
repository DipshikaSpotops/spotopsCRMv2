import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import moment from "moment-timezone";
import { selectRole } from "../store/authSlice";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { prettyFilterLabel } from "../utils/dateUtils";
import {
  formatAttendanceStatus,
  getAttendanceRowCategory,
  shortAttendanceLabel,
} from "../utils/attendanceStatus";
import {
  adminUpdateAttendanceEntry,
  fetchAttendance,
} from "../utils/attendanceApi";

const ZONE = "America/Chicago";
const IST = "Asia/Kolkata";

function formatAttendanceClockIST(iso) {
  if (!iso) return "—";
  const m = moment(iso).tz(IST);
  if (!m.isValid()) return "—";
  return `${m.format("h:mm A")} IST`;
}

const ACTION_LABEL = {
  self_mark_present: "Marked present (self)",
  self_logout: "Logged out (self)",
  admin_mark_present: "Marked present (admin)",
  admin_mark_logout: "Marked logout (admin)",
  admin_clear: "Cleared times (admin)",
};

/** Dallas “today” only — Attendance always opens on current day (not shared orders month range). */
function getAttendanceTodayFilter() {
  const now = moment().tz(ZONE);
  const startDallas = now.clone().startOf("day");
  const endDallas = now.clone().endOf("day");
  return { start: startDallas.utc().toISOString(), end: endDallas.utc().toISOString() };
}

function attendanceStatusCellClass(category) {
  const base = "px-3 py-2 border-r border-white/25";
  switch (category) {
    case "absent":
      return `${base} bg-[#c40505] text-white font-medium`;
    case "half_day":
      return `${base} bg-[#d97706] text-white font-medium`;
    case "full_day":
    default:
      return `${base} bg-[#166534] text-white font-medium`;
  }
}

function formatAuditCell(log) {
  if (!Array.isArray(log) || log.length === 0) return "—";
  const lines = [...log].reverse().map((e) => {
    const who = e.editorFirstName || e.editorEmail || "Unknown";
    const when = e.at ? new Date(e.at).toLocaleString() : "";
    const what = ACTION_LABEL[e.action] || e.action;
    return `${when} — ${who} (${e.editorRole || "?"}): ${what}`;
  });
  return (
    <div className="max-h-36 overflow-y-auto whitespace-normal text-xs leading-snug opacity-95">
      {lines.map((line, i) => (
        <div key={i} className="border-b border-white/10 last:border-0 py-1">
          {line}
        </div>
      ))}
    </div>
  );
}

export default function Attendance() {
  const [activeFilter, setActiveFilter] = useState(getAttendanceTodayFilter);
  const [rows, setRows] = useState([]);
  const [dateKeys, setDateKeys] = useState([]);
  const [rosterNames, setRosterNames] = useState([]);
  const [viewMode, setViewMode] = useState("detail");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const roleFromRedux = useSelector(selectRole);
  const role =
    roleFromRedux ??
    (function () {
      try {
        const raw = localStorage.getItem("auth");
        if (raw) return JSON.parse(raw)?.user?.role || undefined;
      } catch {}
      return localStorage.getItem("role") || undefined;
    })();
  const email =
    (function () {
      try {
        const raw = localStorage.getItem("auth");
        if (raw) return JSON.parse(raw)?.user?.email || undefined;
      } catch {}
      return localStorage.getItem("email") || undefined;
    })()?.toLowerCase();
  const canEditAttendance = role === "Admin" || email === "50starsauto110@gmail.com";

  const load = useCallback(async () => {
    if (!activeFilter?.start || !activeFilter?.end) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAttendance({
        start: activeFilter.start,
        end: activeFilter.end,
      });
      setRows(data?.rows || []);
      const keys =
        data?.mode === "range" && Array.isArray(data?.dateKeys)
          ? data.dateKeys
          : data?.dateKey
            ? [data.dateKey]
            : [...new Set((data?.rows || []).map((r) => r.dateKey).filter(Boolean))].sort();
      setDateKeys(keys);
      setRosterNames(
        Array.isArray(data?.activeUsers) && data.activeUsers.length
          ? data.activeUsers
          : [...new Set((data?.rows || []).map((r) => r.firstName).filter(Boolean))].sort()
      );
    } catch (e) {
      setRows([]);
      setDateKeys([]);
      setRosterNames([]);
      setError(e?.response?.data?.message || e?.message || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filterSummary = useMemo(
    () => (activeFilter ? prettyFilterLabel(activeFilter) : ""),
    [activeFilter]
  );

  const rowByDateAndName = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      m.set(`${r.dateKey}|${r.firstName}`, r);
    }
    return m;
  }, [rows]);

  function formatSummaryColTitle(ymd) {
    const m = moment(ymd, "YYYY-MM-DD");
    return m.isValid() ? m.format("MMM D") : ymd;
  }

  function handleExportCsv() {
    const names = rosterNames.length ? rosterNames : [...new Set(rows.map((r) => r.firstName))].sort();
    const keys = dateKeys.length ? dateKeys : [...new Set(rows.map((r) => r.dateKey))].sort();
    const header = ["User", ...keys.map((k) => formatSummaryColTitle(k))];
    const lines = [header.join(",")];
    for (const firstName of names) {
      const cells = keys.map((dk) => {
        const r = rowByDateAndName.get(`${dk}|${firstName}`);
        const status = r ? formatAttendanceStatus(r).replace(/"/g, '""') : "Absent";
        return `"${status}"`;
      });
      lines.push([`"${firstName.replace(/"/g, '""')}"`, ...cells].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${keys[0] || "export"}-to-${keys[keys.length - 1] || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleAdminAction = async (firstName, action, rowDateKey) => {
    const k = `${rowDateKey}:${firstName}:${action}`;
    setBusyKey(k);
    setError("");
    try {
      await adminUpdateAttendanceEntry({ dateKey: rowDateKey, firstName, action });
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Update failed");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="p-4 sm:p-6 text-white">
      <div className="rounded-xl bg-white/10 border border-white/15 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold">Attendance</h1>
            {filterSummary ? (
              <span className="text-xs sm:text-sm rounded-full bg-white/15 px-3 py-1 border border-white/20">
                {filterSummary}
              </span>
            ) : null}
            <UnifiedDatePicker
              onFilterChange={setActiveFilter}
              persistKey="udp_attendance_range"
              syncIsoRange={activeFilter}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs opacity-80">View:</span>
            <button
              type="button"
              onClick={() => setViewMode("detail")}
              className={`px-3 py-1 rounded-md text-xs font-medium border ${
                viewMode === "detail"
                  ? "bg-white/20 border-white/40"
                  : "bg-white/5 border-white/15 hover:bg-white/10"
              }`}
            >
              Detail table
            </button>
            <button
              type="button"
              onClick={() => setViewMode("summary")}
              className={`px-3 py-1 rounded-md text-xs font-medium border ${
                viewMode === "summary"
                  ? "bg-white/20 border-white/40"
                  : "bg-white/5 border-white/15 hover:bg-white/10"
              }`}
            >
              Month overview
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!rows.length}
              className="px-3 py-1 rounded-md text-xs font-medium border border-white/20 bg-[#04356d] hover:bg-[#063a7a] disabled:opacity-40"
            >
              Download CSV
            </button>
          </div>
        </div>
        <p className="text-xs opacity-75 mb-3 max-w-3xl">
          For a full month: open the date picker → <strong>This Month</strong> (or choose a range) →{" "}
          <strong>Load</strong>. Use <strong>Month overview</strong> for a date × user grid; hover a cell for
          the full status. <strong>Download CSV</strong> has the same precise status text for each day.
        </p>

        {error && <div className="text-sm text-red-300 mb-3">{error}</div>}
        {loading ? (
          <div className="text-sm opacity-90">Loading...</div>
        ) : viewMode === "summary" ? (
          <div className="overflow-x-auto rounded-lg border border-white/20">
            <table className="w-full text-xs sm:text-sm border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-white/10">
                  <th className="text-left px-2 py-2 border-r border-white/20 sticky left-0 bg-[#1e3a5f] z-10 whitespace-nowrap">
                    User
                  </th>
                  {dateKeys.map((dk) => (
                    <th
                      key={dk}
                      className="text-center px-1 py-2 border-r border-white/15 min-w-[4.5rem]"
                      title={dk}
                    >
                      <span className="block font-semibold">{formatSummaryColTitle(dk)}</span>
                      <span className="block text-[10px] opacity-70 font-normal">{dk.slice(5)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rosterNames.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, dateKeys.length + 1)} className="px-3 py-6 text-center opacity-80">
                      No roster for this range.
                    </td>
                  </tr>
                ) : (
                  rosterNames.map((firstName) => (
                    <tr key={firstName} className="border-t border-white/10 bg-white/[0.03]">
                      <td className="px-2 py-1.5 font-medium border-r border-white/10 sticky left-0 bg-[#162d4a] z-10 whitespace-nowrap">
                        {firstName}
                      </td>
                      {dateKeys.map((dk) => {
                        const cell = rowByDateAndName.get(`${dk}|${firstName}`);
                        const cat = getAttendanceRowCategory(cell || {});
                        return (
                          <td
                            key={`${firstName}-${dk}`}
                            className={`px-1 py-1.5 text-center border-r border-white/10 align-middle ${attendanceStatusCellClass(
                              cat
                            )}`}
                            title={cell ? formatAttendanceStatus(cell) : "Absent"}
                          >
                            {shortAttendanceLabel(cell || {})}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <p className="text-[11px] opacity-70 mt-2 px-1">
              Colors: green = present / on-time • orange = half-day rules • red = absent. Headers show shift-day
              keys; hover a cell or use CSV for full status text.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/20">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-white/10">
                  <th className="text-left px-3 py-2 border-r border-white/20">Date</th>
                  <th className="text-left px-3 py-2 border-r border-white/20">User Name</th>
                  <th className="text-left px-3 py-2 border-r border-white/20">Login Time</th>
                  <th className="text-left px-3 py-2 border-r border-white/20">Logout Time</th>
                  <th className="text-left px-3 py-2 border-r border-white/20">Status</th>
                  {canEditAttendance && (
                    <th className="text-left px-3 py-2 border-r border-white/20">Audit (admin edits)</th>
                  )}
                  {canEditAttendance && <th className="text-left px-3 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canEditAttendance ? 7 : 5}
                      className="px-3 py-6 text-center opacity-80 border-t border-white/10"
                    >
                      No rows for this range.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={`${row.dateKey}-${row.firstName}`}
                      className="border-t border-white/10 bg-white/[0.03]"
                    >
                      <td className="px-3 py-2 whitespace-nowrap border-r border-white/10">
                        {row.dateKey}
                      </td>
                      <td className="px-3 py-2 font-medium border-r border-white/10">{row.firstName}</td>
                      <td className="px-3 py-2 whitespace-nowrap border-r border-white/10">
                        {formatAttendanceClockIST(row.loginAt)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap border-r border-white/10">
                        {formatAttendanceClockIST(row.logoutAt)}
                      </td>
                      <td className={attendanceStatusCellClass(getAttendanceRowCategory(row))}>
                        {formatAttendanceStatus(row)}
                      </td>
                      {canEditAttendance && (
                        <td className="px-3 py-2 border-r border-white/10 align-top">
                          {formatAuditCell(row.changeLog || [])}
                        </td>
                      )}
                      {canEditAttendance && (
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                              disabled={busyKey === `${row.dateKey}:${row.firstName}:markPresentNow`}
                              onClick={() =>
                                handleAdminAction(row.firstName, "markPresentNow", row.dateKey)
                              }
                            >
                              Mark Present
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-60"
                              disabled={busyKey === `${row.dateKey}:${row.firstName}:markLogoutNow`}
                              onClick={() =>
                                handleAdminAction(row.firstName, "markLogoutNow", row.dateKey)
                              }
                            >
                              Mark Logout
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-gray-600 hover:bg-gray-700 text-white disabled:opacity-60"
                              disabled={busyKey === `${row.dateKey}:${row.firstName}:clear`}
                              onClick={() => handleAdminAction(row.firstName, "clear", row.dateKey)}
                            >
                              Clear
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
