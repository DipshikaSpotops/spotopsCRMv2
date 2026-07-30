import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import API from "../api";
import useBrand from "../hooks/useBrand";

const TZ = "America/Chicago";

const MONTHS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];

const money = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function dallasNowParts() {
  const now = new Date();
  return {
    year: Number(formatInTimeZone(now, TZ, "yyyy")),
    month: Number(formatInTimeZone(now, TZ, "M")),
  };
}

function formatCapturedAt(iso) {
  if (!iso) return "—";
  try {
    return formatInTimeZone(new Date(iso), TZ, "MMM d, yyyy h:mm a zzz");
  } catch {
    return "—";
  }
}

export default function MidMonthActualGp() {
  const brand = useBrand();
  const defaults = useMemo(() => dallasNowParts(), []);
  const [year, setYear] = useState(defaults.year);
  const [month, setMonth] = useState(defaults.month);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshots, setSnapshots] = useState([]);
  const [meta, setMeta] = useState(null);

  const yearOptions = useMemo(() => {
    const y = defaults.year;
    const list = [];
    for (let i = y; i >= y - 5; i -= 1) list.push(i);
    return list;
  }, [defaults.year]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await API.get("/salesActualGpSnapshots", {
        params: { year, month },
      });
      setSnapshots(Array.isArray(data?.snapshots) ? data.snapshots : []);
      setMeta(data || null);
    } catch (err) {
      setSnapshots([]);
      setMeta(null);
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load mid-month Actual GP snapshots."
      );
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load, brand]);

  const totalActualGp = useMemo(
    () => snapshots.reduce((sum, row) => sum + (Number(row.actualGP) || 0), 0),
    [snapshots]
  );
  const totalOrders = useMemo(
    () => snapshots.reduce((sum, row) => sum + (Number(row.orderCount) || 0), 0),
    [snapshots]
  );

  const capturedAt = snapshots[0]?.capturedAt;
  const snapshotDateKey = snapshots[0]?.snapshotDateKey;

  return (
    <div className="h-full p-4 sm:p-6 text-white">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Mid-Month Actual GP</h1>
            <p className="mt-1 text-sm text-white/75">
              Stored on the 15th at 12:00 PM Dallas time — Actual GP from the 1st through
              noon on the 15th, per sales agent.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-white/70">Month</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-white/70">Year</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!loading && !error && snapshots.length > 0 && (
          <div className="flex flex-wrap gap-4 text-sm text-white/80">
            <span>
              Brand: <strong className="text-white">{meta?.brand || brand}</strong>
            </span>
            {snapshotDateKey && (
              <span>
                Snapshot date: <strong className="text-white">{snapshotDateKey}</strong>
              </span>
            )}
            {capturedAt && (
              <span>
                Captured:{" "}
                <strong className="text-white">{formatCapturedAt(capturedAt)}</strong>
              </span>
            )}
            <span>
              Total Actual GP:{" "}
              <strong className="text-white">{money(totalActualGp)}</strong>
            </span>
            <span>
              Orders: <strong className="text-white">{totalOrders}</strong>
            </span>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm">
            Loading mid-month Actual GP...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-300/40 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {!loading && !error && snapshots.length === 0 && (
          <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm text-white/80">
            No mid-month snapshot for {MONTHS.find((m) => m.value === month)?.label}{" "}
            {year} yet. Snapshots are stored automatically on the 15th at 12:00 PM Dallas
            time.
          </div>
        )}

        {!loading && !error && snapshots.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/5">
            <table className="min-w-full text-sm">
              <thead className="bg-white/10 text-left text-white/80">
                <tr>
                  <th className="px-4 py-3 font-semibold">Sales Agent</th>
                  <th className="px-4 py-3 font-semibold text-right">Actual GP</th>
                  <th className="px-4 py-3 font-semibold text-right">Orders</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((row) => (
                  <tr
                    key={`${row.brand}-${row.salesAgent}-${row.year}-${row.month}`}
                    className="border-t border-white/10"
                  >
                    <td className="px-4 py-2.5">{row.salesAgent || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {money(row.actualGP)}
                    </td>
                    <td className="px-4 py-2.5 text-right">{row.orderCount ?? 0}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/20 bg-white/10 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{money(totalActualGp)}</td>
                  <td className="px-4 py-3 text-right">{totalOrders}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
