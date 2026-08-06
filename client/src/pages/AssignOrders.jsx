import React, { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import moment from "moment-timezone";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import API from "../api";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";
import { isCommonTeam } from "../../../shared/constants/teams.js";
import { canAssignOrders } from "../../../shared/constants/assignOrdersAccess.js";
import { OPS_TEAMS } from "../../../shared/constants/opsTeams.js";

const toDallasPretty = (dateLike) => {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (isNaN(d)) return "";
  return formatInTimeZone(d, "America/Chicago", "do MMM, yyyy HH:mm");
};

const AssignOrders = () => {
  const brand = useBrand();
  const [orders, setOrders] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentFilter, setCurrentFilter] = useState(null);
  const [selectedTeamByOrder, setSelectedTeamByOrder] = useState({});
  const [assigningId, setAssigningId] = useState(null);
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("auth");
      const user = raw ? JSON.parse(raw)?.user : null;
      if (!canAssignOrders(user)) {
        setDenied(true);
        setLoading(false);
      }
    } catch {
      setDenied(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (denied) return;
    API.get("/teams")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        const opsNames = new Set(
          OPS_TEAMS.map((t) => String(t.teamName).toLowerCase())
        );
        const preferred = list.filter(
          (t) => t?.teamName && opsNames.has(String(t.teamName).toLowerCase())
        );
        // Fallback: any non-Common team that does not start with "Team "
        const fallback = list.filter(
          (t) =>
            t?.teamName &&
            !isCommonTeam(t.teamName) &&
            !/^team\s+/i.test(String(t.teamName).trim())
        );
        setTeams(preferred.length ? preferred : fallback);
      })
      .catch(() => setTeams([]));
  }, [denied]);

  const fetchOrders = async (filter = {}, options = {}) => {
    const { background = false } = options;
    try {
      if (!background) setLoading(true);
      let url;
      if (filter.start && filter.end) {
        const qPart = filter.q ? `&q=${encodeURIComponent(filter.q)}` : "";
        url = `/orders/assign?start=${filter.start}&end=${filter.end}${qPart}`;
      } else if (filter.month && filter.year) {
        const qPart = filter.q ? `&q=${encodeURIComponent(filter.q)}` : "";
        url = `/orders/assign?month=${filter.month}&year=${filter.year}${qPart}`;
      } else {
        const nowDallas = moment().tz("America/Chicago");
        const monthNames = [
          "Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ];
        const month = monthNames[nowDallas.month()];
        const year = nowDallas.year();
        const qPart = filter.q ? `&q=${encodeURIComponent(filter.q)}` : "";
        url = `/orders/assign?month=${month}&year=${year}${qPart}`;
        setCurrentFilter({ month, year });
      }
      const response = await API.get(url);
      setOrders(Array.isArray(response.data) ? response.data : []);
      setError("");
    } catch (err) {
      console.error(err);
      if (err?.response?.status === 403) {
        setDenied(true);
      } else if (!background) {
        setError("Failed to load orders awaiting assignment.");
      }
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    if (denied) return;
    const nowDallas = moment().tz("America/Chicago");
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const month = monthNames[nowDallas.month()];
    const year = nowDallas.year();
    setCurrentFilter({ month, year });
    fetchOrders({ month, year });
  }, [denied]);

  useEffect(() => {
    if (denied) return;
    const base = currentFilter || {};
    fetchOrders({ ...base, q: searchTerm.trim() || undefined });
  }, [brand]);

  useOrdersRealtime({
    enabled: !denied,
    onOrderCreated: () => {
      const base = currentFilter || {};
      fetchOrders({ ...base, q: searchTerm.trim() || undefined }, { background: true });
    },
    onOrderUpdated: () => {
      const base = currentFilter || {};
      fetchOrders({ ...base, q: searchTerm.trim() || undefined }, { background: true });
    },
  });

  const handleFilterChange = (filter) => {
    setCurrentFilter(filter);
    fetchOrders({ ...filter, q: searchTerm.trim() || undefined });
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const base = currentFilter || {};
    fetchOrders({ ...base, q: searchTerm.trim() || undefined });
  };

  const assignOrder = async (order) => {
    const team = selectedTeamByOrder[order._id] || "";
    if (!team || assigningId) return;
    setAssigningId(order._id);
    try {
      const { data } = await API.patch(
        `/orders/assign/${encodeURIComponent(order.orderNo)}`,
        { teamOrder: team }
      );
      const savedTeam = String(data?.teamOrder || team).trim();
      window.alert(`Order ${order.orderNo} assigned to ${savedTeam}.`);
      setOrders((prev) => prev.filter((o) => o._id !== order._id));
      setSelectedTeamByOrder((prev) => {
        const next = { ...prev };
        delete next[order._id];
        return next;
      });
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to assign order.");
    } finally {
      setAssigningId(null);
    }
  };

  if (denied) {
    return (
      <div className="p-6 text-white">
        <h1 className="text-2xl font-semibold mb-2">Assign Orders</h1>
        <p className="text-white/80">
          This page is only available to Admin and authorized emails.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Assign Orders</h1>
          <p className="text-white/70 text-sm mt-1">
            Placed orders waiting to be assigned to a team. After assignment they
            appear under Placed Orders for that team.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <UnifiedDatePicker onChange={handleFilterChange} />
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search...(press Enter)"
              className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 min-w-[240px]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  fetchOrders({ ...(currentFilter || {}), q: undefined });
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
              >
                ×
              </button>
            )}
            <input type="submit" hidden />
          </form>
        </div>
      </div>

      {loading ? (
        <div className="text-white/80">Loading…</div>
      ) : error ? (
        <div className="text-red-200">{error}</div>
      ) : orders.length === 0 ? (
        <div className="text-gray-200">No unassigned Placed orders in this period.</div>
      ) : (
        <div className="grid gap-5 justify-center grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {orders.map((order) => (
            <div
              key={order._id}
              className="w-[280px] bg-white/20 backdrop-blur-lg rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-5 border border-white/30"
            >
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-white/80">Order No</span>
                <span className="text-xs px-3 py-1 rounded-full bg-amber-400/40 text-amber-100">
                  Unassigned
                </span>
              </div>

              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">{order.orderNo}</h3>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(String(order.orderNo || ""));
                      setCopiedOrderId(order._id);
                      setTimeout(
                        () =>
                          setCopiedOrderId((prev) =>
                            prev === order._id ? null : prev
                          ),
                        1500
                      );
                    } catch (err) {
                      console.error("Failed to copy:", err);
                    }
                  }}
                  className="text-xs px-2 py-1 rounded-md border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition"
                >
                  {copiedOrderId === order._id ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="space-y-1 text-sm text-white/80 mb-3">
                <div>
                  <b>Date:</b> {toDallasPretty(order.orderDate)}
                </div>
                <div>
                  <b>Sales:</b> {order.salesAgent || "N/A"}
                </div>
                <div
                  className="truncate"
                  title={
                    order.customerName ||
                    `${order.fName || ""} ${order.lName || ""}`
                  }
                >
                  <b>Cust:</b>{" "}
                  {order.customerName ||
                    `${order.fName || ""} ${order.lName || ""}` ||
                    "N/A"}
                </div>
              </div>

              <label className="block text-xs text-white/70 mb-1">Assign to team</label>
              <select
                value={selectedTeamByOrder[order._id] || ""}
                onChange={(e) =>
                  setSelectedTeamByOrder((prev) => ({
                    ...prev,
                    [order._id]: e.target.value,
                  }))
                }
                className="w-full mb-2 rounded-md border border-white/30 bg-white text-slate-900 px-2 py-1.5 text-sm"
              >
                <option value="">Select team</option>
                {teams.map((t) => (
                  <option key={t._id || t.teamName} value={t.teamName}>
                    {t.teamName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedTeamByOrder[order._id] || assigningId === order._id}
                onClick={() => assignOrder(order)}
                className="w-full bg-gradient-to-r from-[#04356d] to-[#3b89bf] text-white font-medium px-2.5 py-1.5 rounded-md shadow hover:opacity-95 transition-all disabled:opacity-50"
              >
                {assigningId === order._id ? "Assigning…" : "Assign Team"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AssignOrders;
