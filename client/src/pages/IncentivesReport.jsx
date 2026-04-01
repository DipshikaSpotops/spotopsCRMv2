import { useEffect, useMemo, useState } from "react";
import API from "../api";
import useBrand from "../hooks/useBrand";

const money = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const pct = (n) => `${Number(n || 0).toFixed(2)}%`;

function formatAsOf(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function IncentivesReport() {
  const role = (localStorage.getItem("role") || "").trim();
  const email = (
    (() => {
      try {
        const raw = localStorage.getItem("auth");
        if (raw) return JSON.parse(raw)?.user?.email || undefined;
      } catch {}
      return localStorage.getItem("email") || undefined;
    })() || ""
  )
    .trim()
    .toLowerCase();
  const brand = useBrand();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [months, setMonths] = useState([]);

  const isAdmin = useMemo(() => role.toLowerCase() === "admin", [role]);
  const hasEmailAccess = useMemo(
    () => email === "50starsauto110@gmail.com",
    [email]
  );
  const canAccess = isAdmin || hasEmailAccess;

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await API.get("/reports/incentives", {
          params: { months: 3 },
        });
        if (!cancelled) {
          setMonths(Array.isArray(data?.months) ? data.months : []);
        }
      } catch (err) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load incentives report.";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canAccess, brand]);

  if (!canAccess) {
    return (
      <div className="p-6 text-white">
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          This report is available only for Admin or authorized account.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-4 sm:p-6 text-white">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Incentives Report</h1>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          >
            Refresh
          </button>
        </div>
        <p className="text-sm text-white/80">
          Latest 3 months including current month-to-date. Current GP is estimated GP
          (gross profit) excluding Dispute, Order Cancelled, and Refunded orders.
        </p>

        {loading && (
          <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm">
            Loading incentives report...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-300/40 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          months.map((m) => (
            <section
              key={m.key}
              className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm"
            >
              <div className="mb-3">
                <h2 className="text-lg font-semibold">{m.title}</h2>
                <p className="text-xs text-white/70">
                  as of {formatAsOf(m.asOfDate)}
                </p>
              </div>
              <div className="mb-3 border-b border-white/30" />

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/20 text-left">
                      <th className="px-2 py-2 border-r border-white/20">Agents</th>
                      <th className="px-2 py-2 border-r border-white/20">No of Orders ({m.totals?.noOfOrders || 0})</th>
                      <th className="px-2 py-2 border-r border-white/20">Current GP</th>
                      <th className="px-2 py-2 border-r border-white/20">Est GP</th>
                      <th className="px-2 py-2 border-r border-white/20">Actual GP</th>
                      <th className="px-2 py-2 border-r border-white/20">Cancelled Orders</th>
                      <th className="px-2 py-2 border-r border-white/20">Refunded Orders</th>
                      <th className="px-2 py-2 border-r border-white/20">Disputes</th>
                      <th className="px-2 py-2">Cancellation Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(m.rows || []).map((r) => (
                      <tr key={`${m.key}-${r.agent}`} className="border-b border-white/10">
                        <td className="px-2 py-2 font-medium border-r border-white/10">{r.agent}</td>
                        <td className="px-2 py-2 border-r border-white/10">{r.noOfOrders}</td>
                        <td className="px-2 py-2 border-r border-white/10">{money(r.currentGp)}</td>
                        <td className="px-2 py-2 border-r border-white/10">{money(r.estGp)}</td>
                        <td className="px-2 py-2 border-r border-white/10">{money(r.actualGp)}</td>
                        <td className="px-2 py-2 border-r border-white/10">{r.noOfCancellation}</td>
                        <td className="px-2 py-2 border-r border-white/10">{r.refundedOrders}</td>
                        <td className="px-2 py-2 border-r border-white/10">{r.noOfDispute}</td>
                        <td className="px-2 py-2">
                          {r.individualReportCount} ({pct(r.individualReportPercent)})
                        </td>
                      </tr>
                    ))}

                    <tr className="border-y border-white/40 font-semibold">
                      <td className="px-2 py-2 border-r border-white/20">Total</td>
                      <td className="px-2 py-2 border-r border-white/20">{m.totals?.noOfOrders || 0}</td>
                      <td className="px-2 py-2 border-r border-white/20">{money(m.totals?.currentGp)}</td>
                      <td className="px-2 py-2 border-r border-white/20">{money(m.totals?.estGp)}</td>
                      <td className="px-2 py-2 border-r border-white/20">{money(m.totals?.actualGp)}</td>
                      <td className="px-2 py-2 border-r border-white/20">{m.totals?.noOfCancellation || 0}</td>
                      <td className="px-2 py-2 border-r border-white/20">{m.totals?.refundedOrders || 0}</td>
                      <td className="px-2 py-2 border-r border-white/20">{m.totals?.noOfDispute || 0}</td>
                      <td className="px-2 py-2">
                        {m.totals?.individualReportCount || 0} (
                        {pct(m.totals?.individualReportPercent || 0)})
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ))}

        {!loading && !error && !months.length && (
          <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm">
            No incentives data found for the latest 3 months.
          </div>
        )}
      </div>
    </div>
  );
}

