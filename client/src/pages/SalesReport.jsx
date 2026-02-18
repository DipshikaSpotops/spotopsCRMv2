// src/pages/SalesReport.jsx
import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, LabelList
} from "recharts";
import moment from "moment-timezone";
import api from "../api";
import AgentDropdown from "../components/AgentDropdown";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";

/* ----------------------------- Constants / helpers ----------------------------- */
const TZ = "America/Chicago";

// Dallas "now" as moment
const dallasNow = () => moment.tz(TZ);

// Month names
const monthShort = (i1to12) => moment().month(i1to12 - 1).format("MMM");
const monthLong  = (i1to12) => moment().month(i1to12 - 1).format("MMMM");

// Strip literal date part from backend ISO "2025-09-09T14:05:05.051+00:00"
const datePart = (iso) => {
  if (!iso) return "";
  const s = String(iso);
  const i = s.indexOf("T");
  return i > 0 ? s.slice(0, i) : s.slice(0, 10);
};

// Today's Dallas calendar key (still date-only)
const todayDallasKey = () => dallasNow().format("YYYY-MM-DD");

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);

// safe number
const toNumber = (v) => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Fetch one month of orders (server filters by month/year; we don't do time math here)
async function fetchMonthlyOrders({ monthIndex, year, salesAgent }) {
  const qs = new URLSearchParams();
  qs.set("month", monthShort(monthIndex)); // e.g., "Oct"
  qs.set("year", String(year));
  qs.set("limit", "all");
  if (salesAgent) qs.set("salesAgent", salesAgent);
  const { data } = await api.get(`/orders/monthlyOrders?${qs.toString()}`);
  return Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : [];
}

// Build a 12-month series from 12 buckets of orders
function monthlyFromBuckets(buckets) {
  return buckets.map((orders, i) => {
    const ordersCount = orders.length;
    const est = orders.reduce((s, o) => s + toNumber(o.grossProfit), 0);
    const act = orders.reduce((s, o) => s + toNumber(o.actualGP), 0);
    return {
      label: monthShort(i + 1),
      orders: ordersCount,
      gp: Number(est.toFixed(2)),
      _est: est,
      _act: act,
    };
  });
}

// Last N years series from a map of year -> orders[]
function yearlyFromYearMap(yearMap) {
  return Object.entries(yearMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([yr, orders]) => {
      const ordersCount = orders.length;
      const est = orders.reduce((s, o) => s + toNumber(o.grossProfit), 0);
      const act = orders.reduce((s, o) => s + toNumber(o.actualGP), 0);
      return { label: yr, orders: ordersCount, gp: Number(est.toFixed(2)), _est: est, _act: act };
    });
}

/**
 * Top YMM list.
 * mode:
 *  - "count": rank by number of orders
 *  - "gp": rank by total grossProfit
 */
function topYMM(rows, topN = 10, mode = "count") {
  const map = new Map();
  rows.forEach((o) => {
    const ymm = `${o?.year ?? ""} ${o?.make ?? ""} ${o?.model ?? ""}`.trim();
    if (!ymm) return;
    const inc = mode === "gp" ? toNumber(o.grossProfit) : 1;
    map.set(ymm, (map.get(ymm) || 0) + inc);
  });
  const arr = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
  if (mode === "gp") {
    return arr.map(([ymm, gpTotal]) => ({ ymm, gpTotal }));
  }
  return arr.map(([ymm, count]) => ({ ymm, count }));
}

/**
 * Build a per-day series for a given month.
 * Always returns N items for daysInMonth, with zeros for missing days.
 */
function dailySeriesForMonth(rows, monthIndex, year) {
  const daysInMonth = moment(`${year}-${pad2(monthIndex)}-01`).daysInMonth();
  const out = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad2(monthIndex)}-${pad2(d)}`;
    const subset = rows.filter((o) => datePart(o.orderDate) === key);
    const ordersCount = subset.length;
    const est = subset.reduce((s, o) => s + toNumber(o.grossProfit), 0);
    const act = subset.reduce((s, o) => s + toNumber(o.actualGP), 0);
    out.push({
      label: `${monthShort(monthIndex)} ${d}`,
      orders: ordersCount,
      gp: Number(est.toFixed(2)),
      _est: est,
      _act: act,
      _dateKey: key,
    });
  }
  return out;
}

/* --------------------------------- Page ----------------------------------- */
export default function SalesReport() {
  const now = useMemo(() => dallasNow(), []);
  const brand = useBrand(); // 50STARS / PROLANE
  const DEFAULT_MONTH = now.month() + 1;
  const DEFAULT_YEAR  = now.year();

  // view ('today' | 'daily' | 'monthly' | 'yearly')
  const [granularity, setGranularity] = useState("daily");
  const [monthIdx, setMonthIdx] = useState(DEFAULT_MONTH);
  const [year, setYear]         = useState(DEFAULT_YEAR);

  // auth
  const roleInitial      = (localStorage.getItem("role") || "").trim();
  const firstNameInitial = (localStorage.getItem("firstName") || "").trim();
  const [role] = useState(roleInitial);
  const [firstName] = useState(firstNameInitial);

  // agent filter (admin sees dropdown, sales locked to self)
  const [selectedAgent, setSelectedAgent] = useState(
    roleInitial.toLowerCase() === "sales" && firstNameInitial ? firstNameInitial : "All"
  );
  const [agentOptions, setAgentOptions] = useState(["Select", "All"]);

  // chart data
  const [trend, setTrend] = useState([]);
  const [ymmTop, setYmmTop] = useState([]);
  const [ymmMode, setYmmMode] = useState("count"); // 'count' | 'gp'
  const [gpCompare, setGpCompare] = useState({ actual: 0, est: 0 });
  const [loading, setLoading] = useState(false);

  // Bump this to force a reload when realtime events arrive
  const [reloadTick, setReloadTick] = useState(0);

  // Build admin agent options from this month's orders
  useEffect(() => {
    if (role.toLowerCase() !== "admin") return;
    let cancel = false;
    (async () => {
      try {
        const orders = await fetchMonthlyOrders({
          monthIndex: monthIdx,
          year,
          salesAgent: undefined,
        });
        const set = new Set();
        orders.forEach((o) => {
          const a = (o?.salesAgent || "").trim();
          if (a) set.add(a);
        });
        const opts = ["Select", "All", ...[...set].sort((a, b) => a.localeCompare(b))];
        if (!cancel) {
          setAgentOptions(opts);
          if (!opts.includes(selectedAgent)) setSelectedAgent("All");
        }
      } catch {
        if (!cancel) setAgentOptions((prev) => (prev.length ? prev : ["Select", "All"]));
      }
    })();
    return () => { cancel = true; };
  }, [role, monthIdx, year, brand]); // eslint-disable-line

  // Load & compute charts (NO time math, only date-part compare where needed)
  useEffect(() => {
    let cancel = false;

    const agentParam =
      role.toLowerCase() === "sales"
        ? firstName
        : selectedAgent !== "Select" && selectedAgent !== "All"
        ? selectedAgent
        : undefined;

    async function loadToday() {
      // Fetch the selected month's orders
      const monthRows = await fetchMonthlyOrders({
        monthIndex: monthIdx,
        year,
        salesAgent: agentParam,
      });

      // Today's rows by literal date-part equality
      const todayKey = todayDallasKey(); // 'YYYY-MM-DD'
      const rows = monthRows.filter((o) => datePart(o.orderDate) === todayKey);

      // Summaries
      const ordersCount = rows.length;
      const estSum = rows.reduce((s, r) => s + toNumber(r.grossProfit), 0);
      const actSum = rows.reduce((s, r) => s + toNumber(r.actualGP), 0);

      const label = dallasNow().format("MMM D"); // e.g., 'Oct 2'
      const trendToday = [{ label, orders: ordersCount, gp: Number(estSum.toFixed(2)), _est: estSum, _act: actSum }];

      // YMM ranked by GP for Today
      const ymmToday = topYMM(rows, 10, "gp");

      return { trend: trendToday, ymm: ymmToday, ymmMode: "gp", compare: { est: estSum, actual: actSum } };
    }

    async function loadDaily() {
      // Fetch this one month
      const monthRows = await fetchMonthlyOrders({
        monthIndex: monthIdx,
        year,
        salesAgent: agentParam,
      });

      // A point for each day in the month (zeros if no orders)
      const dailySeries = dailySeriesForMonth(monthRows, monthIdx, year);

      // For daily (whole month), YMM by COUNT (keep consistency with monthly)
      const ymmMonthlyLike = topYMM(monthRows, 10, "count");

      // Totals across the month
      const estTotal = dailySeries.reduce((s, r) => s + (r._est || 0), 0);
      const actTotal = dailySeries.reduce((s, r) => s + (r._act || 0), 0);

      return { trend: dailySeries, ymm: ymmMonthlyLike, ymmMode: "count", compare: { est: estTotal, actual: actTotal } };
    }

    async function loadMonthly() {
      // 12 months of the selected year (sum/count only)
      const buckets = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          fetchMonthlyOrders({ monthIndex: i + 1, year, salesAgent: agentParam })
        )
      );
      const monthlyRows = monthlyFromBuckets(buckets);
      const allRows = buckets.flat();

      const estTotal = monthlyRows.reduce((s, r) => s + (r._est || 0), 0);
      const actTotal = monthlyRows.reduce((s, r) => s + (r._act || 0), 0);

      // YMM by COUNT
      const ymmMonthly = topYMM(allRows, 10, "count");

      return { trend: monthlyRows, ymm: ymmMonthly, ymmMode: "count", compare: { est: estTotal, actual: actTotal } };
    }

    async function loadYearly() {
      // Last 5 years
      const years = Array.from({ length: 5 }, (_, k) => year - (4 - k));
      const yearMap = {};
      for (const y of years) {
        const months = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            fetchMonthlyOrders({ monthIndex: i + 1, year: y, salesAgent: agentParam })
          )
        );
        yearMap[y] = months.flat();
      }
      const yearlyRows = yearlyFromYearMap(yearMap);
      const allRows = Object.values(yearMap).flat();

      const estTotal = yearlyRows.reduce((s, r) => s + (r._est || 0), 0);
      const actTotal = yearlyRows.reduce((s, r) => s + (r._act || 0), 0);

      // YMM by COUNT
      const ymmYearly = topYMM(allRows, 10, "count");

      return { trend: yearlyRows, ymm: ymmYearly, ymmMode: "count", compare: { est: estTotal, actual: actTotal } };
    }

    (async () => {
      setLoading(true);
      try {
        let payload;
        if (granularity === "today")       payload = await loadToday();
        else if (granularity === "daily")  payload = await loadDaily();
        else if (granularity === "monthly") payload = await loadMonthly();
        else                                payload = await loadYearly();

        if (cancel) return;
        setTrend(payload.trend);
        setYmmTop(payload.ymm);
        setYmmMode(payload.ymmMode);
        setGpCompare(payload.compare);
      } catch (e) {
        console.error("SalesReport load error:", e);
        if (!cancel) {
          setTrend([]);
          setYmmTop([]);
          setYmmMode("count");
          setGpCompare({ actual: 0, est: 0 });
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [granularity, monthIdx, year, role, firstName, selectedAgent, reloadTick, brand]);

  // Realtime: when orders change, recompute charts for current filters
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => setReloadTick((t) => t + 1),
    onOrderUpdated: () => setReloadTick((t) => t + 1),
  });

  /* ----------------------------------- UI ----------------------------------- */
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthLong(i + 1) })),
    []
  );
  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, i) => now.year() - i),
    [now]
  );

  const titleSuffix =
    granularity === "today"
      ? "Today"
      : granularity === "daily"
      ? "Daily (Full Month)"
      : granularity[0].toUpperCase() + granularity.slice(1);

  return (
    <div className="h-full p-4 sm:p-6">
      <div className="relative z-10 w-full px-3 sm:px-4 lg:px-6 space-y-6 lg:space-y-8">

        {/* Header */}
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-semibold text-white">
            Sales Report —{" "}
            {role.toLowerCase() === "sales"
              ? firstName || "You"
              : selectedAgent !== "Select" && selectedAgent !== "All"
              ? selectedAgent
              : "All Agents"}
          </h1>

          {role.toLowerCase() === "admin" && (
            <div className="ml-auto">
              <AgentDropdown
                options={agentOptions}
                value={selectedAgent}
                onChange={(val) => setSelectedAgent(val)}
              />
            </div>
          )}

          {loading && <span className="text-xs text-white/70">Loading…</span>}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Pill label="View">
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
              className="appearance-none bg-transparent text-white/95 px-2 py-1 pr-7 rounded-md border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 hover:border-white/30"
            >
              <option className="bg-slate-800" value="today">Today</option>
              <option className="bg-slate-800" value="daily">Daily (Full Month)</option>
              <option className="bg-slate-800" value="monthly">Monthly</option>
              <option className="bg-slate-800" value="yearly">Yearly</option>
            </select>
          </Pill>

          <Pill label="Month">
            <select
              value={monthIdx}
              onChange={(e) => setMonthIdx(Number(e.target.value))}
              className="appearance-none bg-transparent text-white/95 px-2 py-1 pr-7 rounded-md border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 hover:border-white/30"
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value} className="bg-slate-800">
                  {m.label}
                </option>
              ))}
            </select>
          </Pill>

          <Pill label="Year">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="appearance-none bg-transparent text-white/95 px-2 py-1 pr-7 rounded-md border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 hover:border-white/30"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y} className="bg-slate-800">
                  {y}
                </option>
              ))}
            </select>
          </Pill>

          <button
            onClick={() => {
              const n = dallasNow();
              setMonthIdx(n.month() + 1);
              setYear(n.year());
            }}
            className="ml-auto sm:ml-0 backdrop-blur-md bg-white/10 hover:bg-white/20 shadow-lg rounded-xl px-3 py-2 text-sm font-semibold transition"
          >
            Current Month
          </button>
        </div>

        {/* Row 1 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
          <ChartSection title={`Agent Trend — ${titleSuffix}`} fullHeight>
            <div className="w-full h-64 md:h-72 xl:h-80 2xl:h-[24rem]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="label" stroke="currentColor" />
                  <YAxis yAxisId="left" orientation="left" stroke="currentColor" />
                  <YAxis yAxisId="right" orientation="right" stroke="currentColor" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="orders" stroke="#8b5cf6" strokeWidth={2} name="Orders" />
                  <Line yAxisId="right" type="monotone" dataKey="gp" stroke="#ec4899" strokeWidth={2} name="Gross Profit" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartSection>

          <ChartSection
            title={`Top Year • Make • Model (${ymmMode === "gp" ? "by GP" : "by count"})`}
            fullHeight
          >
            {ymmTop.length ? (
              <div className="w-full h-64 md:h-72 xl:h-80 2xl:h-[24rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ymmTop} layout="vertical" margin={{ top: 12, right: 20, bottom: 12, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis
                      type="number"
                      stroke="currentColor"
                      tickFormatter={(v) =>
                        ymmMode === "gp" ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString()
                      }
                    />
                    <YAxis type="category" dataKey="ymm" width={0} tick={false} />
                    <Tooltip
                      formatter={(v) =>
                        ymmMode === "gp" ? `$${Number(v).toFixed(2)}` : Number(v).toLocaleString()
                      }
                      labelFormatter={(lab, payload) => (payload?.[0]?.payload?.ymm ?? lab)}
                    />
                    <Legend />
                    <Bar
                      dataKey={ymmMode === "gp" ? "gpTotal" : "count"}
                      name={ymmMode === "gp" ? "Gross Profit" : "Units Sold"}
                      fill="#9955a5"
                    >
                      {/* left: YMM text inside the bar */}
                      <LabelList
                        dataKey="ymm"
                        position="insideLeft"
                        style={{ fill: "#fff", fontWeight: 600, fontSize: 12 }}
                      />
                      {/* right: value label */}
                      <LabelList
                        dataKey={ymmMode === "gp" ? "gpTotal" : "count"}
                        position="insideRight"
                        formatter={(v) =>
                          ymmMode === "gp" ? `$${Number(v).toFixed(0)}` : Number(v).toLocaleString()
                        }
                        style={{ fill: "#fff", fontWeight: 600, fontSize: 12 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-gray-300">No data for this selection</p>
            )}
          </ChartSection>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
          <ChartSection title="Actual GP vs Gross Profit" fullHeight>
            <div className="w-full h-56 md:h-64 xl:h-72 2xl:h-[20rem]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[{
                    label:
                      granularity === "today"
                        ? "Today"
                        : granularity === "daily"
                        ? `${monthShort(monthIdx)} ${year}`
                        : granularity === "monthly"
                        ? "This Year"
                        : "5y Total",
                    ActualGP: gpCompare.actual,
                    GrossProfit: gpCompare.est
                  }]}
                  margin={{ top: 12, right: 20, bottom: 12, left: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="label" stroke="currentColor" />
                  <YAxis stroke="currentColor" tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                  <Tooltip formatter={(v) => `$${Number(v).toFixed(2)}`} />
                  <Legend />
                  <Bar dataKey="ActualGP" fill="#60a5fa" />
                  <Bar dataKey="GrossProfit" fill="#a78bfa" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartSection>

          <ChartSection title="Agent Highlights" fullHeight>
            <div className="grid grid-cols-3 gap-3">
              <KpiChip label="Orders"   value={trend.reduce((s, r) => s + (r.orders || 0), 0)} />
              <KpiChip label="GP (sum)"  value={`$${trend.reduce((s, r) => s + (r.gp || 0), 0).toFixed(2)}`} />
              <KpiChip label="Top YMM"   value={ymmTop[0]?.ymm || "—"} />
            </div>
          </ChartSection>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- UI Subcomponents ---------------------------- */
function Pill({ label, children }) {
  return (
    <div className="backdrop-blur-md bg-white/10 shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 text-sm">
      <span className="font-medium opacity-80 whitespace-nowrap">{label}:</span>
      {children}
    </div>
  );
}

function ChartSection({ title, children, fullHeight }) {
  return (
    <div
      className={`bg-white/30 dark:bg-white/5 text-white rounded-2xl shadow-md backdrop-blur-sm transition p-4 sm:p-6 ${
        fullHeight ? "h-full flex flex-col" : ""
      }`}
      style={{ minHeight: 340 }}
    >
      <h2 className="text-base sm:text-lg xl:text-xl font-semibold mb-3 sm:mb-4">
        {title}
      </h2>
      <div className="flex-1 min-h-[220px]">{children}</div>
    </div>
  );
}

function KpiChip({ label, value }) {
  return (
    <div className="inline-flex items-center justify-center rounded-lg px-3 h-10 sm:h-11" style={{ backgroundColor: "#223448" }}>
      <span className="font-semibold text-[12px] sm:text-sm leading-none text-white/90">
        {label}: <span className="font-extrabold text-white">&nbsp;{value}</span>
      </span>
    </div>
  );
}
