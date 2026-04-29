import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectRole } from "../store/authSlice";
import API from "../api";

function useEffectiveRole() {
  const roleFromRedux = useSelector(selectRole);
  return useMemo(() => {
    if (roleFromRedux) return roleFromRedux;
    try {
      const raw = localStorage.getItem("auth");
      if (raw) return JSON.parse(raw)?.user?.role || undefined;
    } catch {
      // ignore
    }
    return localStorage.getItem("role") || undefined;
  }, [roleFromRedux]);
}

export default function AuthorizationCodes() {
  const role = useEffectiveRole();
  const userEmail = useMemo(() => {
    try {
      const raw = localStorage.getItem("auth");
      if (raw) return String(JSON.parse(raw)?.user?.email || "").trim().toLowerCase();
    } catch {
      // ignore
    }
    return String(localStorage.getItem("email") || "").trim().toLowerCase();
  }, []);
  const isAllowedByEmail = userEmail === "50starsauto110@gmail.com";
  const [rows, setRows] = useState([]);
  const [windowSeconds, setWindowSeconds] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tickNowMs, setTickNowMs] = useState(Date.now());

  const fetchCodes = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const { data } = await API.get("/auth/admin/authorization-codes", { timeout: 20000 });
      const fetchedAtMs = Date.now();
      const normalizedRows = (Array.isArray(data?.rows) ? data.rows : []).map((row) => ({
        ...row,
        fetchedAtMs,
      }));
      setRows(normalizedRows);
      setWindowSeconds(Number(data?.windowSeconds) || 60);
      setLastUpdated(new Date());
    } catch (err) {
      if (!silent) {
        setError(err?.response?.data?.message || err?.message || "Failed to load authorization codes.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchCodes({ silent: false });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchCodes({ silent: true });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      setTickNowMs(Date.now());
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  if (role != null && role !== "Admin" && !isAllowedByEmail) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen p-6">
      <div className="rounded-lg bg-white/10 border border-white/20 p-4 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">Authorization Code</h1>
            <p className="text-sm text-white/70">
              Rotating access codes for all users. Codes refresh every {windowSeconds} seconds.
            </p>
          </div>
          <button
            onClick={() => fetchCodes({ silent: false })}
            className="px-3 py-2 rounded bg-[#2c5d81] hover:bg-blue-700 text-white text-sm"
          >
            Refresh now
          </button>
        </div>
        {lastUpdated && (
          <p className="text-xs text-white/60 mt-2">Last updated: {lastUpdated.toLocaleTimeString()}</p>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-white/80">Loading authorization codes...</div>
      ) : error ? (
        <div className="text-red-300">{error}</div>
      ) : (
        <div className="rounded-lg border border-white/20 bg-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/10">
              <tr>
                <th className="text-left px-3 py-2 border-r border-white/20">User</th>
                <th className="text-left px-3 py-2 border-r border-white/20">Email</th>
                <th className="text-left px-3 py-2 border-r border-white/20">Role</th>
                <th className="text-left px-3 py-2 border-r border-white/20">Authorization Code</th>
                <th className="text-right px-3 py-2">Refresh In</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className="odd:bg-white/0 even:bg-white/5">
                  <td className="px-3 py-2 border-r border-white/10 text-white">
                    {[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-3 py-2 border-r border-white/10 text-white/80">{row.email}</td>
                  <td className="px-3 py-2 border-r border-white/10 text-white/80">{row.role || "—"}</td>
                  <td className="px-3 py-2 border-r border-white/10 font-mono text-cyan-300">{row.code}</td>
                  <td className="px-3 py-2 text-right text-white/80">
                    {Math.max(
                      0,
                      Math.ceil(
                        Number(row.secondsRemaining || 0) -
                          (tickNowMs - Number(row.fetchedAtMs || tickNowMs)) / 1000
                      )
                    )}
                    s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

