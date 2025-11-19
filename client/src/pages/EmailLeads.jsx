import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import API from "../api";
import AgentDropdown from "../components/AgentDropdown";

function readAuthFromStorage() {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        role: parsed?.user?.role || localStorage.getItem("role") || undefined,
        email: parsed?.user?.email || localStorage.getItem("email") || undefined,
        name: parsed?.user?.firstName || parsed?.user?.lastName ? `${parsed?.user?.firstName ?? ""} ${parsed?.user?.lastName ?? ""}`.trim() : undefined,
      };
    }
  } catch (err) {
    console.warn("Failed to parse auth storage", err);
  }
  return {
    role: localStorage.getItem("role") || undefined,
    email: localStorage.getItem("email") || undefined,
    name: localStorage.getItem("username") || undefined,
  };
}

const LIMIT_OPTIONS = [25, 50, 100, 150, 200];

function formatDate(dt) {
  if (!dt) return "—";
  try {
    return formatInTimeZone(new Date(dt), "America/Chicago", "MMM dd, yyyy HH:mm");
  } catch {
    return "—";
  }
}

export default function EmailLeads() {
  const { role, email, name, firstName } = useMemo(() => {
    const auth = readAuthFromStorage();
    try {
      const raw = localStorage.getItem("auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...auth,
          firstName: parsed?.user?.firstName || auth.name?.split(" ")[0] || "",
        };
      }
    } catch {}
    return { ...auth, firstName: auth.name?.split(" ")[0] || "" };
  }, []);
  const isSales = role === "Sales";
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("All");
  const [limit, setLimit] = useState(50);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [claimingId, setClaimingId] = useState(null);

  const normalizedEmail = email?.toLowerCase();

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { limit };
      if (isSales && normalizedEmail) {
        params.agentEmail = normalizedEmail;
      }
      const { data } = await API.get("/gmail/messages", { params });
      setMessages(data?.messages || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[EmailLeads] fetch error", err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load Gmail leads.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isSales, normalizedEmail, limit]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // SSE for live updates
  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, "") || "http://localhost:5000";
    const es = new EventSource(`${base}/events`);
    
    es.addEventListener("gmail", () => {
      fetchMessages();
    });
    
    es.addEventListener("error", () => {
      try { es?.close(); } catch {}
      setTimeout(() => {
        const newEs = new EventSource(`${base}/events`);
        newEs.addEventListener("gmail", () => fetchMessages());
        newEs.addEventListener("error", () => {});
      }, 3000);
    });

    return () => {
      try { es?.close(); } catch {}
    };
  }, [fetchMessages]);

  const handleClaim = async (msg) => {
    if (!msg._id || msg.status === "claimed") return;
    setClaimingId(msg._id);
    setError("");
    try {
      const { data } = await API.post(`/gmail/messages/${msg._id}/claim-and-view`);
      setMessages((prev) =>
        prev.map((m) => (m._id === msg._id ? { ...m, ...data } : m))
      );
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to claim message.";
      setError(message);
      if (err?.response?.status === 409) {
        // Already claimed, refresh to get updated data
        fetchMessages();
      }
    } finally {
      setClaimingId(null);
    }
  };

  const agentOptions = useMemo(() => {
    const opts = ["Select", "All"];
    const set = new Set();
    messages.forEach((msg) => {
      if (msg.agentEmail) {
        set.add(msg.agentEmail.toLowerCase());
      }
    });
    const sorted = Array.from(set).sort();
    return [...opts, ...sorted];
  }, [messages]);

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      const matchesAgent =
        isSales ||
        agentFilter === "Select" ||
        agentFilter === "All" ||
        (agentFilter === "Unassigned" && !msg.agentEmail) ||
        msg.agentEmail?.toLowerCase() === agentFilter?.toLowerCase();

      if (!matchesAgent) return false;

      if (!search.trim()) return true;
      const haystack = `${msg.subject ?? ""} ${msg.from ?? ""} ${
        msg.snippet ?? ""
      }`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [messages, agentFilter, search, isSales]);

  const summary = useMemo(() => {
    const byAgent = {};
    filteredMessages.forEach((msg) => {
      const key = msg.agentEmail?.toLowerCase() || "unassigned";
      byAgent[key] = (byAgent[key] || 0) + 1;
    });
    return {
      total: filteredMessages.length,
      myTotal: filteredMessages.filter(
        (msg) => msg.agentEmail?.toLowerCase() === normalizedEmail
      ).length,
      byAgent,
    };
  }, [filteredMessages, normalizedEmail]);

  const lastUpdatedLabel = lastUpdated
    ? `${formatDistanceToNow(lastUpdated, { addSuffix: true })}`
    : "n/a";

  const handleAgentFilterChange = (event) => {
    setAgentFilter(event.target.value);
  };

  const handleLimitChange = (event) => {
    setLimit(Number(event.target.value));
  };

  return (
    <div className="min-h-screen p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white underline decoration-1">Email Leads</h1>
          <p className="text-sm text-white/70">
            Live Gmail messages streaming in from Google Pub/Sub for incentive tracking.
            {lastUpdated && (
              <> Last updated: <strong>{lastUpdatedLabel}</strong></>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={fetchMessages}
            className="px-3 py-2 rounded-lg bg-[#2c5d81] hover:bg-blue-700 text-white text-sm disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {role && (
        <div className="mb-4 rounded-lg border border-white/20 bg-white/10 backdrop-blur-md p-4 shadow-sm">
          <p className="text-sm text-white/90">
            Signed in as <span className="font-medium">{name || email || "Unknown user"}</span>{" "}
            ({role} role)
          </p>
          {isSales && !normalizedEmail && (
            <p className="mt-2 text-sm text-amber-300">
              We couldn't detect your email address. Please update your user profile so Gmail leads can be filtered correctly.
            </p>
          )}
        </div>
      )}

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Total messages"
          value={summary.total}
          subtitle="Filtered by search/agent"
        />
        <SummaryCard
          title={isSales ? "My leads" : "Assigned leads"}
          value={
            isSales
              ? summary.myTotal
              : summary.total - (summary.byAgent["unassigned"] || 0)
          }
          subtitle={isSales ? "Linked to your inbox" : "Any message with an agent"}
        />
        <SummaryCard
          title="Unassigned"
          value={summary.byAgent["unassigned"] || 0}
          subtitle="No matching sales agent"
        />
      </section>

      <section className="mb-6 rounded-lg border border-white/20 bg-white/10 backdrop-blur-md p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {!isSales && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-white/90 whitespace-nowrap">Agent:</label>
              <AgentDropdown
                options={agentOptions}
                value={agentFilter}
                onChange={setAgentFilter}
              />
            </div>
          )}

          {!isSales && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-white/90 whitespace-nowrap">Max messages:</label>
              <select
                className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30 text-sm"
                value={limit}
                onChange={handleLimitChange}
              >
                {LIMIT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} className="bg-[#0f1b2a] text-white">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
            className="flex-1"
          >
            <input
              type="search"
              placeholder="Search subject, sender, or snippet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
              }}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 px-3 py-2 outline-none focus:ring-2 focus:ring-white/30"
            />
          </form>
        </div>
      </section>

      <section className="hidden md:block max-h-[76vh] overflow-y-auto overflow-x-auto rounded-xl ring-1 ring-white/10 shadow
                   scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
        {error && (
          <div className="border-b border-red-500/30 bg-red-900/40 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        <table className="min-w-[1200px] w-full bg-black/20 backdrop-blur-md text-white">
          <thead className="sticky top-0 bg-[#5c8bc1] z-20 text-black">
            <tr>
              <Th>Received</Th>
              <Th>Subject</Th>
              <Th>From</Th>
              <Th>Snippet</Th>
              <Th>Agent</Th>
              <Th>Status</Th>
              <Th>Labels</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-white/80">
                  ⏳ Loading messages...
                </td>
              </tr>
            ) : filteredMessages.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-white/80">
                  No Gmail messages match this filter yet.
                </td>
              </tr>
            ) : (
              filteredMessages.map((msg) => (
                <tr key={msg._id || msg.messageId} className="transition text-sm even:bg-white/5 odd:bg-white/10 hover:bg-white/20">
                  <Td className="whitespace-nowrap">
                    <div className="font-medium text-white">
                      {msg.internalDate
                        ? formatDate(msg.internalDate)
                        : "—"}
                    </div>
                    <div className="text-xs text-white/60">
                      {msg.internalDate
                        ? formatDistanceToNow(new Date(msg.internalDate), {
                            addSuffix: true,
                          })
                        : ""}
                    </div>
                  </Td>
                  <Td className="max-w-xs break-words">
                    <div className="font-medium text-white">
                      {msg.subject || "(no subject)"}
                    </div>
                    <div className="text-xs text-white/60">{msg.threadId}</div>
                  </Td>
                  <Td className="max-w-xs break-words text-white/90">{msg.from || "—"}</Td>
                  <Td className="max-w-xs break-words text-white/80">
                    {msg.snippet || "—"}
                  </Td>
                  <Td>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        msg.agentEmail
                          ? "bg-emerald-500/30 text-emerald-200"
                          : "bg-slate-600/50 text-slate-200"
                      }`}
                    >
                      {msg.agentEmail || "Unassigned"}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        msg.status === "claimed"
                          ? "bg-blue-500/30 text-blue-200"
                          : msg.status === "closed"
                          ? "bg-gray-500/30 text-gray-200"
                          : "bg-green-500/30 text-green-200"
                      }`}
                    >
                      {msg.status || "active"}
                    </span>
                  </Td>
                  <Td>
                    {msg.labels && msg.labels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {msg.labels.slice(0, 2).map((label, idx) => (
                          <span
                            key={idx}
                            className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-purple-500/30 text-purple-200"
                          >
                            {label}
                          </span>
                        ))}
                        {msg.labels.length > 2 && (
                          <span className="text-xs text-white/60">+{msg.labels.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-white/60">—</span>
                    )}
                  </Td>
                  <Td>
                    {msg.status === "active" ? (
                      <button
                        onClick={() => handleClaim(msg)}
                        disabled={claimingId === msg._id}
                        className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white"
                      >
                        {claimingId === msg._id ? "Claiming..." : "Claim"}
                      </button>
                    ) : msg.claimedByName ? (
                      <span className="text-xs text-white/70">Claimed by {msg.claimedByName}</span>
                    ) : (
                      <span className="text-xs text-white/60">{msg.status}</span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SummaryCard({ title, value, subtitle }) {
  return (
    <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-md p-4 shadow-sm">
      <p className="text-sm text-white/70">{title}</p>
      <div className="mt-2 text-3xl font-semibold text-white">
        {value}
      </div>
      {subtitle && (
        <p className="mt-1 text-xs text-white/60">{subtitle}</p>
      )}
    </div>
  );
}

function Th({ children }) {
  return (
    <th
      scope="col"
      className="p-3 text-left border-r border-white/30 whitespace-nowrap"
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }) {
  return <td className={`p-2.5 border-r border-white/20 align-top ${className}`}>{children}</td>;
}

