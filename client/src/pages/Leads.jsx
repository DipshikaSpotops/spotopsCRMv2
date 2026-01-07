import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import moment from "moment-timezone";
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
        id: parsed?.user?.id || parsed?.user?._id || undefined,
      };
    }
  } catch (err) {
    console.warn("Failed to parse auth storage", err);
  }
  
  // Try to get user ID from JWT token
  let userId = undefined;
  try {
    const token = localStorage.getItem("token");
    if (token) {
      // Decode JWT to get user ID (simple base64 decode, no verification needed for just reading)
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload?.id || payload?.userId || undefined;
    }
  } catch (err) {
    // Ignore JWT decode errors
  }
  
  return {
    role: localStorage.getItem("role") || undefined,
    email: localStorage.getItem("email") || undefined,
    name: localStorage.getItem("username") || undefined,
    firstName: undefined,
    id: userId,
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
  const { role, email, name, firstName, id: userId } = useMemo(() => {
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
    // Default to today (start and end both today) in Dallas timezone
    const ZONE = "America/Chicago";
    const todayDallas = moment.tz(ZONE);
    const startDallas = todayDallas.clone().startOf("day");
    const endDallas = todayDallas.clone().endOf("day");
    const startUTC = startDallas.utc().format(); // ISO string in UTC
    const endUTC = endDallas.utc().format(); // ISO string in UTC
    return {
      start: startUTC,
      end: endUTC,
    };
  });
  const [selectedAgentForStats, setSelectedAgentForStats] = useState(null);
  const [allSalesAgents, setAllSalesAgents] = useState([]); // For admin dropdown - stores emails
  const [emailToNameMap, setEmailToNameMap] = useState(new Map()); // Maps email -> firstName

  const normalizedEmail = email?.toLowerCase();

  const [syncing, setSyncing] = useState(false);
  
  // Initialize AudioContext on user interaction (required for autoplay)
  const audioContextRef = useRef(null);
  
  useEffect(() => {
    // Initialize AudioContext on first user interaction
    // This is required for browser autoplay policies
    const initAudio = async () => {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const ctx = new AudioContext();
          audioContextRef.current = ctx;
          console.log("[Leads] AudioContext initialized, state:", ctx.state);
          
          // Try to resume if suspended (for background tab support)
          if (ctx.state === 'suspended') {
            try {
              await ctx.resume();
              console.log("[Leads] AudioContext resumed during initialization");
            } catch (err) {
              console.warn("[Leads] Could not resume AudioContext during init:", err);
            }
          }
        } catch (err) {
          console.warn("[Leads] Could not initialize AudioContext:", err);
        }
      } else {
        // AudioContext exists, try to resume if suspended (for background tab support)
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().then(() => {
            console.log("[Leads] AudioContext resumed on user interaction");
          }).catch(err => {
            console.warn("[Leads] Could not resume AudioContext:", err);
          });
        }
      }
    };
    
    // Initialize on any user interaction
    // Use 'once: false' so we can resume AudioContext on each interaction if needed
    const events = ['click', 'keydown', 'touchstart', 'mousedown'];
    events.forEach(event => {
      document.addEventListener(event, initAudio, { once: false });
    });
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, initAudio);
      });
    };
  }, []);

  // Custom notification sound file path
  // Place your sound file in: client/public/sounds/notification.mp3 (or .wav, .ogg)
  // Supported formats: mp3, wav, ogg, m4a
  const NOTIFICATION_SOUND_PATH = "/sounds/notification.mp3";

  // Play notification sound when new fresh leads arrive
  // Works like WhatsApp/Instagram: plays even when tab is in background
  const playNotificationSound = useCallback(async () => {
    // Play sound regardless of tab visibility or current view mode
    // This allows notifications even when user is in another tab or viewing statistics
    
    try {
      // Try to play custom sound file first
      if (NOTIFICATION_SOUND_PATH && NOTIFICATION_SOUND_PATH.trim() !== "") {
        try {
          const audio = new Audio(NOTIFICATION_SOUND_PATH);
          audio.volume = 0.7; // Adjust volume (0.0 to 1.0)
          
          // Handle audio loading errors
          audio.onerror = () => {
            console.warn("[Leads] Custom sound file not found, using default beep");
            playDefaultBeep();
          };
          
          // Play the custom sound
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log("[Leads] ✅ Custom notification sound played successfully");
              })
              .catch((err) => {
                console.warn("[Leads] Could not play custom sound (autoplay blocked), trying default:", err);
                playDefaultBeep();
              });
          }
          return; // Exit early if custom sound is being used
        } catch (err) {
          console.warn("[Leads] Error loading custom sound, using default:", err);
          // Fall through to default beep
        }
      }
      
      // Fallback to default beep sound
      playDefaultBeep();
      
      function playDefaultBeep() {
        try {
          // Use existing AudioContext or create new one
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          let ctx = audioContextRef.current;
          
          if (!ctx || ctx.state === 'closed') {
            ctx = new AudioContext();
            audioContextRef.current = ctx;
          }
          
          // Always try to resume AudioContext (required for background tab playback)
          // This is essential for WhatsApp/Instagram-like notifications
          const resumeAndPlay = async () => {
            if (ctx.state === 'suspended') {
              try {
                await ctx.resume();
                console.log("[Leads] AudioContext resumed for notification");
              } catch (resumeErr) {
                console.warn("[Leads] Could not resume AudioContext for notification:", resumeErr);
              }
            }
            
            // Create a pleasant notification sound (three-tone chime)
            const now = ctx.currentTime;
            
            // First tone: 523.25 Hz (C5) - 0.15s
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(523.25, now);
            gain1.gain.setValueAtTime(0, now);
            gain1.gain.linearRampToValueAtTime(0.4, now + 0.05);
            gain1.gain.linearRampToValueAtTime(0, now + 0.15);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.15);
            
            // Second tone: 659.25 Hz (E5) - 0.15s, starts at 0.1s
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(659.25, now);
            gain2.gain.setValueAtTime(0, now + 0.1);
            gain2.gain.linearRampToValueAtTime(0.4, now + 0.15);
            gain2.gain.linearRampToValueAtTime(0, now + 0.25);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.1);
            osc2.stop(now + 0.25);
            
            // Third tone: 783.99 Hz (G5) - 0.15s, starts at 0.2s
            const osc3 = ctx.createOscillator();
            const gain3 = ctx.createGain();
            osc3.type = 'sine';
            osc3.frequency.setValueAtTime(783.99, now);
            gain3.gain.setValueAtTime(0, now + 0.2);
            gain3.gain.linearRampToValueAtTime(0.4, now + 0.25);
            gain3.gain.linearRampToValueAtTime(0, now + 0.35);
            osc3.connect(gain3);
            gain3.connect(ctx.destination);
            osc3.start(now + 0.2);
            osc3.stop(now + 0.35);
          };
          
          resumeAndPlay();
        } catch (err) {
          console.warn("[Leads] Could not play default beep sound:", err);
        }
      }
    } catch (err) {
      console.warn("[Leads] Could not play notification sound:", err);
    }
  }, []);

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
      let newMessages = data?.messages || [];
      
      console.log(`[Leads] Fetched ${newMessages.length} messages from API. isAdmin: ${isAdmin}, role: ${role}`);
      if (isAdmin) {
        const claimedLeads = newMessages.filter(m => m.status === "claimed" || m.status === "closed");
        const uniqueClaimedBy = [...new Set(claimedLeads.map(m => m.claimedBy).filter(Boolean))];
        console.log(`[Leads] Admin view - Total claimed/closed leads: ${claimedLeads.length}, claimedBy IDs: ${uniqueClaimedBy.length}`);
      }
      
      // Frontend filter: Remove read emails that aren't claimed/closed by current user
      // This is a safety measure in case any read emails slip through from the backend
      // Admin users can see ALL leads, so skip this filtering for Admin
      if (!isAdmin) {
        newMessages = newMessages.filter((msg) => {
          const labelIds = msg.labelIds || [];
          const isUnread = labelIds.includes("UNREAD");
          const status = msg.status || "active";
          
          // Always show unread messages
          if (isUnread) {
            return true;
          }
          
          // If message is read, only show if it's claimed/closed by current user
          if (!isUnread) {
            // Show if claimed/closed by current user
            if ((status === "claimed" || status === "closed") && msg.claimedBy && userId && msg.claimedBy === userId) {
              return true;
            }
            // Hide read emails that aren't claimed/closed by current user
            return false;
          }
          
          return true;
        });
      }
      // Admin users see all messages (no filtering by claimedBy)
      
      if (silent) {
        // Silent update: only append new messages without showing loading
        setMessages((prevMessages) => {
          const existingIds = new Set(prevMessages.map(m => m._id || m.messageId));
          const newOnes = newMessages.filter(m => !existingIds.has(m._id || m.messageId));
          
          // Filter to only fresh/active leads (not claimed or closed AND unread)
          const freshLeads = newOnes.filter(m => {
            const status = m.status || "active";
            const labelIds = m.labelIds || [];
            const isUnread = labelIds.includes("UNREAD");
            
            // Only consider it fresh if:
            // 1. Status is active (unclaimed)
            // 2. Has UNREAD label (not read in Gmail)
            return status === "active" && isUnread;
          });
          
          // Play notification sound ONLY for fresh/active/unread leads
          if (freshLeads.length > 0) {
            console.log(`[Leads] 🎉 ${freshLeads.length} fresh unread lead(s) detected! Playing notification sound.`);
            playNotificationSound();
          }
          
          if (newOnes.length > 0) {
            // New messages found, prepend them
            return [...newOnes, ...prevMessages];
          }
          
          // No new messages, but update existing ones in case status changed
          // Also filter out any that became read (lost UNREAD label)
          const updatedMap = new Map(newMessages.map(m => [m._id || m.messageId, m]));
          return prevMessages
            .map(m => {
              const updated = updatedMap.get(m._id || m.messageId);
              // If message was updated, use the updated version
              // Otherwise keep the original
              return updated || m;
            })
            .filter(m => {
              // Filter out read emails that aren't claimed/closed by current user
              const labelIds = m.labelIds || [];
              const isUnread = labelIds.includes("UNREAD");
              const status = m.status || "active";
              
              // Always keep unread messages
              if (isUnread) {
                return true;
              }
              
              // If read, only keep if claimed/closed by current user
              if (status === "claimed" || status === "closed") {
                if (m.claimedBy && userId && m.claimedBy === userId) {
                  return true;
                }
              }
              
              // Remove read emails that aren't claimed by current user
              return false;
            });
        });
      } else {
        setMessages(newMessages);
      }
      setLastUpdated(new Date());
    } catch (err) {
      if (!silent) {
      console.error("[Leads] fetch error", err);
      console.error("[Leads] Error response:", err?.response?.data);
      console.error("[Leads] Error status:", err?.response?.status);
        const errorData = err?.response?.data;
        
        // Check if it's a Gmail token issue (Gmail OAuth token, not user auth)
        if (errorData?.errorCode === "GMAIL_TOKEN_INVALID" ||
            errorData?.error === "Invalid token. Re-authorization required." || 
            errorData?.message?.includes("re-authorize") ||
            errorData?.message?.includes("invalid_grant") ||
            (err?.response?.status === 400 && errorData?.message?.includes("Gmail token"))) {
          const message = errorData?.message || "Gmail token is invalid. Please re-authorize.";
          const helpUrl = errorData?.help || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" 
            ? "http://localhost:5000/api/gmail/oauth2/url" 
            : "https://www.spotops360.com/api/gmail/oauth2/url");
          setError(
            <div>
              <p className="font-semibold mb-2">{message}</p>
              <p className="text-sm mb-2">To fix this:</p>
              <ol className="list-decimal list-inside text-sm space-y-1 mb-2">
                <li>Open: <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">{helpUrl}</a></li>
                <li>Click "Authorize Gmail Access"</li>
                <li>Sign in and grant permissions</li>
                <li>Then refresh this page</li>
              </ol>
            </div>
          );
        } else {
        // Handle network errors specifically
          let message;
        if (err.code === "ERR_NETWORK" || err.message === "Network Error" || !err.response) {
          message = "Network Error: Unable to connect to server. Please check if the backend is running.";
        } else {
            // Show the actual error message from backend
            message = errorData?.message || 
                     errorData?.error || 
                     (err?.response?.status === 400 ? "Bad Request: " + JSON.stringify(errorData) : null) ||
        err?.message ||
        "Failed to load leads.";
        }
      setError(message);
        }
      }
    } finally {
      if (!silent) {
      setLoading(false);
      }
    }
  }, [isSales, normalizedEmail, limit, playNotificationSound]);

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
      console.log("[Leads] fetchStatistics called with dateFilter:", dateFilter);
      const params = {};
      if (dateFilter?.start) {
        // UnifiedDatePicker sends UTC ISO strings representing Dallas day boundaries
        // Extract the date part (YYYY-MM-DD) from the UTC ISO string
        // The UTC string represents the start of day in Dallas timezone
        const startDateStr = dateFilter.start.split("T")[0]; // Extract YYYY-MM-DD
        params.startDate = startDateStr;
        console.log("[Leads] Extracted startDate:", startDateStr);
      }
      if (dateFilter?.end) {
        // Extract the date part (YYYY-MM-DD) from the UTC ISO string
        const endDateStr = dateFilter.end.split("T")[0]; // Extract YYYY-MM-DD
        params.endDate = endDateStr;
        console.log("[Leads] Extracted endDate:", endDateStr);
      }
      // Use selectedAgentForStats if set, otherwise use sales user's email
      if (selectedAgentForStats && selectedAgentForStats !== "All") {
        params.agentEmail = selectedAgentForStats;
      } else if (isSales && normalizedEmail) {
        params.agentEmail = normalizedEmail;
      }
      console.log("[Leads] Fetching statistics with params:", params);
      console.log("[Leads] Selected agent for stats:", selectedAgentForStats);
      console.log("[Leads] Is Admin:", isAdmin, "Is Sales:", isSales);
      console.log("[Leads] Date filter:", dateFilter);
      const { data } = await API.get("/gmail/statistics/daily", { params });
      console.log("[Leads] Statistics response:", data);
      console.log("[Leads] Daily stats count:", data?.dailyStats?.length || 0);
      console.log("[Leads] Agent stats count:", data?.agentStats?.length || 0);
      console.log("[Leads] Total leads:", data?.totalLeads || 0);
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
      // Always auto-fetch when entering statistics view (dateFilter defaults to today)
      fetchStatistics();
    }
  }, [viewMode, fetchStatistics]);

  // Fetch all sales agents for admin users (so dropdown shows even before statistics load)
  useEffect(() => {
    if (!isAdmin) return;
    
    const fetchSalesAgents = async () => {
      try {
        const { data } = await API.get("/users", { params: { role: "Sales" } });
        // Extract emails from sales users
        const emails = data
          .map(user => user.email?.toLowerCase())
          .filter(Boolean);
        setAllSalesAgents(emails);
        
        // Create email -> firstName mapping
        const emailMap = new Map();
        data.forEach(user => {
          if (user.email && user.firstName) {
            emailMap.set(user.email.toLowerCase(), user.firstName);
          }
        });
        setEmailToNameMap(emailMap);
        console.log("[Leads] Fetched sales agents for dropdown:", emails);
        console.log("[Leads] Email to name map:", Object.fromEntries(emailMap));
      } catch (err) {
        console.error("[Leads] Error fetching sales agents:", err);
      }
    };
    
    fetchSalesAgents();
  }, [isAdmin]);

  // Auto-refresh statistics when date filter or agent selection changes (only when in statistics view)
  useEffect(() => {
    if (viewMode !== "statistics") return;
    
    // Only auto-fetch if we have a date filter set
    if (dateFilter?.start || dateFilter?.end) {
      fetchStatistics();
    }
  }, [dateFilter, selectedAgentForStats, viewMode, fetchStatistics]);

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

  // Check if it's daytime in Dallas (6 AM - 8 PM)
  const isDallasDaytime = () => {
    const dallasTz = "America/Chicago";
    const now = new Date();
    const dallasTime = formatInTimeZone(now, dallasTz, "HH");
    const hour = parseInt(dallasTime, 10);
    return hour >= 6 && hour < 20; // 6 AM to 8 PM Dallas time
  };

  // Auto-refresh leads continuously - works like WhatsApp/Instagram: continues even in background tabs
  // Continuous polling ensures read emails are removed immediately when they're read in Gmail
  useEffect(() => {
    if (viewMode !== "leads") return; // Only poll when in leads view
    
    let interval;
    
    const startPolling = () => {
      // Poll every 10 seconds continuously (not just during daytime)
      // This ensures read emails are removed immediately when they're read in Gmail
      // Works even when tab is hidden (like WhatsApp/Instagram notifications)
      interval = setInterval(() => {
        fetchMessages(true); // Silent fetch - no loading state
      }, 10000); // 10 seconds
    };
    
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    
    // Start polling immediately (regardless of tab visibility or time)
    // This ensures read emails are removed as soon as they're read in Gmail
    startPolling();
    
    // Handle visibility changes - continue polling even when tab is hidden
    // This allows notifications to work like WhatsApp/Instagram
    const handleVisibilityChange = () => {
      if (!interval) {
        startPolling();
      }
      // Immediately fetch when tab becomes visible
      if (!document.hidden) {
        fetchMessages(true);
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
      
      // Update the message status to claimed (keep it visible in the list)
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
  const [commentText, setCommentText] = useState("");
  const [addingComment, setAddingComment] = useState(false);

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

  const handleAddComment = async () => {
    if (!selectedMessage?._id || !commentText.trim()) return;
    setAddingComment(true);
    setError("");
    try {
      const { data } = await API.post(`/gmail/messages/${selectedMessage._id}/comments`, {
        comment: commentText.trim(),
      });
      setSelectedMessage((prev) => (prev?._id === selectedMessage._id ? { ...prev, ...data } : prev));
      setCommentText("");
    } catch (err) {
      console.error("[Leads] add comment error", err);
      setError(err?.response?.data?.message || "Failed to add comment");
    } finally {
      setAddingComment(false);
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

  // Update email->name map when statistics load
  useEffect(() => {
    if (statistics?.agentStats && statistics.agentStats.length > 0) {
      setEmailToNameMap(prevMap => {
        const newMap = new Map(prevMap);
        let updated = false;
        statistics.agentStats.forEach(agent => {
          if (agent.agentEmail && agent.agentName) {
            const emailKey = agent.agentEmail.toLowerCase();
            if (!newMap.has(emailKey)) {
              newMap.set(emailKey, agent.agentName);
              updated = true;
            }
          }
        });
        return updated ? newMap : prevMap;
      });
    }
  }, [statistics]);

  // Get agent options from statistics if available, otherwise use allSalesAgents or agentOptions
  // Values are emails (for API calls), but we'll display firstName in the dropdown
  const statsAgentOptions = useMemo(() => {
    const opts = ["All"];
    
    // If we have statistics with agent stats, use those emails (they're the ones with leads)
    if (statistics?.agentStats && statistics.agentStats.length > 0) {
      const emails = statistics.agentStats.map(a => a.agentEmail?.toLowerCase()).filter(Boolean);
      return [...opts, ...new Set(emails)].sort();
    }
    
    // For admin users, use allSalesAgents (fetched from backend) or agentOptions as fallback
    if (isAdmin) {
      if (allSalesAgents.length > 0) {
        return [...opts, ...allSalesAgents].sort();
      } else if (agentOptions && agentOptions.length > 1) {
        // Filter out "Select" and "All" if they exist
        const filtered = agentOptions.filter(opt => opt !== "Select" && opt !== "All");
        return ["All", ...new Set(filtered.map(opt => opt.toLowerCase()))].sort();
      }
    }
    
    // Default fallback
    return opts;
  }, [statistics, allSalesAgents, agentOptions, isAdmin]);

  const filteredMessages = useMemo(() => {
    console.log(`[Leads] filteredMessages - isAdmin: ${isAdmin}, total messages: ${messages.length}`);
    if (isAdmin) {
      const claimedLeads = messages.filter(m => m.status === "claimed" || m.status === "closed");
      console.log(`[Leads] Admin view - Claimed/closed leads in messages: ${claimedLeads.length}`);
    }
    
    return messages.filter((msg) => {
      // Admin users can see ALL leads (claimed by anyone), so skip all claimedBy filtering for Admin
      if (!isAdmin) {
        // Filter out read emails that aren't claimed/closed by current user (Sales users only)
        const labelIds = msg.labelIds || [];
        const isUnread = labelIds.includes("UNREAD");
        const status = msg.status || "active";
        
        // If labelIds is missing or empty, treat as potentially read and check status
        // If message is read (no UNREAD label), only show if claimed/closed by current user
        if (!isUnread) {
          // Show read emails only if they're claimed/closed by current user
          if (status === "claimed" || status === "closed") {
            if (msg.claimedBy && userId && msg.claimedBy === userId) {
              // Continue with other filters - this is a claimed/closed lead by current user
            } else {
              return false; // Hide read emails that aren't claimed by current user
            }
          } else {
            // Hide read emails that are active/unclaimed
            // Also hide if labelIds is missing and status is active (likely read)
            if (status === "active" && (!labelIds || labelIds.length === 0)) {
              // If no labelIds and status is active, assume it might be read - hide it to be safe
              return false;
            }
            return false;
          }
        }
        
        // Filter out leads claimed by other users (Sales users only)
        // Show:
        // 1. Active (unclaimed) leads (must be unread)
        // 2. Leads claimed by the current logged-in user
        // 3. Leads closed by the current logged-in user
        // Hide:
        // - Leads claimed by other users
        
        // Always show active leads (they should be unread at this point)
        if (status === "active") {
          // Continue with other filters below
        } else if (status === "claimed" || status === "closed") {
          // Only show if claimed by current user
          if (msg.claimedBy && userId && msg.claimedBy !== userId) {
            return false; // Hide leads claimed by other users
          }
        }
        
        // For sales agents: only show unclaimed leads or leads claimed by them
        if (isSales && normalizedEmail) {
          // If lead is claimed by another agent, don't show it
          if (msg.agentEmail && msg.agentEmail.toLowerCase() !== normalizedEmail) {
            return false;
          }
        }
      }
      // Admin users: no filtering by claimedBy - they see all leads
      
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
  }, [messages, agentFilter, search, isSales, isAdmin, normalizedEmail, userId]);

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
              {/* Agent dropdown - always visible to Admin */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white/90 whitespace-nowrap">Agent:</label>
                  <select
                    value={selectedAgentForStats || "All"}
                    onChange={(e) => {
                      const value = e.target.value;
                      console.log("[Leads] Agent selection changed:", value, "Setting to:", value === "All" ? null : value);
                      setSelectedAgentForStats(value === "All" ? null : value);
                    }}
                    className="px-3 py-2 rounded-md bg-[#04356d] hover:bg-[#3b89bf] text-white border border-white/20 text-sm text-center focus:outline-none focus:ring-2 focus:ring-white/30 cursor-pointer"
                  >
                    {statsAgentOptions.map((email) => (
                      <option key={email} value={email}>
                        {email === "All" 
                          ? "All" 
                          : emailToNameMap.get(email.toLowerCase()) || email
                        }
                      </option>
                    ))}
                  </select>
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
                    statistics.agentStats.map((agent) => {
                      // Use agentEmail for comparison since dropdown uses emails
                      const agentEmailLower = agent.agentEmail?.toLowerCase() || "";
                      const isSelected = selectedAgentForStats && selectedAgentForStats.toLowerCase() === agentEmailLower;
                      
                      return (
                      <div
                        key={agent.agentId}
                        className="rounded-lg border border-white/20 bg-white/5 p-4 cursor-pointer hover:bg-white/10 transition"
                        onClick={() => {
                          // Use agentEmail to match dropdown values
                          const newValue = isSelected ? null : agentEmailLower;
                          console.log("[Leads] Agent card clicked:", agent.agentName, "Setting to:", newValue);
                          setSelectedAgentForStats(newValue);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-white">{agent.agentName}</div>
                            <div className="text-sm text-white/70">{agent.agentEmail}</div>
                            {agent.avgResponseTimeFormatted && (
                              <div className="text-xs text-green-400 mt-1">
                                ⏱️ Avg Response: {agent.avgResponseTimeFormatted}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-blue-400">{agent.totalLeads}</div>
                            <div className="text-xs text-white/60">leads claimed</div>
                          </div>
                        </div>
                        {isSelected && (
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
                                  <div className="space-y-1 text-xs text-white/70">
                                    {lead.name && <div><span className="font-medium">Name:</span> {lead.name}</div>}
                                    {lead.email && <div><span className="font-medium">Email:</span> {lead.email}</div>}
                                    {lead.phone && <div><span className="font-medium">Phone:</span> {lead.phone}</div>}
                                    {(lead.year || lead.make || lead.model) && (
                                      <div>
                                        <span className="font-medium">Vehicle:</span> {[lead.year, lead.make, lead.model].filter(Boolean).join(" ")}
                                      </div>
                                    )}
                                    {lead.partRequired && <div><span className="font-medium">Part Required:</span> {lead.partRequired}</div>}
                                    {/* Timeline Section */}
                                    {(lead.enteredAt || lead.claimedAt) && (
                                      <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                                        <div className="text-xs font-semibold text-white/80 mb-1">Timeline:</div>
                                        {lead.enteredAt && (
                                          <div>
                                            <span className="font-medium text-blue-300">📥 Entered System:</span>{" "}
                                            <span className="text-white/70">
                                              {new Date(lead.enteredAt).toLocaleString("en-US", {
                                                timeZone: "America/Chicago",
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                                hour: "numeric",
                                                minute: "2-digit",
                                                second: "2-digit",
                                                hour12: true,
                                              })}
                                            </span>
                                          </div>
                                        )}
                                        {lead.claimedAt && (
                                          <div>
                                            <span className="font-medium text-green-300">✅ Claimed:</span>{" "}
                                            <span className="text-white/70">
                                              {new Date(lead.claimedAt).toLocaleString("en-US", {
                                                timeZone: "America/Chicago",
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                                hour: "numeric",
                                                minute: "2-digit",
                                                second: "2-digit",
                                                hour12: true,
                                              })}
                                            </span>
                                          </div>
                                        )}
                                        {lead.enteredAt && lead.claimedAt && (
                                          (() => {
                                            const entered = new Date(lead.enteredAt);
                                            const claimed = new Date(lead.claimedAt);
                                            const diffMs = claimed - entered;
                                            const diffSeconds = diffMs / 1000;
                                            const diffMinutes = diffSeconds / 60;
                                            let timeDiffFormatted = "";
                                            if (diffSeconds < 60) {
                                              timeDiffFormatted = `${diffSeconds.toFixed(1)} sec`;
                                            } else if (diffMinutes < 60) {
                                              const mins = Math.floor(diffMinutes);
                                              const secs = Math.round((diffMinutes - mins) * 60);
                                              timeDiffFormatted = secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
                                            } else if (diffMinutes < 1440) {
                                              const hours = Math.floor(diffMinutes / 60);
                                              const mins = Math.round(diffMinutes % 60);
                                              timeDiffFormatted = `${hours}h ${mins}m`;
                                            } else {
                                              const days = Math.floor(diffMinutes / 1440);
                                              const hours = Math.floor((diffMinutes % 1440) / 60);
                                              timeDiffFormatted = `${days}d ${hours}h`;
                                            }
                                            return (
                                              <div>
                                                <span className="font-medium text-purple-300">⏱️ Response Time:</span>{" "}
                                                <span className="text-white/70">{timeDiffFormatted}</span>
                                              </div>
                                            );
                                          })()
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      );
                    })
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
                                      <div className="space-y-0.5 text-white/70">
                                        {lead.name && <div><span className="font-medium">Name:</span> {lead.name}</div>}
                                        {lead.email && <div><span className="font-medium">Email:</span> {lead.email}</div>}
                                        {lead.phone && <div><span className="font-medium">Phone:</span> {lead.phone}</div>}
                                        {(lead.year || lead.make || lead.model) && (
                                          <div>
                                            <span className="font-medium">Vehicle:</span> {[lead.year, lead.make, lead.model].filter(Boolean).join(" ")}
                                          </div>
                                        )}
                                        {lead.partRequired && <div><span className="font-medium">Part Required:</span> {lead.partRequired}</div>}
                                        {/* Timeline Section */}
                                        {(lead.enteredAt || lead.claimedAt) && (
                                          <div className="mt-1 pt-1 border-t border-white/10 space-y-0.5">
                                            <div className="text-xs font-semibold text-white/80 mb-0.5">Timeline:</div>
                                            {lead.enteredAt && (
                                              <div>
                                                <span className="font-medium text-blue-300">📥 Entered System:</span>{" "}
                                                <span className="text-white/70">
                                                  {new Date(lead.enteredAt).toLocaleString("en-US", {
                                                    timeZone: "America/Chicago",
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric",
                                                    hour: "numeric",
                                                    minute: "2-digit",
                                                    second: "2-digit",
                                                    hour12: true,
                                                  })}
                                                </span>
                                              </div>
                                            )}
                                            {lead.claimedAt && (
                                              <div>
                                                <span className="font-medium text-green-300">✅ Claimed:</span>{" "}
                                                <span className="text-white/70">
                                                  {new Date(lead.claimedAt).toLocaleString("en-US", {
                                                    timeZone: "America/Chicago",
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric",
                                                    hour: "numeric",
                                                    minute: "2-digit",
                                                    second: "2-digit",
                                                    hour12: true,
                                                  })}
                                                </span>
                                              </div>
                                            )}
                                            {lead.enteredAt && lead.claimedAt && (
                                              (() => {
                                                const entered = new Date(lead.enteredAt);
                                                const claimed = new Date(lead.claimedAt);
                                                const diffMs = claimed - entered;
                                                const diffSeconds = diffMs / 1000;
                                                const diffMinutes = diffSeconds / 60;
                                                let timeDiffFormatted = "";
                                                if (diffSeconds < 60) {
                                                  timeDiffFormatted = `${diffSeconds.toFixed(1)} sec`;
                                                } else if (diffMinutes < 60) {
                                                  const mins = Math.floor(diffMinutes);
                                                  const secs = Math.round((diffMinutes - mins) * 60);
                                                  timeDiffFormatted = secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
                                                } else if (diffMinutes < 1440) {
                                                  const hours = Math.floor(diffMinutes / 60);
                                                  const mins = Math.round(diffMinutes % 60);
                                                  timeDiffFormatted = `${hours}h ${mins}m`;
                                                } else {
                                                  const days = Math.floor(diffMinutes / 1440);
                                                  const hours = Math.floor((diffMinutes % 1440) / 60);
                                                  timeDiffFormatted = `${days}d ${hours}h`;
                                                }
                                                return (
                                                  <div>
                                                    <span className="font-medium text-purple-300">⏱️ Response Time:</span>{" "}
                                                    <span className="text-white/70">{timeDiffFormatted}</span>
                                                  </div>
                                                );
                                              })()
                                            )}
                                          </div>
                                        )}
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
                        {msg.claimedAt && (
                          <div className="text-xs text-green-300" title={`Claimed: ${new Date(msg.claimedAt).toLocaleString()}`}>
                            ✅ {formatDistanceToNow(new Date(msg.claimedAt), { addSuffix: true })}
                          </div>
                        )}
                        {!msg.claimedAt && msg.internalDate && (
                          <div className="text-xs text-white/60">
                            {formatDistanceToNow(new Date(msg.internalDate), {
                              addSuffix: true,
                            })}
                          </div>
                        )}
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

              {/* Timestamps: Entered and Claimed */}
              {(selectedMessage.enteredAt || selectedMessage.claimedAt) && (
                <div className="rounded-xl border border-white/20 bg-white/5 p-4 space-y-2">
                  <div className="text-sm font-semibold text-white/90 mb-2">Timeline:</div>
                  {selectedMessage.enteredAt && (
                    <div className="text-sm text-white/80">
                      <span className="font-medium text-blue-300">📥 Entered System:</span>{" "}
                      <span className="text-white/70">
                        {new Date(selectedMessage.enteredAt).toLocaleString("en-US", {
                          timeZone: "America/Chicago",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: true,
                        })}
                      </span>
                    </div>
                  )}
                  {selectedMessage.claimedAt && (
                    <div className="text-sm text-white/80">
                      <span className="font-medium text-green-300">✅ Claimed:</span>{" "}
                      <span className="text-white/70">
                        {new Date(selectedMessage.claimedAt).toLocaleString("en-US", {
                          timeZone: "America/Chicago",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: true,
                        })}
                      </span>
                    </div>
                  )}
                  {selectedMessage.enteredAt && selectedMessage.claimedAt && (
                    (() => {
                      const entered = new Date(selectedMessage.enteredAt);
                      const claimed = new Date(selectedMessage.claimedAt);
                      const diffMs = claimed - entered;
                      const diffSeconds = diffMs / 1000;
                      const diffMinutes = diffSeconds / 60;
                      let timeDiffFormatted = "";
                      if (diffSeconds < 60) {
                        // Show seconds with up to 1 decimal place
                        timeDiffFormatted = `${diffSeconds.toFixed(1)} sec`;
                      } else if (diffMinutes < 60) {
                        // Show minutes and seconds if less than 60 minutes
                        const mins = Math.floor(diffMinutes);
                        const secs = Math.round((diffMinutes - mins) * 60);
                        timeDiffFormatted = secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
                      } else if (diffMinutes < 1440) {
                        const hours = Math.floor(diffMinutes / 60);
                        const mins = Math.round(diffMinutes % 60);
                        timeDiffFormatted = `${hours}h ${mins}m`;
                      } else {
                        const days = Math.floor(diffMinutes / 1440);
                        const hours = Math.floor((diffMinutes % 1440) / 60);
                        timeDiffFormatted = `${days}d ${hours}h`;
                      }
                      return (
                        <div className="text-sm text-white/80 mt-2 pt-2 border-t border-white/10">
                          <span className="font-medium text-purple-300">⏱️ Response Time:</span>{" "}
                          <span className="text-white/70">{timeDiffFormatted}</span>
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

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

              {/* Labels and Comments */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0">
                    <div className="text-sm text-white/80 mb-2">Labels:</div>
                    <div className="relative inline-block" ref={labelsDropdownRef}>
                  <button
                    type="button"
                    className="min-w-[14rem] inline-flex flex-wrap items-center gap-2 rounded-md border border-white/20 bg-white/10 hover:bg-white/20 px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-white/30 cursor-pointer"
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
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/80 mb-2">Comments:</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add a comment..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment();
                          }
                        }}
                        className="flex-1 min-w-[20rem] border border-white/20 rounded-md px-3 py-2 text-sm bg-white/10 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                        disabled={addingComment}
                      />
                      <button
                        type="button"
                        onClick={handleAddComment}
                        disabled={addingComment || !commentText.trim()}
                        className="px-3 py-2 rounded-md border border-white/20 text-sm bg-[#3b89bf] hover:bg-[#04356d] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingComment ? "..." : "Add"}
                      </button>
                    </div>
                  </div>
                </div>
                {/* Display existing comments */}
                {selectedMessage.comments && selectedMessage.comments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {selectedMessage.comments.map((comment, idx) => (
                      <div
                        key={idx}
                        className="rounded-md border border-white/20 bg-white/5 p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="text-white/90 font-medium">{comment.text}</div>
                        </div>
                        <div className="text-white/60 text-xs">
                          {comment.author} • {comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lead Information - Only show essential fields */}
              <div className="rounded-xl border border-white/20 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white/80 mb-3">Lead Information:</div>
                <div className="space-y-2 text-sm text-white/80">
                  {selectedMessage.name && (
                    <div>
                      <span className="font-medium text-white/90">Name:</span>{" "}
                      <span className="text-white/70">{selectedMessage.name}</span>
                    </div>
                  )}
                  {selectedMessage.email && (
                    <div>
                      <span className="font-medium text-white/90">Email:</span>{" "}
                      <span className="text-white/70">{selectedMessage.email}</span>
                    </div>
                  )}
                  {selectedMessage.phone && (
                    <div>
                      <span className="font-medium text-white/90">Phone:</span>{" "}
                      <span className="text-white/70">{selectedMessage.phone}</span>
                    </div>
                  )}
                  {(selectedMessage.year || selectedMessage.make || selectedMessage.model) && (
                    <div>
                      <span className="font-medium text-white/90">Vehicle:</span>{" "}
                      <span className="text-white/70">
                        {[selectedMessage.year, selectedMessage.make, selectedMessage.model].filter(Boolean).join(" ")}
                      </span>
                    </div>
                  )}
                  {(!selectedMessage.name && !selectedMessage.email && !selectedMessage.phone && !selectedMessage.year && !selectedMessage.make && !selectedMessage.model) && (
                    <div className="text-white/60 italic">No lead information available</div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
        )}
      </div>
      )}

    </div>
  );
}

