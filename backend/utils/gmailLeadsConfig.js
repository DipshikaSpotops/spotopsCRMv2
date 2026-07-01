/**
 * Gmail lead intake toggle. Set GMAIL_LEADS_ENABLED=true to resume fetching/saving leads.
 * Default: false (paused) — flip env when ready to use 50starsauto111@gmail.com again.
 */
export function isGmailLeadsEnabled() {
  const raw = String(process.env.GMAIL_LEADS_ENABLED ?? "false").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export const GMAIL_LEADS_PAUSED_MESSAGE =
  "Gmail lead intake is paused. New leads from 50starsauto111@gmail.com are not being fetched or saved. Set GMAIL_LEADS_ENABLED=true on the server to resume.";

export function gmailLeadsPausedResponse(extra = {}) {
  return {
    messages: [],
    total: 0,
    leadsPaused: true,
    leadsEnabled: false,
    message: GMAIL_LEADS_PAUSED_MESSAGE,
    ...extra,
  };
}
