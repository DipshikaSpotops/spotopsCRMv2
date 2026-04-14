import { useEffect, useMemo, useState } from "react";
import moment from "moment-timezone";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  canonicalAttendanceName,
  isActiveAttendanceUser,
} from "../constants/activeAttendanceUsers";
import { todayDateKeyIST } from "../utils/attendanceStatus";
import { fetchAttendance, markMyAttendancePresent, recordAttendanceLogout } from "../utils/attendanceApi";
import API from "../api";
import { logout as logoutAction } from "../store/authSlice";
import { clearStoredAuth } from "../utils/authStorage";

const IST = "Asia/Kolkata";

function formatLoginHint(loginAt) {
  if (!loginAt) return "";
  const m = moment(loginAt).tz(IST);
  if (!m.isValid()) return "";
  return m.format("h:mm A IST");
}

export default function MarkAttendanceModal({ isOpen, onClose, isDarkMode }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [currentFirstName, setCurrentFirstName] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [myRow, setMyRow] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      let name = "";
      try {
        const authRaw = localStorage.getItem("auth");
        if (authRaw) {
          const { user } = JSON.parse(authRaw);
          name = String(user?.firstName || "").trim();
        }
        if (!name) {
          const storedUser = JSON.parse(localStorage.getItem("user") || "null");
          name = String(
            storedUser?.firstName || localStorage.getItem("firstName") || ""
          ).trim();
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setCurrentFirstName(name);

      try {
        setError("");
        setStatus("");
        const dateKey = todayDateKeyIST();
        const data = await fetchAttendance(dateKey);
        if (cancelled) return;
        const canonical = canonicalAttendanceName(name);
        const row = canonical
          ? (data?.rows || []).find((r) => r.firstName === canonical) || null
          : null;
        setMyRow(row);
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || e?.message || "Could not load attendance");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const canonical = useMemo(
    () => canonicalAttendanceName(currentFirstName),
    [currentFirstName]
  );

  const canMark = useMemo(() => {
    if (!isOpen) return false;
    if (!isActiveAttendanceUser(currentFirstName)) return false;
    return !myRow?.loginAt;
  }, [isOpen, currentFirstName, myRow]);

  const handleMark = async () => {
    try {
      setBusy(true);
      setError("");
      const res = await markMyAttendancePresent();
      setStatus(res?.message || "Marked present.");
      const dateKey = todayDateKeyIST();
      const rec = res?.record;

      if (rec?.loginAt && canonical) {
        setMyRow({
          firstName: rec.firstName || canonical,
          dateKey: rec.dateKey || dateKey,
          loginAt: rec.loginAt,
          logoutAt: rec.logoutAt ?? null,
        });
      }

      try {
        const data = await fetchAttendance(dateKey);
        const row = canonical
          ? (data?.rows || []).find((r) => r.firstName === canonical) || null
          : null;
        if (row?.loginAt) setMyRow(row);
      } catch {
        /* keep record from response above */
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Could not mark attendance");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (logoutBusy) return;
    try {
      setLogoutBusy(true);
      await recordAttendanceLogout();
      const token = localStorage.getItem("token");
      if (token) {
        try {
          await API.post("/auth/logout");
        } catch (apiErr) {
          console.warn("[MarkAttendanceModal] Logout API failed (non-blocking):", apiErr?.message);
        }
      }
      clearStoredAuth();
      dispatch(logoutAction());
      onClose?.();
      navigate("/login", { replace: true });
    } catch (e) {
      console.error("[MarkAttendanceModal] Logout error:", e);
      clearStoredAuth();
      dispatch(logoutAction());
      onClose?.();
      navigate("/login", { replace: true });
    } finally {
      setLogoutBusy(false);
    }
  };

  if (!isOpen) return null;
  return (
      <div
        className="fixed inset-0 z-[100] flex items-start justify-center pt-24 sm:pt-28 px-4 pb-8 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className={`w-full max-w-md rounded-xl shadow-2xl border p-4 ${
            isDarkMode ? "bg-[#0f172a] text-white border-gray-600" : "bg-white text-gray-900 border-gray-200"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Mark Attendance</h2>
            <button type="button" onClick={onClose} className="px-2 py-1 rounded hover:bg-black/10">
              ✕
            </button>
          </div>
          {error && <div className="text-sm text-red-400 mb-3">{error}</div>}
          {status && <div className="text-sm text-green-400 mb-3">{status}</div>}
          {!isActiveAttendanceUser(currentFirstName) ? (
            <p className="text-sm opacity-80">You are not in the active attendance list.</p>
          ) : canMark ? (
            <button
              type="button"
              onClick={handleMark}
              disabled={busy}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-[#04356d] hover:bg-[#063a7a] disabled:opacity-60"
            >
              {busy ? "Saving..." : "Mark present"}
            </button>
          ) : (
            <div className="text-sm space-y-1 opacity-90">
              <p>Attendance already marked for today ({todayDateKeyIST()} IST).</p>
              {myRow?.loginAt ? (
                <p className="font-medium">Login: {formatLoginHint(myRow.loginAt)}</p>
              ) : null}
              <p className="text-xs opacity-75">
                If the Attendance report still shows Absent, reload the page or click your date range again — the
                grid was missing your IST day for the selected range before a recent fix.
              </p>
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutBusy}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-[#8b0000] hover:bg-[#a40000] disabled:opacity-60"
            >
              {logoutBusy ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>
      </div>
  );
}
