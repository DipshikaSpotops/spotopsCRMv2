import moment from "moment-timezone";

const TZ = "America/Chicago";

const ESCALATION_HISTORY_RE =
  /Yard\s+\d+\s+status updated to\s+Escalation\s+by\s+.+?\s+on\s+(.+)$/i;

const CHICAGO_DT_FORMATS = [
  "D MMM, YYYY HH:mm",
  "D MMM YYYY HH:mm",
  "D MMM, YYYY H:mm",
  "D MMM YYYY H:mm",
];

/** Parse "27 May, 2026 10:49" as Dallas (America/Chicago) local time. */
export function parseChicagoHistoryDateTime(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  for (const fmt of CHICAGO_DT_FORMATS) {
    const m = moment.tz(raw, fmt, true, TZ);
    if (m.isValid()) return m;
  }
  return null;
}

/** First orderHistory line: "Yard N status updated to Escalation … on <date>". */
export function parseFirstEscalationMoment(orderHistory) {
  const entries = Array.isArray(orderHistory) ? orderHistory : [];
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    const match = entry.match(ESCALATION_HISTORY_RE);
    if (!match) continue;
    const parsed = parseChicagoHistoryDateTime(match[1]);
    if (parsed) return parsed;
  }
  return null;
}

/** Whole calendar days in Dallas since escalation date; returns null if today or invalid. */
export function escalationDaysSince(escMoment) {
  if (!escMoment || !escMoment.isValid()) return null;
  const start = escMoment.clone().tz(TZ).startOf("day");
  const today = moment().tz(TZ).startOf("day");
  const days = today.diff(start, "days");
  return days > 0 ? days : null;
}

export function enrichOrderWithEscalationFields(order) {
  const escMoment = parseFirstEscalationMoment(order?.orderHistory);
  const escDays = escalationDaysSince(escMoment);
  return {
    ...order,
    _escDate: escMoment ? escMoment.toDate() : null,
    _escDays: escDays,
  };
}
