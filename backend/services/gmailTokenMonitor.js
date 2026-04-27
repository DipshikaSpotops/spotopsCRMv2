import { refreshAccessTokenIfNeeded } from "./googleAuth.js";

const DEFAULT_INTERVAL_MS = 20 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 5000;
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const state = {
  status: "idle",
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null,
  consecutiveFailures: 0,
  requiresReauth: false,
  alertConfigured: false,
  lastAlertAt: null,
  lastTrigger: null,
};

let monitorInterval = null;

function classifyTokenError(message = "") {
  const msg = String(message || "");
  if (msg.includes("Missing token.json")) return "not_configured";
  if (msg.includes("RAPT required") || msg.includes("invalid_rapt") || msg.includes("rapt_required")) return "rapt_required";
  if (msg.includes("invalid_grant") || msg.includes("refresh token") || msg.includes("re-authorize")) return "invalid_refresh";
  return "unknown_error";
}

async function sendAlertIfNeeded(classification, message) {
  if (!["rapt_required", "invalid_refresh"].includes(classification)) return;

  const now = Date.now();
  const lastAlertTime = state.lastAlertAt ? new Date(state.lastAlertAt).getTime() : 0;
  if (lastAlertTime && now - lastAlertTime < ALERT_COOLDOWN_MS) return;

  const webhookUrl = process.env.GMAIL_TOKEN_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  state.alertConfigured = true;
  const payload = {
    text: "[Gmail Token Alert] Re-authorization required",
    source: "gmail-token-monitor",
    classification,
    message,
    reauthUrl:
      process.env.NODE_ENV === "production"
        ? "https://www.spotops360.com/api/gmail/oauth2/url"
        : "http://localhost:5000/api/gmail/oauth2/url",
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[Token Monitor] Alert webhook failed with status ${response.status}`);
      return;
    }

    state.lastAlertAt = new Date().toISOString();
    console.log("[Token Monitor] Alert webhook sent successfully");
  } catch (err) {
    console.error("[Token Monitor] Alert webhook request failed:", err.message);
  }
}

export async function runGmailTokenHealthCheck(trigger = "manual") {
  const nowIso = new Date().toISOString();
  state.lastCheckedAt = nowIso;
  state.lastTrigger = trigger;

  try {
    await refreshAccessTokenIfNeeded();
    state.status = "healthy";
    state.lastSuccessAt = nowIso;
    state.lastError = null;
    state.consecutiveFailures = 0;
    state.requiresReauth = false;
    console.log(`[Token Monitor] [${nowIso}] Gmail token check passed (${trigger})`);
    return { ok: true, status: state.status };
  } catch (err) {
    const message = err?.message || "Unknown token refresh error";
    const classification = classifyTokenError(message);
    state.lastErrorAt = nowIso;
    state.lastError = message;
    state.consecutiveFailures += 1;

    if (classification === "not_configured") {
      state.status = "not_configured";
      state.requiresReauth = false;
      console.log(`[Token Monitor] [${nowIso}] token.json missing - Gmail not configured`);
      return { ok: false, status: state.status, classification };
    }

    state.status = classification;
    state.requiresReauth = ["rapt_required", "invalid_refresh"].includes(classification);
    console.error(`[Token Monitor] [${nowIso}] Token check failed (${classification}): ${message}`);
    await sendAlertIfNeeded(classification, message);
    return { ok: false, status: state.status, classification, message };
  }
}

export function startGmailTokenMonitor(options = {}) {
  const intervalMs = Number(options.intervalMs || process.env.GMAIL_TOKEN_CHECK_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const initialDelayMs = Number(options.initialDelayMs || DEFAULT_INITIAL_DELAY_MS);
  state.alertConfigured = !!process.env.GMAIL_TOKEN_ALERT_WEBHOOK_URL;

  if (monitorInterval) {
    clearInterval(monitorInterval);
  }

  setTimeout(() => {
    runGmailTokenHealthCheck("startup").catch(() => {});
  }, initialDelayMs);

  monitorInterval = setInterval(() => {
    runGmailTokenHealthCheck("scheduled").catch(() => {});
  }, intervalMs);

  console.log(`[Token Monitor] Started. Interval: ${Math.round(intervalMs / 1000)}s, alerts: ${state.alertConfigured ? "enabled" : "disabled"}`);
}

export function getGmailTokenMonitorState() {
  return { ...state };
}

