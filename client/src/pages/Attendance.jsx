import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import moment from "moment-timezone";
import { selectRole } from "../store/authSlice";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { prettyFilterLabel } from "../utils/dateUtils";
import {
  formatAttendanceStatus,
  getAttendanceRowCategory,
  getMonthOverviewCellBucket,
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
    case "weekend":
      return `${base} bg-[#475569] text-white/95 font-medium`;
    case "half_day":
      return `${base} bg-[#d97706] text-white font-medium`;
    case "late":
      return `${base} bg-[#FFFF00] text-gray-900 font-medium`;
    case "full_day":
    default:
      return `${base} bg-[#166534] text-white font-medium`;
  }
}

/** `datetime-local` value in the browser's local timezone */
function dateToDatetimeLocalValue(d) {
  if (!d || Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [adminTimeModal, setAdminTimeModal] = useState(null);
  const [adminTimeLocal, setAdminTimeLocal] = useState("");

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

  /** Month overview: only calendar columns ≤ today (Central), so totals match “month so far”. */
  const monthOverviewDateKeys = useMemo(() => {
    const today = moment().tz(ZONE).format("YYYY-MM-DD");
    return dateKeys.filter((dk) => dk <= today);
  }, [dateKeys]);

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
        const status = formatAttendanceStatus(r || {}, dk).replace(/"/g, '""');
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

  const openAdminMarkPresentModal = (firstName, dateKey) => {
    const suggested = moment.tz(`${dateKey} 18:30`, "YYYY-MM-DD HH:mm", IST).toDate();
    setAdminTimeLocal(dateToDatetimeLocalValue(suggested));
    setAdminTimeModal({ firstName, dateKey, action: "markPresentNow" });
    setError("");
  };

  const openAdminMarkLogoutModal = (firstName, dateKey) => {
    setAdminTimeLocal(dateToDatetimeLocalValue(new Date()));
    setAdminTimeModal({ firstName, dateKey, action: "markLogoutNow" });
    setError("");
  };

  const closeAdminTimeModal = () => {
    if (busyKey) return;
    setAdminTimeModal(null);
    setAdminTimeLocal("");
  };

  const submitAdminTimeModal = async () => {
    if (!adminTimeModal) return;
    const d = new Date(adminTimeLocal);
    if (Number.isNaN(d.getTime())) {
      setError("Please choose a valid date and time.");
      return;
    }
    const { firstName, dateKey, action } = adminTimeModal;
    const k = `${dateKey}:${firstName}:${action}`;
    setBusyKey(k);
    setError("");
    try {
      await adminUpdateAttendanceEntry({
        dateKey,
        firstName,
        action,
        at: d.toISOString(),
      });
      setAdminTimeModal(null);
      setAdminTimeLocal("");
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
                  {monthOverviewDateKeys.map((dk) => (
                    <th
                      key={dk}
                      className="text-center px-1 py-2 border-r border-white/15 min-w-[4.5rem]"
                      title={dk}
                    >
                      <span className="block font-semibold">{formatSummaryColTitle(dk)}</span>
                    </th>
                  ))}
                  <th
                    className="text-left px-2 py-2 border-l border-white/25 sticky right-0 bg-[#1e3a5f] z-20 min-w-[6.5rem] shadow-[-6px_0_12px_rgba(0,0,0,0.25)]"
                    title="Per user: Absent / Weekend / On time / Half day / Late for the dates in this grid."
                  >
                    Summary
                  </th>
                </tr>
              </thead>
              <tbody>
                {rosterNames.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(1, monthOverviewDateKeys.length + 2)}
                      className="px-3 py-6 text-center opacity-80"
                    >
                      No roster for this range.
                    </td>
                  </tr>
                ) : monthOverviewDateKeys.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-3 py-6 text-center opacity-80"
                    >
                      No day columns for this range. Load a range that includes eligible dates, or try Detail
                      table.
                    </td>
                  </tr>
                ) : (
                  rosterNames.map((firstName) => {
                    const uc = {
                      absent: 0,
                      weekend: 0,
                      on_time: 0,
                      half_day: 0,
                      late: 0,
                      present_other: 0,
                    };
                    for (const dk of monthOverviewDateKeys) {
                      const row = rowByDateAndName.get(`${dk}|${firstName}`) || {};
                      uc[getMonthOverviewCellBucket(row, dk)]++;
                    }
                    return (
                      <tr key={firstName} className="border-t border-white/10 bg-white/[0.03]">
                        <td className="px-2 py-1.5 font-medium border-r border-white/10 sticky left-0 bg-[#162d4a] z-10 whitespace-nowrap">
                          {firstName}
                        </td>
                        {monthOverviewDateKeys.map((dk) => {
                          const cell = rowByDateAndName.get(`${dk}|${firstName}`);
                          const cat = getAttendanceRowCategory(cell || {}, dk);
                          return (
                            <td
                              key={`${firstName}-${dk}`}
                              className={`px-1 py-1.5 text-center border-r border-white/10 align-middle ${attendanceStatusCellClass(
                                cat
                              )}`}
                              title={formatAttendanceStatus(cell || {}, dk)}
                            >
                              {shortAttendanceLabel(cell || {}, dk)}
                            </td>
                          );
                        })}
                        <td
                          className="px-2 py-1.5 text-left align-top border-l border-white/25 sticky right-0 bg-[#162d4a] z-10 text-[10px] sm:text-xs shadow-[-6px_0_12px_rgba(0,0,0,0.25)]"
                          title={`${firstName}: Abs ${uc.absent}, Weekend ${uc.weekend}, On time ${uc.on_time}, Half day ${uc.half_day}, Late ${uc.late}${uc.present_other ? `, Other ${uc.present_other}` : ""}`}
                        >
                          <div className="space-y-0.5 leading-snug text-white/95">
                            <div>
                              Absent: <strong className="tabular-nums">{uc.absent}</strong>
                            </div>
                            <div>
                              Weekend: <strong className="tabular-nums">{uc.weekend}</strong>
                            </div>
                            <div>
                              On time: <strong className="tabular-nums">{uc.on_time}</strong>
                            </div>
                            <div>
                              Half day: <strong className="tabular-nums">{uc.half_day}</strong>
                            </div>
                            <div>
                              Late: <strong className="tabular-nums">{uc.late}</strong>
                            </div>
                            {uc.present_other > 0 ? (
                              <div className="text-white/80">
                                Other: <strong className="tabular-nums">{uc.present_other}</strong>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <p className="text-[11px] opacity-70 mt-2 px-1">
              Colors: green = on-time / other present • yellow = late • orange = half-day • red = absent • slate
              = weekend (Sat/Sun, no login; Dallas date). Hover a cell or use CSV for full status text.
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
                              disabled={!!busyKey}
                              onClick={() => openAdminMarkPresentModal(row.firstName, row.dateKey)}
                            >
                              Mark Present
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-60"
                              disabled={!!busyKey}
                              onClick={() => openAdminMarkLogoutModal(row.firstName, row.dateKey)}
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

      {adminTimeModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-attendance-time-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busyKey) closeAdminTimeModal();
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-white/20 bg-[#1e3a5f] p-5 text-white shadow-xl">
            <h3 id="admin-attendance-time-title" className="text-lg font-semibold mb-1">
              {adminTimeModal.action === "markPresentNow" ? "Set login time" : "Set logout time"}
            </h3>
            <p className="text-sm text-white/75 mb-4">
              <span className="font-medium">{adminTimeModal.firstName}</span> · shift day{" "}
              <span className="font-mono">{adminTimeModal.dateKey}</span>
            </p>
            <label htmlFor="admin-attendance-datetime" className="block text-xs text-white/80 mb-1">
              Date &amp; time (your device timezone)
            </label>
            <input
              id="admin-attendance-datetime"
              type="datetime-local"
              value={adminTimeLocal}
              onChange={(e) => setAdminTimeLocal(e.target.value)}
              className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <p className="text-[11px] text-white/55 mt-2 mb-4">
              The table still shows times in IST. Adjust here to match when they actually logged in or out.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-md text-sm border border-white/25 bg-white/5 hover:bg-white/10 disabled:opacity-50"
                disabled={!!busyKey}
                onClick={closeAdminTimeModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-md text-sm bg-[#04356d] border border-white/20 hover:bg-[#063a7a] disabled:opacity-50"
                disabled={!!busyKey}
                onClick={submitAdminTimeModal}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
