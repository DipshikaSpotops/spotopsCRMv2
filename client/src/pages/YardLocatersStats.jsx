import { useEffect, useMemo, useState } from "react";
import moment from "moment-timezone";
import API from "../api";
import useBrand from "../hooks/useBrand";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import {
  USER_PERMISSIONS,
  userHasPermission,
} from "../../../shared/constants/userPermissions.js";

const REPORT_TZ = "America/Chicago";

/** Default date filter = current month (Dallas TZ) as UTC ISO bounds. */
function currentMonthDateFilter() {
  const now = moment.tz(REPORT_TZ);
  return {
    start: now.clone().startOf("month").utc().format(),
    end: now.clone().endOf("month").utc().format(),
  };
}

/**
 * Yard Locaters Stats
 * ------------------------------------------------------------------
 * Reports > Statistics > Yard Locaters Stats
 * Access: Admin OR user with USER_PERMISSIONS.YARD_LOCATES.
 *
 * Metrics per locater (Tyler / Amy / Nik / …):
 *   • # orders located, first-locates vs relocates
 *   • Avg time from Invoice Signed → Yard Located
 *   • Avg time from Yard Located → Part Shipped
 *   • PO cancellations + category breakdown (muddy / rusty / damaged / other)
 *   • Delayed locates (> 24h)
 *   • Fulfillment / ship / cancel rates
 * Also: month-wise + yard-wise breakdowns with an internal star rating per yard.
 */

const money = (n) => Number(n || 0).toLocaleString();

const hoursLabel = (h) => {
  if (h == null || Number.isNaN(h)) return "—";
  if (h < 1) return `${(h * 60).toFixed(0)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
};

const daysLabel = (d) => {
  if (d == null || Number.isNaN(d)) return "—";
  if (d < 1) return `${(d * 24).toFixed(1)} h`;
  return `${d.toFixed(1)} d`;
};

const pct = (n) => `${Number(n || 0).toFixed(1)}%`;

function StarRating({ value }) {
  if (value == null) return <span className="text-white/50">—</span>;
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span
      className="whitespace-nowrap font-medium"
      title={`${value.toFixed(1)} / 5.0`}
    >
      <span className="text-amber-300">
        {"★".repeat(full)}
        {half ? "½" : ""}
      </span>
      <span className="text-white/30">
        {"★".repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}
      </span>
      <span className="ml-1 text-xs text-white/70">
        ({value.toFixed(1)})
      </span>
    </span>
  );
}

function useReportData({ dateFilter, locater, brand }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));

    const params = {};
    if (dateFilter?.start && dateFilter?.end) {
      params.start = dateFilter.start;
      params.end = dateFilter.end;
    } else if (dateFilter?.month && dateFilter?.year) {
      params.month = dateFilter.month;
      params.year = dateFilter.year;
    }
    if (locater && locater !== "ALL") params.locater = locater;

    API.get("/reports/yard-locaters", { params })
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, error: "", data: res.data });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load Yard Locaters stats.";
        setState({ loading: false, error: msg, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [dateFilter?.start, dateFilter?.end, dateFilter?.month, dateFilter?.year, locater, brand]);

  return state;
}

const EXTRA_VIEWER_EMAILS = new Set(["50starsauto110@gmail.com"]);

export default function YardLocatersStats() {
  const brand = useBrand();
  const role = (
    (() => {
      try {
        const raw = localStorage.getItem("auth");
        if (raw) return JSON.parse(raw)?.user?.role || undefined;
      } catch {}
      return localStorage.getItem("role") || undefined;
    })() || ""
  ).trim();
  const permissions = useMemo(() => {
    try {
      const raw = localStorage.getItem("auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.user?.permissions)
          ? parsed.user.permissions
          : [];
      }
    } catch {}
    return [];
  }, []);
  const email = useMemo(() => {
    try {
      const raw = localStorage.getItem("auth");
      if (raw) return String(JSON.parse(raw)?.user?.email || "").trim().toLowerCase();
    } catch {}
    return String(localStorage.getItem("email") || "").trim().toLowerCase();
  }, []);

  const isAdmin = role.toLowerCase() === "admin";
  const hasYardLocatesPerm = userHasPermission(
    { permissions },
    USER_PERMISSIONS.YARD_LOCATES
  );
  const isAllowedEmail = EXTRA_VIEWER_EMAILS.has(email);
  const canAccess = isAdmin || hasYardLocatesPerm || isAllowedEmail;

  const [dateFilter, setDateFilter] = useState(() => currentMonthDateFilter());
  const [locater, setLocater] = useState("ALL");
  const [tab, setTab] = useState("locater"); // locater | month | yard
  const [search, setSearch] = useState("");

  const { loading, error, data } = useReportData({
    dateFilter,
    locater,
    brand,
  });

  const searchLower = search.trim().toLowerCase();
  const filteredByLocater = useMemo(() => {
    const rows = data?.byLocater || [];
    if (!searchLower) return rows;
    return rows.filter((r) =>
      String(r.locater || "").toLowerCase().includes(searchLower)
    );
  }, [data?.byLocater, searchLower]);

  const filteredByMonth = useMemo(() => {
    const rows = data?.byMonth || [];
    if (!searchLower) return rows;
    return rows.filter(
      (r) =>
        String(r.locater || "").toLowerCase().includes(searchLower) ||
        String(r.monthLabel || "").toLowerCase().includes(searchLower) ||
        String(r.monthKey || "").toLowerCase().includes(searchLower)
    );
  }, [data?.byMonth, searchLower]);

  const filteredByYard = useMemo(() => {
    const rows = data?.byYard || [];
    if (!searchLower) return rows;
    return rows.filter((r) =>
      String(r.yardName || "").toLowerCase().includes(searchLower)
    );
  }, [data?.byYard, searchLower]);

  if (!canAccess) {
    return (
      <div className="p-6 text-white">
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          This report is available only to Admins and users with the Yard
          Locates permission.
        </div>
      </div>
    );
  }

  const totals = data?.totals || null;
  const locaterOptions = data?.filters?.locaters || [];
  const rangeLabel = data?.dateRange
    ? `${data.dateRange.start} → ${data.dateRange.end}`
    : "";

  return (
    <div className="h-full p-4 sm:p-6 text-white">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Yard Locaters Stats</h1>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          >
            Refresh
          </button>
        </div>
        <p className="text-sm text-white/80">
          Invoice Signed (Customer Approved date) = day 0. Metrics track how
          fast a yard is located, how long it takes to ship, and how often POs
          are cancelled — broken down by locater, month, and yard.
          {data?.slaHoursLocate
            ? ` Delay threshold is ${data.slaHoursLocate}h.`
            : ""}
        </p>

        {/*
          Filters. IMPORTANT: no `backdrop-blur-*`, `transform`, or `z-index`
          on this wrapper. Any of those creates a stacking context that traps
          the `position: fixed` calendar popover — either below sibling
          sections or below the sidebar (which is z-40).
        */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-3">
          <div className="flex flex-col text-xs text-white/70">
            <span className="font-semibold uppercase tracking-wide">
              Locater
            </span>
            <select
              value={locater}
              onChange={(e) => setLocater(e.target.value)}
              className="mt-1 rounded-md border border-white/30 bg-[#2b2d68] px-3 py-1.5 text-sm text-white hover:bg-[#090c6c]"
            >
              <option value="ALL">All Locaters</option>
              {locaterOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col text-xs text-white/70">
            <span className="font-semibold uppercase tracking-wide">
              Date range
            </span>
            <div className="mt-1">
              <UnifiedDatePicker
                persistKey="yard_locaters_stats_range"
                syncIsoRange={dateFilter}
                onFilterChange={(filter) => setDateFilter(filter)}
              />
            </div>
          </div>

          {rangeLabel && (
            <div className="ml-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80">
              {rangeLabel}
            </div>
          )}

          <div className="ml-auto flex flex-col text-xs text-white/70">
            <span className="font-semibold uppercase tracking-wide">Search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "yard"
                  ? "Search yard name…"
                  : tab === "month"
                    ? "Search locater or month…"
                    : "Search locater…"
              }
              className="mt-1 w-64 rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/50 focus:border-white/60 focus:outline-none"
            />
          </div>
        </div>

        {loading && (
          <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm">
            Loading Yard Locaters stats…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-300/40 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              <StatCard label="Yards located" value={money(totals?.ordersLocated)} />
              <StatCard label="First locates" value={money(totals?.firstLocates)} />
              <StatCard label="Relocates (2nd+)" value={money(totals?.relocates)} />
              <StatCard
                label="Delayed locates"
                value={money(totals?.delayedLocates)}
                sub={`> ${data.slaHoursLocate}h`}
              />
              <StatCard label="PO cancels" value={money(totals?.poCancels)} />
              <StatCard label="Fulfilled" value={money(totals?.fulfilled)} />
              <StatCard
                label="Avg Invoice → Locate"
                value={hoursLabel(totals?.avgHoursFromInvoiceToLocate)}
              />
              <StatCard
                label="Avg Locate → Ship"
                value={daysLabel(totals?.avgDaysFromLocateToShip)}
              />
              <StatCard label="Ship rate" value={pct(totals?.shipRate)} />
              <StatCard label="Cancel rate" value={pct(totals?.cancelRate)} />
              <StatCard label="Fulfillment rate" value={pct(totals?.fulfillmentRate)} />
              <StatCard
                label="Muddy/Rusty/Damaged"
                value={money(
                  (totals?.poCancelByCategory?.muddy || 0) +
                    (totals?.poCancelByCategory?.rusty || 0) +
                    (totals?.poCancelByCategory?.damaged || 0)
                )}
              />
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 pt-2">
              <TabButton active={tab === "locater"} onClick={() => setTab("locater")}>
                By Locater
              </TabButton>
              <TabButton active={tab === "month"} onClick={() => setTab("month")}>
                By Month
              </TabButton>
              <TabButton active={tab === "yard"} onClick={() => setTab("yard")}>
                By Yard (ratings)
              </TabButton>
            </div>

            {tab === "locater" && (
              <LocaterTable rows={filteredByLocater} sla={data.slaHoursLocate} />
            )}
            {tab === "month" && (
              <MonthTable rows={filteredByMonth} sla={data.slaHoursLocate} />
            )}
            {tab === "yard" && <YardTable rows={filteredByYard} />}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
      <div className="text-xs uppercase tracking-wide text-white/60">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value ?? "—"}</div>
      {sub && <div className="text-[10px] text-white/50">{sub}</div>}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`rounded-full border px-4 py-1.5 text-sm transition ${
        active
          ? "border-white bg-white text-[#04356d] font-semibold"
          : "border-white/30 bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
}

function LocaterTable({ rows }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm">
        No matching locater rows.
      </div>
    );
  }
  return (
    <section className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/20 text-left">
              <Th>Locater</Th>
              <Th>Located</Th>
              <Th>First / Relocates</Th>
              <Th>Delayed</Th>
              <Th>PO Cancels</Th>
              <Th>Muddy/Rusty/Damaged</Th>
              <Th>Avg Invoice→Locate</Th>
              <Th>Avg Locate→Ship</Th>
              <Th>Ship %</Th>
              <Th>Cancel %</Th>
              <Th last>Fulfilled %</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.locater} className="border-b border-white/10">
                <Td className="font-medium">{r.locater}</Td>
                <Td>{money(r.ordersLocated)}</Td>
                <Td>
                  {money(r.firstLocates)} / {money(r.relocates)}
                </Td>
                <Td>{money(r.delayedLocates)}</Td>
                <Td>{money(r.poCancels)}</Td>
                <Td>
                  {money(
                    (r.poCancelByCategory?.muddy || 0) +
                      (r.poCancelByCategory?.rusty || 0) +
                      (r.poCancelByCategory?.damaged || 0)
                  )}
                </Td>
                <Td>{hoursLabel(r.avgHoursFromInvoiceToLocate)}</Td>
                <Td>{daysLabel(r.avgDaysFromLocateToShip)}</Td>
                <Td>{pct(r.shipRate)}</Td>
                <Td>{pct(r.cancelRate)}</Td>
                <Td last>{pct(r.fulfillmentRate)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MonthTable({ rows }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm">
        No matching monthly rows.
      </div>
    );
  }
  return (
    <section className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/20 text-left">
              <Th>Month</Th>
              <Th>Locater</Th>
              <Th>Located</Th>
              <Th>Relocates</Th>
              <Th>Delayed</Th>
              <Th>PO Cancels</Th>
              <Th>Avg Invoice→Locate</Th>
              <Th>Avg Locate→Ship</Th>
              <Th>Ship %</Th>
              <Th last>Fulfilled %</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.monthKey}-${r.locater}`} className="border-b border-white/10">
                <Td>{r.monthLabel}</Td>
                <Td className="font-medium">{r.locater}</Td>
                <Td>{money(r.ordersLocated)}</Td>
                <Td>{money(r.relocates)}</Td>
                <Td>{money(r.delayedLocates)}</Td>
                <Td>{money(r.poCancels)}</Td>
                <Td>{hoursLabel(r.avgHoursFromInvoiceToLocate)}</Td>
                <Td>{daysLabel(r.avgDaysFromLocateToShip)}</Td>
                <Td>{pct(r.shipRate)}</Td>
                <Td last>{pct(r.fulfillmentRate)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function YardTable({ rows }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm">
        No matching yard rows.
      </div>
    );
  }
  return (
    <section className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/20 text-left">
              <Th>Yard</Th>
              <Th>Orders</Th>
              <Th>Fulfilled</Th>
              <Th>PO Cancels</Th>
              <Th>Muddy</Th>
              <Th>Rusty</Th>
              <Th>Damaged</Th>
              <Th>Wrong Part</Th>
              <Th>Other</Th>
              <Th>Avg Locate→Ship</Th>
              <Th last>Rating</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.yardName} className="border-b border-white/10">
                <Td className="font-medium">{r.yardName}</Td>
                <Td>{money(r.ordersLocated)}</Td>
                <Td>{money(r.fulfilled)}</Td>
                <Td>{money(r.poCancels)}</Td>
                <Td>{money(r.poCancelByCategory?.muddy || 0)}</Td>
                <Td>{money(r.poCancelByCategory?.rusty || 0)}</Td>
                <Td>{money(r.poCancelByCategory?.damaged || 0)}</Td>
                <Td>{money(r.poCancelByCategory?.wrong_part || 0)}</Td>
                <Td>{money(r.poCancelByCategory?.other || 0)}</Td>
                <Td>{daysLabel(r.avgDaysFromLocateToShip)}</Td>
                <Td last>
                  <StarRating value={r.rating} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Column separators are applied via `border-r` on every cell except the last
 * one in each row (opt into `last` on `<Th>` / `<Td>`).
 */
function Th({ children, last = false }) {
  const border = last ? "" : "border-r border-white/15";
  return (
    <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/80 ${border}`}>
      {children}
    </th>
  );
}
function Td({ children, className = "", last = false }) {
  const border = last ? "" : "border-r border-white/10";
  return <td className={`px-3 py-2 ${border} ${className}`}>{children}</td>;
}
