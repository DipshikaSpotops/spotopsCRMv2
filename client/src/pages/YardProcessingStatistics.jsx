import { useEffect, useMemo, useState } from "react";
import moment from "moment-timezone";
import API from "../api";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import useBrand from "../hooks/useBrand";
import { readStoredAuth } from "../utils/authStorage";
import {
  USER_PERMISSIONS,
  userHasPermission,
} from "../../../shared/constants/userPermissions.js";

const REPORT_TZ = "America/Chicago";
const EXTRA_VIEWER_EMAILS = new Set(["50starsauto110@gmail.com"]);

function currentMonthDateFilter() {
  const now = moment.tz(REPORT_TZ);
  return {
    start: now.clone().startOf("month").utc().format(),
    end: now.clone().endOf("month").utc().format(),
  };
}

function readViewer() {
  const auth = readStoredAuth();
  const user = auth?.user || {};
  return {
    role: String(user?.role || localStorage.getItem("role") || "").trim(),
    email: String(user?.email || localStorage.getItem("email") || "").trim().toLowerCase(),
    team: String(user?.team || "").trim(),
    permissions: Array.isArray(user?.permissions) ? user.permissions : [],
  };
}

function useReportData({ dateFilter, team, brand }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: "" }));

    const params = {};
    if (dateFilter?.start && dateFilter?.end) {
      params.start = dateFilter.start;
      params.end = dateFilter.end;
    } else if (dateFilter?.month && dateFilter?.year) {
      params.month = dateFilter.month;
      params.year = dateFilter.year;
    }
    if (team && team !== "ALL") params.team = team;

    API.get("/orders/yardProcessingStatistics", { params })
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, error: "", data: res.data });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          error:
            err?.response?.data?.message ||
            err?.message ||
            "Failed to load Yard Processing statistics.",
          data: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [brand, dateFilter?.end, dateFilter?.month, dateFilter?.start, dateFilter?.year, team]);

  return state;
}

export default function YardProcessingStatistics() {
  const brand = useBrand();
  const viewer = useMemo(() => readViewer(), []);
  const isAdmin = viewer.role.toLowerCase() === "admin";
  const hasYardProcessingPermission = userHasPermission(
    { permissions: viewer.permissions },
    USER_PERMISSIONS.YARD_PROCESSING
  );
  const isSpecialViewer = EXTRA_VIEWER_EMAILS.has(viewer.email);
  const canAccess = isAdmin || hasYardProcessingPermission || isSpecialViewer;

  const [dateFilter, setDateFilter] = useState(() => currentMonthDateFilter());
  const [team, setTeam] = useState("ALL");

  const { loading, error, data } = useReportData({ dateFilter, team, brand });
  const canSeeAllTeams = Boolean(data?.scope?.canSeeAllTeams);
  const activeTeam = data?.filters?.activeTeam || "ALL";
  const teamOptions = data?.filters?.teams || [];

  useEffect(() => {
    if (!canSeeAllTeams) {
      setTeam("ALL");
    }
  }, [canSeeAllTeams]);

  if (!canAccess) {
    return (
      <div className="p-6 text-white">
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          This report is available only to Admin, 50starsauto110@gmail.com, or users with Yard Processing access.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-4 sm:p-6 text-white">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Yard Processing Statistics</h1>
            <p className="text-sm text-white/70">
              Team-wise yard processing status report for Mavericks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          >
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/20 bg-white/10 p-3">
          <div className="flex flex-col text-xs text-white/70">
            <span className="font-semibold uppercase tracking-wide">Date Range</span>
            <div className="mt-1">
              <UnifiedDatePicker
                persistKey="yard_processing_statistics_range"
                syncIsoRange={dateFilter}
                onFilterChange={(filter) => setDateFilter(filter)}
              />
            </div>
          </div>

          {canSeeAllTeams && (
            <div className="flex flex-col text-xs text-white/70">
              <span className="font-semibold uppercase tracking-wide">Team</span>
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="mt-1 rounded-md border border-white/30 bg-[#2b2d68] px-3 py-1.5 text-sm text-white hover:bg-[#090c6c]"
              >
                <option value="ALL">All Teams</option>
                {teamOptions.map((teamName) => (
                  <option key={teamName} value={teamName}>
                    {teamName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {data?.dateRange && (
            <div className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80">
              {data.dateRange.start} to {data.dateRange.end}
            </div>
          )}

          {!canSeeAllTeams && data?.scope?.viewerTeam && (
            <div className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
              Team scope: {data.scope.viewerTeam}
            </div>
          )}

          {canSeeAllTeams && activeTeam !== "ALL" && (
            <div className="rounded-full border border-blue-300/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-100">
              Filtered team: {activeTeam}
            </div>
          )}
        </div>

        {loading && (
          <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm">
            Loading Yard Processing statistics...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-300/40 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            <SummaryStrip totals={data.totals} />
            <div className="space-y-5">
              {data.teams.map((teamBlock) => (
                <TeamSection key={teamBlock.teamName} teamBlock={teamBlock} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryStrip({ totals }) {
  const cards = [
    ["No Of Orders", totals?.noOfOrders],
    ["Partial Payment", totals?.partialPayment],
    ["Delivered", totals?.delivered],
    ["Customer Approved", totals?.customerApproved],
    ["In Transit", totals?.inTransit],
    ["Yard Processing", totals?.yardProcessing],
    ["Cancellation", totals?.cancellation],
    ["Escalation", totals?.escalation],
    ["Disputes", totals?.disputes],
    ["Total", totals?.total],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-white/20 bg-white/10 p-3">
          <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
          <div className="mt-1 text-xl font-semibold">{Number(value || 0).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

function TeamSection({ teamBlock }) {
  return (
    <section className="rounded-2xl border border-white/20 bg-white/10">
      <div className="border-b border-white/15 px-4 py-3">
        <h2 className="text-lg font-semibold">{teamBlock.teamName}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#d9e6c3] text-[#233b18]">
              <Th>Name</Th>
              <Th>No Of Orders</Th>
              <Th>Partial Payment</Th>
              <Th>Delivered</Th>
              <Th>Customer Approved</Th>
              <Th>In Transit</Th>
              <Th>Yard Processing</Th>
              <Th>Cancellation</Th>
              <Th>Escalation</Th>
              <Th>Disputes</Th>
              <Th last>Total</Th>
            </tr>
          </thead>
          <tbody>
            {teamBlock.rows.map((row, idx) => (
              <tr
                key={`${teamBlock.teamName}-${row.memberName}`}
                className={idx % 2 === 0 ? "bg-white/5" : "bg-white/[0.08]"}
              >
                <Td className="font-medium">{row.memberName}</Td>
                <Td>{count(row.noOfOrders)}</Td>
                <Td>{count(row.partialPayment)}</Td>
                <Td>{count(row.delivered)}</Td>
                <Td>{count(row.customerApproved)}</Td>
                <Td>{count(row.inTransit)}</Td>
                <Td>{count(row.yardProcessing)}</Td>
                <Td>{count(row.cancellation)}</Td>
                <Td>{count(row.escalation)}</Td>
                <Td>{count(row.disputes)}</Td>
                <Td last className="font-semibold">{count(row.total)}</Td>
              </tr>
            ))}
            <tr className="bg-[#8ec564] font-semibold text-[#14310b]">
              <Td>Total</Td>
              <Td>{count(teamBlock.totals?.noOfOrders)}</Td>
              <Td>{count(teamBlock.totals?.partialPayment)}</Td>
              <Td>{count(teamBlock.totals?.delivered)}</Td>
              <Td>{count(teamBlock.totals?.customerApproved)}</Td>
              <Td>{count(teamBlock.totals?.inTransit)}</Td>
              <Td>{count(teamBlock.totals?.yardProcessing)}</Td>
              <Td>{count(teamBlock.totals?.cancellation)}</Td>
              <Td>{count(teamBlock.totals?.escalation)}</Td>
              <Td>{count(teamBlock.totals?.disputes)}</Td>
              <Td last>{count(teamBlock.totals?.total)}</Td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function count(value) {
  return Number(value || 0).toLocaleString();
}

function Th({ children, last = false }) {
  const border = last ? "" : "border-r border-[#8cab77]";
  return (
    <th className={`whitespace-nowrap px-3 py-2 text-center text-xs font-semibold ${border}`}>
      {children}
    </th>
  );
}

function Td({ children, className = "", last = false }) {
  const border = last ? "" : "border-r border-white/10";
  return <td className={`px-3 py-2 text-center ${border} ${className}`}>{children}</td>;
}
