import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import API from "../api";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell
} from "recharts";

/* --------------------------- Helpers / Constants -------------------------- */

// Parse numbers such as "$1,234.56", "1,234.56", " 1234.56 "
const toNumber = (v) => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Month label helper (1..12 -> "Jan"...)
const monthLabel = (i) =>
  new Date(0, i - 1).toLocaleString("default", { month: "short" });

// Date like 2025-10-01 -> "Oct 1st 2025"
function formatBestDay(dateish) {
  const d = new Date(dateish);
  const day = d.getDate();
  const suffix = (day % 10 === 1 && day % 100 !== 11)
    ? "st"
    : (day % 10 === 2 && day % 100 !== 12)
    ? "nd"
    : (day % 10 === 3 && day % 100 !== 13)
    ? "rd"
    : "th";
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  return `${month} ${day}${suffix} ${year}`;
}

// Custom Legend for Donut Chart
function CustomLegend({ payload }) {
  if (!payload) return null;
  return (
    <div style={{ marginLeft: 20 }}>
      {payload.map((entry, index) => (
        <div key={`item-${index}`} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div
            style={{
              width: 14,
              height: 14,
              backgroundColor: entry.color,
              marginRight: 8,
              borderRadius: 3
            }}
          />
          <span style={{ color: "white" }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// Status Colors
const STATUS_COLORS = {
  "Placed": "#a0d9d3",
  "Customer Approved": "#4d98c8",
  "Yard Processing": "#a264d5",
  "In Transit": "#696bb5",
  "Escalation": "#ef9a9a",
  "Order Fulfilled": "#82e185",
  "Order Cancelled": "#eb7078",
  "Refunded": "#f48fb1",
  "Dispute": "#b0bec5",
  "Voided": "#9aa3af",
};

// Dallas "now" at mount
const getDallasNow = () => {
  const nowDallas = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
  return new Date(nowDallas);
};

/* --------------------------------- View ---------------------------------- */

export default function Dashboard() {
  // Defaults from Dallas time
  const dallasNow = useMemo(() => getDallasNow(), []);
  const defaultMonth = dallasNow.getMonth() + 1;
  const defaultYear = dallasNow.getFullYear();

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedYear, setSelectedYear] = useState(defaultYear);

  // State
  const [summary, setSummary] = useState({
    totalOrders: 0, totalSales: 0, totalGp: 0, actualGp: 0, purchases: 0,
  });
  const [dailyData, setDailyData] = useState([]);
  const [yearlyGPData, setYearlyGPData] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [monthlyAgentGP, setmonthlyAgentGP] = useState(null);
  const [topAgentToday, settopAgentToday] = useState(null);
  const [bestDay, setBestDay] = useState(null); // [date, amount, optionalTopAgent]
  const [topAgents, setTopAgents] = useState([]);
  const [cancelRefundData, setCancelRefundData] = useState({
    cancelled: 0, refunded: 0, disputed: 0, refundAmount: 0
  });
  const [reimburseData, setReimburseData] = useState({ count: 0, amount: 0 });

  // Cache strict year overview per year
  const [yearOverviewCache, setYearOverviewCache] = useState({}); // { [year]: [{month, actualGP}] }

  /* -------------------- Monthly data (reactive to filters) -------------------- */
  useEffect(() => {
    async function loadDashboardMonthly() {
      try {
        const res = await API.get(`/orders/dashboard?month=${selectedMonth}&year=${selectedYear}`);

        const {
          totalOrders, totalSales, totalGp, actualGp, purchases,
          dailyData: daily,
          statusBreakdown,
          monthlyAgentGP: magp,
          topAgentToday: topToday,
          bestDay: bday,
        } = res.data || {};

        setSummary({ totalOrders, totalSales, totalGp, actualGp, purchases });
        setmonthlyAgentGP(magp);
        setBestDay(bday);
        settopAgentToday(topToday);

        const agents = Object.entries(magp || {})
          .map(([name, gp]) => ({ name, gp }))
          .sort((a, b) => b.gp - a.gp);
        setTopAgents(agents);

        const dailyChartData = Object.entries(daily || {}).map(([day, values]) => ({
          day,
          orders: values.orders,
          gp: Number((values.gp ?? 0).toFixed(2)),
        }));
        setDailyData(dailyChartData);

        const pieChartData = Object.entries(statusBreakdown || {}).map(([name, value]) => ({
          name,
          value,
          color: STATUS_COLORS[name] || "#a1a1aa",
        }));
        setPieData(pieChartData);
      } catch (err) {
        console.error("Error loading monthly dashboard data:", err);
      }
    }

    async function loadCancelRefund() {
      try {
        const [cancelledOrders, refundedOrders, disputedOrders] = await Promise.all([
          API.get("/orders/cancelled-by-date", { params: { month: selectedMonth, year: selectedYear } }).then(r => r.data),
          API.get("/orders/refunded-by-date",  { params: { month: selectedMonth, year: selectedYear } }).then(r => r.data),
          API.get("/orders/disputes-by-date",  { params: { month: selectedMonth, year: selectedYear } }).then(r => r.data),
        ]);

        const cancelled = cancelledOrders.length;
        const refunded = refundedOrders.length;
        const disputed = disputedOrders.length;

        const refundAmount = refundedOrders.reduce((sum, order) => {
          const raw = order.custRefAmount ?? order.refundAmount ?? order.amount ?? order.totalRefund ?? 0;
          return sum + toNumber(raw);
        }, 0);

        setCancelRefundData({ cancelled, refunded, disputed, refundAmount });
      } catch (err) {
        console.error("Error loading cancel/refund/dispute data:", err);
      }
    }

    async function loadReimbursements() {
      try {
        const reimbursedOrders = await API.get("/orders/reimbursed-by-date", { params: { month: selectedMonth, year: selectedYear } })
          .then(r => r.data || []);

        let count = 0;
        let amount = 0;
        for (const order of reimbursedOrders) {
          const infos = order?.additionalInfo || [];
          for (const info of infos) {
            if (info?.reimbursedDate) {
              count += 1;
              amount += toNumber(info?.reimbursementAmount);
            }
          }
        }
        setReimburseData({ count, amount });
      } catch (err) {
        console.error("Error loading reimbursements:", err);
        setReimburseData({ count: 0, amount: 0 });
      }
    }

    loadDashboardMonthly();
    loadCancelRefund();
    loadReimbursements();
  }, [selectedMonth, selectedYear]);

  /* ---- STRICT Year Overview (build from 12 calls to existing /orders/dashboard) ---- */
  useEffect(() => {
    let cancelled = false;

    async function loadYearOverviewStrict() {
      if (yearOverviewCache[selectedYear]) {
        setYearlyGPData(yearOverviewCache[selectedYear]);
        return;
      }

      try {
        const months = Array.from({ length: 12 }, (_, i) => i + 1);
        const results = await Promise.all(
          months.map(async (m) => {
           const res = await API.get(`/orders/dashboard?month=${m}&year=${selectedYear}`
            );
            const actual = res.data?.actualGp ?? res.data?.actualGP ?? 0;
            return { month: monthLabel(m), actualGP: Number(actual) || 0 };
          })
        );

        if (!cancelled) {
          setYearlyGPData(results);
          setYearOverviewCache((prev) => ({ ...prev, [selectedYear]: results }));
        }
      } catch (err) {
        console.error("Error building strict yearly overview:", err);
        if (!cancelled) setYearlyGPData([]);
      }
    }

    loadYearOverviewStrict();
    return () => { cancelled = true; };
  }, [selectedYear, yearOverviewCache]);

  /* ----------------------------------- UI ----------------------------------- */

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: new Date(0, i).toLocaleString("default", { month: "long" })
    })),
    []
  );
  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, i) => defaultYear - i),
    [defaultYear]
  );
  const resetToCurrent = () => {
    setSelectedMonth(defaultMonth);
    setSelectedYear(defaultYear);
  };

  return (
    <div className="h-full p-4 sm:p-6">
      <div className="relative z-10 w-full px-3 sm:px-4 lg:px-6 space-y-6 lg:space-y-8">

        {/* Filters — pill style to match the summary chips */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {[
            {
              key: "month",
              label: "Month",
              value: selectedMonth,
              onChange: (v) => setSelectedMonth(Number(v)),
              options: monthOptions, // [{value,label}]
            },
            {
              key: "year",
              label: "Year",
              value: selectedYear,
              onChange: (v) => setSelectedYear(Number(v)),
              options: yearOptions.map((yr) => ({ value: yr, label: yr })),
            },
          ].map((ctl) => (
            <div
              key={ctl.key}
              className="backdrop-blur-md bg-white/10 shadow-lg rounded-xl
                         px-3 py-2 flex items-center gap-2 text-sm sm:text-base w-auto"
            >
              <span className="font-medium opacity-80 whitespace-nowrap">
                {ctl.label}:
              </span>

              <div className="relative">
                {/* Select styled to live inside the pill */}
                <select
                  value={ctl.value}
                  onChange={(e) => ctl.onChange(e.target.value)}
                  className="appearance-none bg-transparent text-white/95
                             px-2 py-1 pr-7 rounded-md border border-white/20
                             focus:outline-none focus:ring-2 focus:ring-white/30
                             hover:border-white/30"
                >
                  {ctl.options.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-slate-800">
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* caret */}
                <svg
                  className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-70"
                  width="16" height="16" viewBox="0 0 20 20" fill="currentColor"
                >
                  <path d="M5.5 7.5L10 12l4.5-4.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          ))}

          {/* Current Month button styled as a pill too */}
          <button
            onClick={resetToCurrent}
            className="ml-auto sm:ml-0 backdrop-blur-md bg-white/10 hover:bg-white/20
                       shadow-lg rounded-xl px-3 py-2 text-sm sm:text-base font-semibold
                       transition"
          >
            Current Month
          </button>
        </div>

        {/* Summary Cards */}
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Total Orders", value: summary.totalOrders },
            { label: "Total Sales", value: `$${(summary.totalSales || 0).toFixed(2)}` },
            { label: "Purchases", value: `$${(summary.purchases || 0).toFixed(2)}` },
            { label: "Total GP", value: `$${(summary.totalGp || 0).toFixed(2)}` },
            { label: "Actual GP", value: `$${(summary.actualGp || 0).toFixed(2)}` },
          ].map((item, i) => (
            <div
              key={i}
              className="backdrop-blur-md bg-white/10 shadow-lg rounded-xl 
                         px-3 py-2 flex items-center gap-2 text-sm sm:text-base w-auto"
            >
              <span className="font-medium opacity-80 whitespace-nowrap">{item.label}:</span>
              <span className="font-semibold">{item.value}</span>
            </div>
          ))}
        </div>

        {/* Main Grid (Aligned + Equal Heights) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6 items-stretch">
          {/* Row 1 Left: Daily */}
          <div className="xl:col-span-1 2xl:col-span-2 flex flex-col">
            <ChartSection title="Daily Orders & Gross Profit" fullHeight>
              <div className="w-full h-64 md:h-72 xl:h-80 2xl:h-[24rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="day" stroke="currentColor" />
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
          </div>

          {/* Row 1 Right: Donut */}
          <div className="flex flex-col">
            <ChartSection title="Order Status Breakdown" fullHeight>
              {pieData.length > 0 ? (
                <div className="w-full h-64 md:h-72 xl:h-80 2xl:h-[24rem]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 12, right: 20, bottom: 12, left: 20 }}>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="48%"
                        cy="50%"
                        outerRadius={70}
                        innerRadius={45}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend
                        wrapperStyle={{ fontSize: "0.875rem", lineHeight: 1.25 }} 
                        content={<CustomLegend />}
                        layout="vertical"
                        align="right"
                        verticalAlign="middle"
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-center text-gray-300">No order status data available</p>
              )}
            </ChartSection>
          </div>

          {/* Row 2 Left: Year Overview (strict per year) */}
          <div className="xl:col-span-1 2xl:col-span-2 flex flex-col">
            <ChartSection title="Monthly Actual GP (Year Overview)" fullHeight>
              <div className="w-full h-64 md:h-72 xl:h-80 2xl:h-[24rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearlyGPData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="month" stroke="currentColor" />
                    <YAxis stroke="currentColor" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="actualGP" fill="#9955a5" name="Actual GP" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartSection>
          </div>

          {/* Row 2 Right: Sales Insights & Refunds */}
          <div className="flex flex-col">
            <ChartSection title="Sales Insights & Refunds" fullHeight>
              <div className="bg-white/10 p-4 rounded-lg shadow-md">
                <h5 className="text-lg font-semibold mb-2 text-white">Sales Insights</h5>
                <p className="text-sm mb-1 whitespace-nowrap">
                  <strong>Top Sales Agent Today:</strong>{" "}
                  {topAgentToday ? `${topAgentToday[0]} - $${topAgentToday[1].toFixed(2)}` : "No sales today"}
                </p>
                <p className="text-sm whitespace-nowrap">
                  <strong>Best Sales Day:</strong>{" "}
                  {bestDay
                    ? (() => {
                        const base = `${formatBestDay(bestDay[0])} - $${bestDay[1].toFixed(2)}`;
                        // optional best-day top agent name+amount as bestDay[2], bestDay[3]
                        if (bestDay[2] && Number.isFinite(bestDay[3])) {
                          return `${base} (Top Agent: ${bestDay[2]} – $${Number(bestDay[3]).toFixed(2)} of $${bestDay[1].toFixed(2)})`;
                        }
                        if (bestDay[2]) return `${base} (Top Agent: ${bestDay[2]})`;
                        return base;
                      })()
                    : "No sales this month"}
                </p>
                {/* Compact inline counts, guaranteed single line */}
                {/* <p className="text-xs opacity-80 mt-1 whitespace-nowrap">
                  <strong>Cancelled / Refunded / Disputed:</strong>{" "}
                  {cancelRefundData.cancelled}, {cancelRefundData.refunded}, {cancelRefundData.disputed}
                </p> */}
              </div>

              {/* One-line KPI tiles with horizontal scroll fallback */}
            {/* One-line, compact KPI chips (perfectly centered) */}
<div className="mt-3 grid grid-cols-3 gap-2">
  <div className="inline-flex items-center justify-center rounded-lg bg-[#b05052] px-3 h-10 sm:h-11">
    <span className="font-semibold text-[12px] sm:text-sm leading-none text-white/90">
      Cancelled Orders <span className="font-extrabold text-white">&nbsp;{cancelRefundData.cancelled}</span>
    </span>
  </div>

  <div className="inline-flex items-center justify-center rounded-lg bg-[#805f89] px-3 h-10 sm:h-11">
    <span className="font-semibold text-[12px] sm:text-sm leading-none text-white/90">
      Refunded Orders <span className="font-extrabold text-white">&nbsp;{cancelRefundData.refunded}</span>
    </span>
  </div>

  <div className="inline-flex items-center justify-center rounded-lg bg-[#8f814b] px-3 h-10 sm:h-11">
    <span className="font-semibold text-[12px] sm:text-sm leading-none text-white/90">
      Disputed Orders <span className="font-extrabold text-white text-center">&nbsp;{cancelRefundData.disputed}</span>
    </span>
  </div>
</div>

              {/* <p className="text-[#f8dbdf] font-semibold text-center mt-3 whitespace-nowrap">
                Total Refund Amount: ${cancelRefundData.refundAmount.toFixed(2)}
              </p>
              <p className="text-[#d1f8db] font-semibold text-center mt-1 whitespace-nowrap">
                Total Reimbursement Amount: ${reimburseData.amount.toFixed(2)} ({reimburseData.count})
              </p> */}

              {/* Refunds vs Reimbursements (horizontal bar) */}
              <div className="w-full h-48 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[{ name: 'Totals', Refunds: Number(cancelRefundData.refundAmount || 0), Reimbursements: Number(reimburseData.amount || 0) }]} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis type="number" stroke="currentColor" tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                    <YAxis type="category" dataKey="name" stroke="currentColor" />
                    <Tooltip formatter={(v) => `$${Number(v).toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="Refunds" fill="#e879f9" />
                    <Bar dataKey="Reimbursements" fill="#34d399" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartSection>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Subcomponents ------------------------------ */

function Card({ title, value }) {
  return (
    <div className="bg-white/30 dark:bg-white/5 text-white px-5 py-3 rounded-xl shadow-md backdrop-blur-sm flex items-center justify-center text-base sm:text-lg font-medium">
      <span className="opacity-80 mr-1">{title}:</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
// Equal-height wrapper using flex + min height as baseline
function ChartSection({ title, children, fullHeight }) {
  return (
    <div
      className={`bg-white/30 dark:bg-white/5 text-white rounded-2xl shadow-md backdrop-blur-sm transition p-4 sm:p-6
      ${fullHeight ? "h-full flex flex-col" : ""}`}
      style={{ minHeight: 360 }}
    >
      <h2 className="text-base sm:text-lg xl:text-xl font-semibold mb-3 sm:mb-4">{title}</h2>
      <div className="flex-1 min-h-[220px]">{children}</div>
    </div>
  );
}
