import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import moment from "moment-timezone";
import { selectRole } from "../store/authSlice";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { prettyFilterLabel } from "../utils/dateUtils";
import {
  formatAttendanceStatus,
  getAttendanceRowCategory,
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

function getAttendanceDefaultFilter() {
  try {
    const saved = JSON.parse(localStorage.getItem("udp_range") || "null");
    if (saved?.startDate && saved?.endDate) {
      const startDate = new Date(saved.startDate);
      const endDate = new Date(saved.endDate);
      const startDallas = moment
        .tz(
          {
            year: startDate.getFullYear(),
            month: startDate.getMonth(),
            day: startDate.getDate(),
          },
          ZONE
        )
        .startOf("day");
      const endDallas = moment
        .tz(
          {
            year: endDate.getFullYear(),
            month: endDate.getMonth(),
            day: endDate.getDate(),
          },
          ZONE
        )
        .endOf("day");
      return { start: startDallas.utc().toISOString(), end: endDallas.utc().toISOString() };
    }
  } catch {}
  const now = moment().tz(ZONE);
  const startDallas = now.clone().startOf("month").startOf("day");
  const lastDay = now.daysInMonth();
  const endDallas = moment
    .tz({ year: now.year(), month: now.month(), day: lastDay }, ZONE)
    .endOf("day");
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
  const [activeFilter, setActiveFilter] = useState(getAttendanceDefaultFilter);
  const [rows, setRows] = useState([]);
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
    } catch (e) {
      setRows([]);
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold">Attendance</h1>
            {filterSummary ? (
              <span className="text-xs sm:text-sm rounded-full bg-white/15 px-3 py-1 border border-white/20">
                {filterSummary}
              </span>
            ) : null}
            <UnifiedDatePicker onFilterChange={setActiveFilter} />
          </div>
        </div>

        {error && <div className="text-sm text-red-300 mb-3">{error}</div>}
        {loading ? (
          <div className="text-sm opacity-90">Loading...</div>
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
