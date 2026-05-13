import moment from "moment-timezone";

/** Must match backend `GMAIL_INBOUND_STATS_ZONE` default (Asia/Kolkata). */
export const GMAIL_INBOUND_STATS_ZONE = "Asia/Kolkata";

/**
 * One inbound stats "reporting day" D: 05:30 IST on D through 05:00 IST on D+1 (inclusive).
 * Same rule as `backend/services/gmailInboundStats.js` `reportingDayBoundsMs`.
 */
export function reportingDayBoundsMs(dateYYYYMMDD, zone = GMAIL_INBOUND_STATS_ZONE) {
  const d = moment.tz(dateYYYYMMDD, "YYYY-MM-DD", zone);
  const start = d.clone().hour(5).minute(30).second(0).millisecond(0);
  const end = d.clone().add(1, "day").hour(5).minute(0).second(0).millisecond(0);
  return { startMs: start.valueOf(), endMs: end.valueOf() };
}

/**
 * Sorted YYYY-MM-DD keys D whose reporting window intersects [rangeStartIso, rangeEndIso].
 */
export function reportingDayKeysIntersectingRange(
  rangeStartIso,
  rangeEndIso,
  zone = GMAIL_INBOUND_STATS_ZONE
) {
  const startMs = new Date(rangeStartIso).getTime();
  const endMs = new Date(rangeEndIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return [];

  const keys = [];
  let d = moment(rangeStartIso).tz(zone).startOf("day").subtract(1, "day");
  const lastWalk = moment(rangeEndIso).tz(zone).startOf("day").add(1, "day");

  while (!d.isAfter(lastWalk, "day")) {
    const ds = d.format("YYYY-MM-DD");
    const { startMs: ws, endMs: we } = reportingDayBoundsMs(ds, zone);
    if (we >= startMs && ws <= endMs) keys.push(ds);
    d = d.add(1, "day");
  }
  return [...new Set(keys)].sort();
}
