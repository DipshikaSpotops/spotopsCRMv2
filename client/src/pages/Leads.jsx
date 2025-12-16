import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import API from "../api";
import AgentDropdown from "../components/AgentDropdown";
import UnifiedDatePicker from "../components/UnifiedDatePicker";

function readAuthFromStorage() {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        role: parsed?.user?.role || localStorage.getItem("role") || undefined,
        email: parsed?.user?.email || localStorage.getItem("email") || undefined,
        name: parsed?.user?.firstName || parsed?.user?.lastName ? `${parsed?.user?.firstName ?? ""} ${parsed?.user?.lastName ?? ""}`.trim() : undefined,
        firstName: parsed?.user?.firstName || undefined,
      };
    }
  } catch (err) {
    console.warn("Failed to parse auth storage", err);
  }
  return {
    role: localStorage.getItem("role") || undefined,
    email: localStorage.getItem("email") || undefined,
    name: localStorage.getItem("username") || undefined,
    firstName: undefined,
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

// Label aliases for parsing
const LABEL_ALIASES = new Map([
  ["year", "Year"],
  ["make and model", "Make and Model"],
  ["make & model", "Make and Model"],
  ["part required", "Part Required"],
  ["full name", "Full Name"],
  ["email address", "Email Address"],
  ["email", "Email Address"],
  ["telephone", "Telephone"],
  ["phone", "Telephone"],
  ["mf-gdpr-consent", "mf-gdpr-consent"],
  ["gdpr consent", "mf-gdpr-consent"],
]);

// Extract key-value pairs from HTML
function extractKV(html) {
  if (!html) return [];
  
  let doc;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return [];
  }

  const rows = [];

  // 1) Handle tables: collect row text
  for (const tr of doc.querySelectorAll("tr")) {
    const cells = [...tr.querySelectorAll("th,td")].map((el) => cleanText(el.textContent));
    const text = cells.filter(Boolean).join(" ").trim();
    if (text) rows.push(text);
  }

  // 2) If no rows, fall back to generic blocks
  if (rows.length === 0) {
    for (const el of doc.querySelectorAll("p,div,span,li")) {
      const t = cleanText(el.textContent);
      if (t) rows.push(t);
    }
  }

  // Build tokens: split rows on ":" to catch "Label: Value"
  const tokens = [];
  for (const r of rows) {
    const m = r.match(/^\s*([^:]+)\s*:\s*(.+)$/);
    if (m) {
      tokens.push({ type: "label", text: m[1] });
      tokens.push({ type: "value", text: m[2] });
    } else {
      tokens.push({ type: "raw", text: r });
    }
  }

  // Pair up label/value
  const out = [];
  const seen = new Set();

  function normLabel(s) {
    return s.toLowerCase().replace(/\s+/g, " ").replace(/\s*:\s*$/, "").trim();
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Explicit "Label: Value"
    if (t.type === "label" && tokens[i + 1]?.type === "value") {
      const key = normLabel(t.text);
      const final = LABEL_ALIASES.get(key);
      if (final && !seen.has(final)) {
        out.push({ label: final, value: tokens[i + 1].text, kind: kindOf(final) });
        seen.add(final);
      }
      i++;
      continue;
    }

    // Row-by-row: label then next non-label row as value
    if (t.type === "raw") {
      const key = normLabel(t.text);
      const final = LABEL_ALIASES.get(key);
      if (final && !seen.has(final)) {
        let j = i + 1;
        while (j < tokens.length && !tokens[j].text) j++;
        const vtok = tokens[j];
        if (vtok) {
          out.push({ label: final, value: vtok.text, kind: kindOf(final) });
          seen.add(final);
          i = j;
        }
      }
    }
  }

  return out;
}

function kindOf(label) {
  const l = label.toLowerCase();
  if (l.includes("email")) return "email";
  if (l.includes("telephone") || l.includes("phone")) return "tel";
  return "text";
}

function cleanText(s = "") {
  return s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export default function Leads() {
  const { role, email, name, firstName } = useMemo(() => {
    return readAuthFromStorage();
  }, []);
  
  // Only allow Admin and Sales roles to access this page
  const isAdmin = role === "Admin";
  const isSales = role === "Sales";
  const isAuthorized = isAdmin || isSales;
  
  // Show unauthorized message if user doesn't have access
  if (!isAuthorized) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h1>
          <p className="text-white/70">
            This page is only accessible to Admin and Sales roles.
          </p>
          <p className="text-white/50 mt-2">Your current role: {role || "Not set"}</p>
        </div>
      </div>
    );
  }
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("All");
  const [limit, setLimit] = useState(50);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [claimingId, setClaimingId] = useState(null);
  const [labels, setLabels] = useState(["Charlie", "David", "John", "Mark", "Richard", "Quoted", "Already Purchased", "Left voicemail"]);
  const [updatingLabels, setUpdatingLabels] = useState(false);
  const labelsDropdownRef = useRef(null);
  const [showLabelsDropdown, setShowLabelsDropdown] = useState(false);
  const [labelSearch, setLabelSearch] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [sourceEmail, setSourceEmail] = useState("");
  const [viewMode, setViewMode] = useState("leads"); // "leads" or "statistics"
  const [statistics, setStatistics] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [dateFilter, setDateFilter] = useState(() => {
    // Default to 30 days ago to today
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  });
  const [selectedAgentForStats, setSelectedAgentForStats] = useState(null);

  const normalizedEmail = email?.toLowerCase();

  const [syncing, setSyncing] = useState(false);

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const params = { limit };
      if (isSales && normalizedEmail) {
        params.agentEmail = normalizedEmail;
      }
      const { data } = await API.get("/gmail/messages", { params });
      const newMessages = data?.messages || [];
      
      if (silent) {
        // Silent update: only append new messages without showing loading
        setMessages((prevMessages) => {
          const existingIds = new Set(prevMessages.map(m => m._id || m.messageId));
          const newOnes = newMessages.filter(m => !existingIds.has(m._id || m.messageId));
          
          if (newOnes.length > 0) {
            // New messages found, prepend them
            return [...newOnes, ...prevMessages];
          }
          
          // No new messages, but update existing ones in case status changed
          const updatedMap = new Map(newMessages.map(m => [m._id || m.messageId, m]));
          return prevMessages.map(m => updatedMap.get(m._id || m.messageId) || m);
        });
      } else {
        setMessages(newMessages);
      }
      setLastUpdated(new Date());
    } catch (err) {
      if (!silent) {
        console.error("[Leads] fetch error", err);
        const message =
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load leads.";
        setError(message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [isSales, normalizedEmail, limit]);

  const syncGmail = useCallback(async () => {
    setSyncing(true);
    setError("");
    try {
      console.log("[Leads] Starting Gmail sync...");
      const { data } = await API.post("/gmail/sync");
      console.log("[Leads] Sync completed:", data);
      // Refresh messages after sync
      setTimeout(() => {
        fetchMessages();
      }, 1000);
    } catch (err) {
      console.error("[Leads] sync error", err);
      const errorData = err?.response?.data;
      
      // Check if it's a token issue (Gmail OAuth token, not user auth)
      if (errorData?.errorCode === "GMAIL_TOKEN_INVALID" ||
          errorData?.error === "Invalid token. Re-authorization required." || 
          errorData?.message?.includes("re-authorize") ||
          errorData?.message?.includes("invalid_grant") ||
          (err?.response?.status === 400 && errorData?.message?.includes("Gmail token"))) {
        const message = errorData?.message || "Gmail token is invalid. Please re-authorize.";
        const helpUrl = errorData?.help || "http://localhost:5000/api/gmail/oauth2/url";
        setError(
          <div>
            <p className="font-semibold mb-2">{message}</p>
            <p className="text-sm mb-2">To fix this:</p>
            <ol className="list-decimal list-inside text-sm space-y-1 mb-2">
              <li>Open: <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">{helpUrl}</a></li>
              <li>Click "Authorize Gmail Access"</li>
              <li>Sign in and grant permissions</li>
              <li>Then try syncing again</li>
            </ol>
          </div>
        );
      } else {
        const message =
          errorData?.message ||
          err?.message ||
          "Failed to sync Gmail.";
        setError(message);
      }
    } finally {
      setSyncing(false);
    }
  }, [fetchMessages]);

  const fetchMessageDetail = useCallback(async (messageId) => {
    if (!messageId) {
      console.log("[Leads] No messageId provided to fetchMessageDetail");
      return;
    }
    setLoadingDetail(true);
    setError("");
    try {
      console.log("[Leads] Fetching message detail for:", messageId);
      const { data } = await API.get(`/gmail/messages/${messageId}`);
      console.log("[Leads] Message detail received:", data);
      if (data) {
        setSelectedMessage(data);
      } else {
        console.warn("[Leads] No data received from fetchMessageDetail");
      }
    } catch (err) {
      console.error("[Leads] fetch detail error", err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load lead details.";
      setError(message);
      // If error is 403 (not claimed), show helpful message
      if (err?.response?.status === 403) {
        setError("Please claim this lead first to view details.");
      }
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const fetchStatistics = useCallback(async () => {
    setLoadingStats(true);
    setError("");
    try {
      const params = {};
      if (dateFilter?.start) {
        // UnifiedDatePicker sends UTC ISO strings representing Dallas day boundaries
        // Extract the date part (YYYY-MM-DD) from the UTC ISO string
        // The UTC string represents the start of day in Dallas timezone
        const startDateStr = dateFilter.start.split("T")[0]; // Extract YYYY-MM-DD
        params.startDate = startDateStr;
      }
      if (dateFilter?.end) {
        // Extract the date part (YYYY-MM-DD) from the UTC ISO string
        const endDateStr = dateFilter.end.split("T")[0]; // Extract YYYY-MM-DD
        params.endDate = endDateStr;
      }
      // Use selectedAgentForStats if set, otherwise use sales user's email
      if (selectedAgentForStats && selectedAgentForStats !== "All") {
        params.agentEmail = selectedAgentForStats;
      } else if (isSales && normalizedEmail) {
        params.agentEmail = normalizedEmail;
      }
      console.log("[Leads] Fetching statistics with params:", params);
      console.log("[Leads] Selected agent for stats:", selectedAgentForStats);
      const { data } = await API.get("/gmail/statistics/daily", { params });
      console.log("[Leads] Statistics response:", data);
      setStatistics(data);
    } catch (err) {
      console.error("[Leads] fetch statistics error", err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load statistics.";
      setError(message);
    } finally {
      setLoadingStats(false);
    }
  }, [dateFilter, isSales, normalizedEmail, email, selectedAgentForStats]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (viewMode === "statistics") {
      fetchStatistics();
    }
  }, [viewMode, fetchStatistics]);

  // Fetch the source email address - try API first, then messages
  useEffect(() => {
    // Skip if already set
    if (sourceEmail) {
      console.log("[Leads] sourceEmail already set:", sourceEmail);
      return;
    }
    
    const fetchSourceEmail = async () => {
      // First try API
      try {
        const { data } = await API.get("/gmail/state");
        console.log("[Leads] Gmail state API response:", JSON.stringify(data, null, 2));
        // Try multiple possible fields for email
        const email = data?.configuredEmail || data?.email || data?.userEmail || data?.state?.userEmail;
        if (email) {
          console.log("[Leads] ✅ Setting sourceEmail:", email);
          setSourceEmail(email);
          return;
        }
        console.log("[Leads] ⚠️ No email in API response. Data keys:", Object.keys(data || {}));
      } catch (err) {
        console.error("[Leads] ❌ Failed to fetch source email from API:", err);
        console.error("[Leads] Error details:", err.response?.data || err.message);
      }
      
      // Fallback: Try to get from messages
      if (messages.length > 0) {
        console.log("[Leads] Checking messages for userEmail. Total messages:", messages.length);
        const msgWithEmail = messages.find(m => {
          const email = m.userEmail;
          const hasEmail = email && String(email).trim() && String(email).trim() !== "";
          if (hasEmail) {
            console.log("[Leads] Found message with userEmail:", email);
          }
          return hasEmail;
        });
        
        if (msgWithEmail?.userEmail) {
          const email = String(msgWithEmail.userEmail).trim();
          console.log("[Leads] ✅ Setting sourceEmail from message userEmail:", email);
          setSourceEmail(email);
        } else {
          console.log("[Leads] ⚠️ No userEmail found in any messages. Sample message:", {
            _id: messages[0]?._id,
            subject: messages[0]?.subject,
            userEmail: messages[0]?.userEmail,
            agentEmail: messages[0]?.agentEmail,
            hasUserEmail: !!messages[0]?.userEmail,
            allKeys: messages[0] ? Object.keys(messages[0]) : [],
          });
        }
      } else {
        console.log("[Leads] No messages loaded yet, will retry when messages load");
      }
    };
    
    fetchSourceEmail();
  }, [messages, sourceEmail]);

  // SSE for live updates
  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, "") || "http://localhost:5000";
    const es = new EventSource(`${base}/events`);
    
    es.addEventListener("gmail", () => {
      fetchMessages(true); // Silent fetch - no loading state
    });
    
    es.addEventListener("error", () => {
      try { es?.close(); } catch {}
      setTimeout(() => {
        const newEs = new EventSource(`${base}/events`);
        newEs.addEventListener("gmail", () => fetchMessages(true)); // Silent fetch
        newEs.addEventListener("error", () => {});
      }, 3000);
    });

    return () => {
      try { es?.close(); } catch {}
    };
  }, [fetchMessages]);

  // Auto-refresh leads every 10 seconds (silent update)
  useEffect(() => {
    if (viewMode !== "leads") return; // Only poll when in leads view
    
    const interval = setInterval(() => {
      fetchMessages(true); // Silent fetch - no loading state
    }, 10000); // 10 seconds

    return () => {
      clearInterval(interval);
    };
  }, [fetchMessages, viewMode]);

  const handleClaim = async (msg) => {
    // Can claim using either _id or messageId
    const claimId = msg._id || msg.messageId;
    if (!claimId || msg.status === "claimed") return;
    
    setClaimingId(claimId);
    setError("");
    try {
      console.log("[Leads] Claiming message:", claimId);
      const { data } = await API.post(`/gmail/messages/${claimId}/claim-and-view`);
      console.log("[Leads] Claim response:", data);
      
      // Update messages list with the claimed status
      setMessages((prev) =>
        prev.map((m) => {
          if (m._id === msg._id || m.messageId === msg.messageId) {
            return { ...m, ...data, status: "claimed" };
          }
          return m;
        })
      );
      
      // Fetch full details immediately after claiming
      // Use the _id from the response (which is the database _id)
      const messageIdToFetch = data._id || data.messageId || msg._id;
      console.log("[Leads] Fetching details for claimed message:", messageIdToFetch);
      
      // Wait a moment for database to be updated, then fetch details
      setTimeout(async () => {
        try {
          await fetchMessageDetail(messageIdToFetch);
        } catch (fetchErr) {
          console.error("[Leads] Failed to fetch details after claim:", fetchErr);
          // If fetch fails, try refreshing messages
          fetchMessages();
        }
      }, 500);
      
    } catch (err) {
      console.error("[Leads] Claim error:", err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to claim lead.";
      setError(message);
      if (err?.response?.status === 409) {
        fetchMessages();
      }
    } finally {
      setClaimingId(null);
    }
  };

  const handleViewLead = async (msg) => {
    // Allow viewing if message is claimed or closed (closed leads can be viewed from statistics)
    if (msg.status !== "claimed" && msg.status !== "closed") {
      setError("Please claim this lead first to view details.");
      return;
    }
    // Switch to leads view to show details panel
    setViewMode("leads");
    await fetchMessageDetail(msg._id);
  };

  const handleUpdateLabels = async (messageId, newLabels) => {
    if (!messageId) return;
    setUpdatingLabels(true);
    try {
      const { data } = await API.patch(`/gmail/messages/${messageId}/labels`, {
        labels: newLabels,
      });
      setSelectedMessage((prev) => (prev?._id === messageId ? { ...prev, ...data } : prev));
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, ...data } : m))
      );
    } catch (err) {
      console.error("[Leads] update labels error", err);
      setError(err?.response?.data?.message || "Failed to update labels");
    } finally {
      setUpdatingLabels(false);
    }
  };

  const [closingId, setClosingId] = useState(null);

  const handleCloseLead = async (messageId) => {
    if (!messageId) return;A
    setClosingId(messageId);
    setError("");
    try {
      const { data } = await API.patch(`/gmail/messages/${messageId}/close`);
      // Hide the details panel when lead is closed
      setSelectedMessage(null);
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, ...data } : m))
      );
      // Refresh messages to show closed leads in the list
      fetchMessages();
    } catch (err) {
      console.error("[Leads] close lead error", err);
      setError(err?.response?.data?.message || "Failed to close lead");
    } finally {
      setClosingId(null);
    }
  };


  const handleToggleLabel = (label) => {
    if (!selectedMessage?._id) return;
    const currentLabels = selectedMessage.labels || [];
    const set = new Set(currentLabels);
    if (set.has(label)) {
      set.delete(label);
    } else {
      set.add(label);
    }
    handleUpdateLabels(selectedMessage._id, [...set]);
  };

  const handleAddNewLabel = () => {
    const val = newLabel.trim();
    if (!val || !selectedMessage?._id) return;
    if (!labels.includes(val)) {
      setLabels((prev) => [...prev, val]);
    }
    const currentLabels = selectedMessage.labels || [];
    const set = new Set([...currentLabels, val]);
    handleUpdateLabels(selectedMessage._id, [...set]);
    setNewLabel("");
    setLabelSearch("");
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

  // Get agent options from statistics if available
  const statsAgentOptions = useMemo(() => {
    if (!statistics?.agentStats) return ["All"];
    const opts = ["All"];
    const emails = statistics.agentStats.map(a => a.agentEmail?.toLowerCase()).filter(Boolean);
    return [...opts, ...new Set(emails)].sort();
  }, [statistics]);

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

  const parsedFields = useMemo(() => {
    if (!selectedMessage?.bodyHtml) return [];
    return extractKV(selectedMessage.bodyHtml);
  }, [selectedMessage?.bodyHtml]);

  // Close labels dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (labelsDropdownRef.current && !labelsDropdownRef.current.contains(event.target)) {
        setShowLabelsDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredLabelOptions = useMemo(() => {
    const needle = labelSearch.trim().toLowerCase();
    return needle
      ? labels.filter((l) => l.toLowerCase().includes(needle))
      : labels;
  }, [labels, labelSearch]);

  const lastUpdatedLabel = lastUpdated
    ? `${formatDistanceToNow(lastUpdated, { addSuffix: true })}`
    : "n/a";

  return (
    <div className="min-h-screen p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white underline decoration-1">Leads</h1>
          <p className="text-sm text-white/70">
            Gmail leads with parsed form data.
            {lastUpdated && viewMode === "leads" && (
              <> Last updated: <strong>{lastUpdatedLabel}</strong></>
            )}
          </p>
          {sourceEmail ? (
            <p className="text-sm text-white/80 mt-1">
              📧 Receiving leads from: <strong className="text-blue-300 font-semibold">{sourceEmail}</strong>
            </p>
          ) : (
            <p className="text-sm text-yellow-300/80 mt-1">
              ⚠️ Gmail source email not configured. Check backend environment variables.
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex rounded-lg border border-white/20 bg-white/10 p-1">
            <button
              onClick={() => setViewMode("leads")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                viewMode === "leads"
                  ? "bg-blue-600 text-white"
                  : "text-white/70 hover:text-white"
              }`}
            >
              All Leads
            </button>
            <button
              onClick={() => setViewMode("statistics")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                viewMode === "statistics"
                  ? "bg-blue-600 text-white"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Statistics
            </button>
          </div>
          {viewMode === "leads" && (
            <>
              <button
                onClick={syncGmail}
                className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm disabled:opacity-60"
                disabled={syncing || loading}
                title="Sync emails from Gmail"
              >
                {syncing ? "Syncing..." : "Sync Gmail"}
              </button>
              <button
                onClick={fetchMessages}
                className="px-3 py-2 rounded-lg bg-[#2c5d81] hover:bg-blue-700 text-white text-sm disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-900/40 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Commented out - Source Email Address section
      {sourceEmail && (
        <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-900/40 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-lg">📧</span>
            <div>
              <div className="text-blue-200 font-semibold">Source Email Address:</div>
              <div className="text-blue-100 text-base mt-1">{sourceEmail}</div>
            </div>
          </div>
        </div>
      )}
      */}

      {viewMode === "statistics" ? (
        <div className="space-y-6">
          {/* Top controls: agent filter, date picker, load button */}
          <div className="flex flex-wrap items-center gap-4 mb-2">
            {/* Agent dropdown and Select Range button together */}
            <div className="flex items-center gap-3">
              {/* Agent dropdown - only visible to Admin */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white/90 whitespace-nowrap">Agent:</label>
                  <AgentDropdown
                    options={statsAgentOptions.length > 1 ? statsAgentOptions : ["All"]}
                    value={selectedAgentForStats || "All"}
                    onChange={(value) => {
                      setSelectedAgentForStats(value === "All" ? null : value);
                    }}
                  />
                </div>
              )}
              <UnifiedDatePicker
                value={dateFilter}
                onFilterChange={(filter) => {
                  setDateFilter(filter);
                }}
                buttonLabel="Select Range"
              />
            </div>
            <button
              onClick={fetchStatistics}
              disabled={loadingStats}
              className="px-4 py-2 rounded-lg bg-[#2c5d81] hover:bg-blue-700 text-white text-sm disabled:opacity-60"
            >
              {loadingStats ? "Loading..." : "Load Statistics"}
            </button>
          </div>

          {/* Email Info - Commented out
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-500/30 bg-blue-900/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📧</span>
                <div className="flex-1">
                  <div className="text-blue-200 font-semibold">Gmail Account Used to Fetch Leads:</div>
                  <div className="text-blue-100 text-base mt-1">
                    {sourceEmail ? (
                      <strong className="text-green-300">{sourceEmail}</strong>
                    ) : loading ? (
                      <span className="text-white/70">Loading messages...</span>
                    ) : messages.length > 0 ? (
                      <span className="text-yellow-300">
                        ⚠️ Not configured. Check backend GMAIL_IMPERSONATED_USER env variable.
                      </span>
                    ) : (
                      <span className="text-white/70">Loading...</span>
                    )}
                  </div>
                  <div className="text-xs text-blue-200/80 mt-1">
                    This is the Gmail account connected to fetch incoming leads from Gmail API
                  </div>
                  {!sourceEmail && !loading && (
                    <div className="text-xs text-yellow-200/80 mt-2">
                      💡 Check browser console for debug logs. Set GMAIL_IMPERSONATED_USER environment variable on backend.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          */}

          {/* Agent Filter Info - Commented out
          <div className="rounded-lg border border-green-500/30 bg-green-900/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">👤</span>
              <div className="flex-1">
                <div className="text-green-200 font-semibold">Filtering Statistics by Agent:</div>
                <div className="text-green-100 text-base mt-1">
                  {isSales && normalizedEmail ? (
                    <strong>{normalizedEmail}</strong>
                  ) : (
                    <span className="text-white/70">All agents (Admin view)</span>
                  )}
                </div>
                {email && (
                  <div className="text-xs text-green-200/80 mt-1">
                    Your login email: {email}
                  </div>
                )}
              </div>
            </div>
          </div>
          */}

          {loadingStats ? (
            <div className="text-center py-8 text-white/80">⏳ Loading statistics...</div>
          ) : statistics ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-md p-4">
                  <div className="text-sm text-white/70">Total Leads</div>
                  <div className="text-3xl font-bold text-white mt-2">{statistics.totalLeads || 0}</div>
                </div>
                <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-md p-4">
                  <div className="text-sm text-white/70">Active Agents</div>
                  <div className="text-3xl font-bold text-white mt-2">{statistics.agentStats?.length || 0}</div>
                </div>
                <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-md p-4">
                  <div className="text-sm text-white/70">Days Tracked</div>
                  <div className="text-3xl font-bold text-white mt-2">{statistics.dailyStats?.length || 0}</div>
                </div>
              </div>

              {/* Agent Statistics */}
              <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-md p-4">
                <h2 className="text-xl font-bold text-white mb-4">Agent Statistics</h2>
                <div className="space-y-3">
                  {statistics.agentStats && statistics.agentStats.length > 0 ? (
                    statistics.agentStats.map((agent) => (
                      <div
                        key={agent.agentId}
                        className="rounded-lg border border-white/20 bg-white/5 p-4 cursor-pointer hover:bg-white/10 transition"
                        onClick={() => setSelectedAgentForStats(selectedAgentForStats === agent.agentId ? null : agent.agentId)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-white">{agent.agentName}</div>
                            <div className="text-sm text-white/70">{agent.agentEmail}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-blue-400">{agent.totalLeads}</div>
                            <div className="text-xs text-white/60">leads claimed</div>
                          </div>
                        </div>
                        {selectedAgentForStats === agent.agentId && (
                          <div className="mt-4 pt-4 border-t border-white/20">
                            <div className="text-sm font-semibold text-white/90 mb-2">Leads:</div>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {agent.leads.map((lead) => (
                                <div
                                  key={lead._id}
                                  className="p-3 rounded-lg border border-white/10 bg-white/5 text-sm text-white/80 hover:bg-white/10 cursor-pointer transition"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewLead({ _id: lead._id });
                                    setViewMode("leads");
                                  }}
                                >
                                  <div className="font-semibold text-white mb-2">{lead.subject || "(no subject)"}</div>
                                  <div className="space-y-1 text-xs text-white/70">
                                    {lead.name && <div><span className="font-medium">Name:</span> {lead.name}</div>}
                                    {lead.email && <div><span className="font-medium">Email:</span> {lead.email}</div>}
                                    {lead.phone && <div><span className="font-medium">Phone:</span> {lead.phone}</div>}
                                    {(lead.year || lead.make || lead.model) && (
                                      <div>
                                        <span className="font-medium">Vehicle:</span> {[lead.year, lead.make, lead.model].filter(Boolean).join(" ")}
                                      </div>
                                    )}
                                    {lead.partRequired && <div><span className="font-medium">Part:</span> {lead.partRequired}</div>}
                                    <div><span className="font-medium">From:</span> {lead.from}</div>
                                    <div><span className="font-medium">Claimed:</span> {new Date(lead.claimedAt).toLocaleString()}</div>
                                    {lead.labels && lead.labels.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {lead.labels.map((label, idx) => (
                                          <span key={idx} className="px-2 py-0.5 rounded-full border border-white/20 text-xs bg-purple-500/30 text-purple-200">
                                            {label}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-white/80">No agent statistics found for this date range.</div>
                  )}
                </div>
              </div>

              {/* Daily Statistics */}
              <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-md p-4">
                <h2 className="text-xl font-bold text-white mb-4">Daily Breakdown</h2>
                <div className="space-y-4">
                  {statistics.dailyStats && statistics.dailyStats.length > 0 ? (
                    statistics.dailyStats.map((day) => (
                      <div key={day.date} className="rounded-lg border border-white/20 bg-white/5 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-semibold text-white">
                            {new Date(day.date).toLocaleDateString("en-US", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </div>
                          <div className="text-lg font-bold text-blue-400">{day.total} leads</div>
                        </div>
                        <div className="space-y-3">
                          {day.agents.map((agent) => (
                            <div key={agent.agentId} className="rounded-lg border border-white/10 bg-white/5 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-semibold text-white/90">{agent.agentName}</div>
                                <div className="text-sm font-semibold text-blue-300">{agent.count} leads</div>
                              </div>
                              {agent.leads && agent.leads.length > 0 && (
                                <div className="space-y-2 mt-3 max-h-60 overflow-y-auto">
                                  {agent.leads.map((lead) => (
                                    <div
                                      key={lead._id}
                                      className="p-2 rounded border border-white/5 bg-white/5 text-xs text-white/80 hover:bg-white/10 cursor-pointer"
                                      onClick={() => {
                                        handleViewLead({ _id: lead._id });
                                        setViewMode("leads");
                                      }}
                                    >
                                      <div className="font-medium text-white mb-1">{lead.subject || "(no subject)"}</div>
                                      <div className="space-y-0.5 text-white/70">
                                        {lead.name && <div><span className="font-medium">Name:</span> {lead.name}</div>}
                                        {lead.email && <div><span className="font-medium">Email:</span> {lead.email}</div>}
                                        {lead.phone && <div><span className="font-medium">Phone:</span> {lead.phone}</div>}
                                        {(lead.year || lead.make || lead.model) && (
                                          <div>
                                            <span className="font-medium">Vehicle:</span> {[lead.year, lead.make, lead.model].filter(Boolean).join(" ")}
                                          </div>
                                        )}
                                        {lead.partRequired && <div><span className="font-medium">Part:</span> {lead.partRequired}</div>}
                                        <div><span className="font-medium">From:</span> {lead.from}</div>
                                        <div><span className="font-medium">Claimed:</span> {new Date(lead.claimedAt).toLocaleString()}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-white/80">No daily statistics found for this date range.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-white/80">Select a date range and click "Load Statistics" to view data.</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Leads List */}
        <div className="space-y-4">
          <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-md p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              {!isSales && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white/90 whitespace-nowrap">Max leads:</label>
                  <select
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30 text-sm"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
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
                onSubmit={(e) => e.preventDefault()}
                className="flex-1 min-w-[200px]"
              >
                <input
                  type="search"
                  placeholder="Search subject, sender, or snippet..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 px-3 py-2 outline-none focus:ring-2 focus:ring-white/30 text-sm"
                />
              </form>
            </div>

            <div className="space-y-2 max-h-[70vh] overflow-y-auto" style={{ position: 'relative' }}>
              {loading ? (
                <div className="text-center py-8 text-white/80">⏳ Loading leads...</div>
              ) : filteredMessages.length === 0 ? (
                <div className="text-center py-8 text-white/80">No leads found.</div>
              ) : (
                filteredMessages.map((msg) => (
                  <div
                    key={msg._id || msg.messageId}
                    className={`p-3 rounded-lg border transition relative ${
                      selectedMessage?._id === msg._id
                        ? "bg-blue-500/30 border-blue-400"
                        : msg.status === "active"
                        ? "bg-white/5 border-white/20 hover:bg-white/10"
                        : msg.status === "claimed"
                        ? "bg-white/5 border-white/20 hover:bg-white/10 cursor-pointer opacity-70"
                        : msg.status === "closed"
                        ? "bg-white/5 border-white/20 hover:bg-white/10 cursor-pointer border-purple-400/30 opacity-50"
                        : "bg-white/5 border-white/20"
                    }`}
                    style={{ 
                      zIndex: 1
                    }}
                    onClick={() => {
                      if (msg.status === "claimed" || msg.status === "closed") {
                        handleViewLead(msg);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 min-h-[2.5rem]">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="font-medium text-white truncate text-sm">
                          {msg.subject || "(no subject)"}
                        </div>
                        {msg.labels && msg.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 shrink-0">
                            {msg.labels.map((label) => (
                              <span
                                key={label}
                                className="px-2 py-0.5 rounded-full border border-blue-300/50 text-xs bg-blue-400/20 text-white font-semibold whitespace-nowrap"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-xs text-white/70">
                          {msg.from || "—"}
                        </div>
                        <div className="text-xs text-white/60">
                          {msg.internalDate
                            ? formatDistanceToNow(new Date(msg.internalDate), {
                                addSuffix: true,
                              })
                            : ""}
                        </div>
                        {msg.status === "closed" && (
                          <span className="text-xs text-purple-300/80 italic">Closed</span>
                        )}
                        {msg.status === "active" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClaim(msg);
                            }}
                            disabled={claimingId === msg._id || claimingId === msg.messageId}
                            className={`px-2 py-1 text-xs rounded text-white font-medium ${
                              claimingId === msg._id || claimingId === msg.messageId
                                ? "bg-gray-500 cursor-not-allowed opacity-50"
                                : "bg-[#2c5d81] hover:bg-blue-700"
                            }`}
                            style={{ 
                              backgroundColor: claimingId === msg._id || claimingId === msg.messageId 
                                ? undefined 
                                : '#2c5d81',
                              opacity: claimingId === msg._id || claimingId === msg.messageId ? 0.5 : 1,
                              position: 'relative',
                              zIndex: 100,
                              isolation: 'isolate',
                              transform: 'translateZ(0)',
                              willChange: 'transform'
                            }}
                          >
                            {claimingId === msg._id || claimingId === msg.messageId ? "Claiming..." : "Claim"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Lead Details */}
        {selectedMessage && (
        <div className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-md shadow-sm p-5">
          {loadingDetail ? (
            <div className="text-center py-8 text-white/80">Loading details...</div>
          ) : (
            <div className="space-y-4">
              <header className="flex items-center justify-between gap-3 pb-3 border-b border-white/20">
                <h2 className="text-lg md:text-xl font-semibold tracking-tight text-white">
                  Lead Details
                </h2>
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-white/20 text-white/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60"></span>
                  {selectedMessage.internalDate
                    ? new Date(selectedMessage.internalDate).toLocaleString()
                    : "—"}
                </span>
              </header>

              {/* Subject / From */}
              <div className="rounded-xl border border-white/20 bg-white/5 p-4 space-y-3">
                <div className="text-base font-medium text-white">
                  {selectedMessage.subject || "(no subject)"}
                </div>
                <div className="text-sm text-white/70">
                  <b>From:</b> {selectedMessage.from || "—"}
                </div>
              </div>

              {/* Status and Actions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white/80">Status:</div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      selectedMessage.status === "claimed"
                        ? "bg-blue-500/30 text-blue-200 border border-blue-400/50"
                        : selectedMessage.status === "closed"
                        ? "bg-gray-500/30 text-gray-200 border border-gray-400/50"
                        : "bg-green-500/30 text-green-200 border border-green-400/50"
                    }`}>
                      {selectedMessage.status === "claimed" ? "Claimed" : selectedMessage.status === "closed" ? "Closed" : "Active"}
                    </span>
                    {selectedMessage.status === "claimed" && (
                      <button
                        onClick={() => handleCloseLead(selectedMessage._id)}
                        disabled={closingId === selectedMessage._id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-gray-600 hover:bg-gray-700 disabled:opacity-60 text-white border border-gray-500/50"
                      >
                        {closingId === selectedMessage._id ? "Closing..." : "Close Lead"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Labels */}
              <div className="space-y-2">
                <div className="text-sm text-white/80">Labels:</div>
                <div className="relative inline-block" ref={labelsDropdownRef}>
                  <button
                    type="button"
                    className="min-w-[14rem] inline-flex flex-wrap items-center gap-2 rounded-md border border-white/20 bg-[#04356d] hover:bg-[#3b89bf] px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-white/30 cursor-pointer"
                    onClick={() => setShowLabelsDropdown(!showLabelsDropdown)}
                  >
                    {!selectedMessage.labels?.length && (
                      <span className="opacity-90">Select labels</span>
                    )}
                    {selectedMessage.labels?.length > 0 && (
                      <>
                        {selectedMessage.labels.slice(0, 3).map((lab) => (
                          <span
                            key={lab}
                            className="px-2 py-0.5 rounded-full border border-white/30 text-xs bg-white/20 text-white font-medium"
                          >
                            {lab}
                          </span>
                        ))}
                        {selectedMessage.labels.length > 3 && (
                          <span className="text-xs opacity-90">
                            +{selectedMessage.labels.length - 3} more
                          </span>
                        )}
                      </>
                    )}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 ml-auto opacity-90"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {showLabelsDropdown && (
                    <div className="absolute z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-white/20 bg-[#04356d] shadow-lg p-2">
                      <div className="p-1">
                        <input
                          type="text"
                          placeholder="Search labels…"
                          value={labelSearch}
                          onChange={(e) => setLabelSearch(e.target.value)}
                          className="w-full border border-white/20 rounded px-2 py-1 text-sm bg-white/10 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                      <div className="max-h-56 overflow-auto divide-y divide-white/10">
                        {filteredLabelOptions.map((lab) => {
                          const isSelected = selectedMessage.labels?.includes(lab);
                          return (
                            <button
                              key={lab}
                              type="button"
                              className="w-full text-left px-2 py-2 text-sm hover:bg-[#3b89bf] flex items-center gap-2 text-white"
                              onClick={() => handleToggleLabel(lab)}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={isSelected}
                                readOnly
                              />
                              <span className="truncate">{lab}</span>
                            </button>
                          );
                        })}
                        {filteredLabelOptions.length === 0 && (
                          <div className="px-2 py-3 text-sm opacity-70 text-white/70">
                            No labels match "{labelSearch}"
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 p-2 border-t border-white/10">
                        <input
                          type="text"
                          placeholder="Create new label…"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddNewLabel();
                            }
                          }}
                          className="flex-1 border border-white/20 rounded px-2 py-1 text-sm bg-white/10 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                        <button
                          type="button"
                          className="px-3 py-1 rounded-md border border-white/20 text-sm bg-[#3b89bf] hover:bg-[#04356d] text-white font-medium"
                          onClick={handleAddNewLabel}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Email Body */}
              {selectedMessage.bodyHtml && (
                <div className="rounded-xl border border-white/20 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white/80 mb-3">Email Body:</div>
                  <div 
                    className="prose prose-invert max-w-none text-white/90"
                    dangerouslySetInnerHTML={{ __html: selectedMessage.bodyHtml }}
                    style={{
                      fontSize: '14px',
                      lineHeight: '1.6',
                    }}
                  />
                </div>
              )}

            </div>
          )}
        </div>
        )}
      </div>
      )}

    </div>
  );
}

