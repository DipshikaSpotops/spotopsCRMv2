import moment from "moment-timezone";
import GmailMessage from "../models/GmailMessage.js";
import { getGmailClient } from "./googleAuth.js";
import { detectAgent } from "./gmailPubSubService.js";

/** Calendar dates (YYYY-MM-DD) for inbound stats are interpreted in this zone. */
export const GMAIL_INBOUND_STATS_ZONE =
  process.env.GMAIL_STATS_INBOUND_TZ || "Asia/Kolkata";

/**
 * One "reporting day" for inbound volume: same calendar date D in IST,
 * from 16:30 IST through 06:00 IST the next calendar day (inclusive).
 */
export function reportingDayBoundsMs(dateYYYYMMDD, zone = GMAIL_INBOUND_STATS_ZONE) {
  const d = moment.tz(dateYYYYMMDD, "YYYY-MM-DD", zone);
  const start = d.clone().hour(16).minute(30).second(0).millisecond(0);
  const end = d.clone().add(1, "day").hour(6).minute(0).second(0).millisecond(0);
  return { startMs: start.valueOf(), endMs: end.valueOf() };
}

export function bucketInternalMsToReportingDay(
  internalMs,
  startDateStr,
  endDateStr,
  zone = GMAIL_INBOUND_STATS_ZONE
) {
  let cursor = moment.tz(startDateStr, "YYYY-MM-DD", zone);
  const last = moment.tz(endDateStr, "YYYY-MM-DD", zone);
  while (!cursor.isAfter(last, "day")) {
    const ds = cursor.format("YYYY-MM-DD");
    const { startMs, endMs } = reportingDayBoundsMs(ds, zone);
    if (internalMs >= startMs && internalMs <= endMs) return ds;
    cursor = cursor.add(1, "day");
  }
  return null;
}

const LIST_CONCURRENCY = Number(process.env.GMAIL_INBOUND_LIST_CONCURRENCY || 20);

/**
 * Live Gmail API: list messages in a loose date window, then filter by internalDate
 * and bucket into IST reporting days. Optional agent filter via detectAgent().
 */
export async function fetchInboundCountsFromGmailApi({
  startDateStr,
  endDateStr,
  agentEmailFilter,
}) {
  const zone = GMAIL_INBOUND_STATS_ZONE;
  const first = moment.tz(startDateStr, "YYYY-MM-DD", zone);
  const last = moment.tz(endDateStr, "YYYY-MM-DD", zone);
  const overallStartMs = reportingDayBoundsMs(first.format("YYYY-MM-DD"), zone).startMs;
  const overallEndMs = reportingDayBoundsMs(last.format("YYYY-MM-DD"), zone).endMs;

  const gmail = await getGmailClient();
  const qAfter = moment(first)
    .subtract(1, "day")
    .format("YYYY/MM/DD");
  const qBefore = moment(last)
    .add(2, "day")
    .format("YYYY/MM/DD");
  const q = `in:inbox after:${qAfter} before:${qBefore}`;

  const ids = [];
  let pageToken;
  do {
    const { data } = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: 500,
      pageToken,
    });
    for (const m of data.messages || []) {
      ids.push(m.id);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  const uniqueIds = [...new Set(ids)];
  const inboundByDate = new Map();
  let totalInboundFromGmail = 0;

  const lowerFilter = agentEmailFilter
    ? String(agentEmailFilter).toLowerCase()
    : null;

  for (let i = 0; i < uniqueIds.length; i += LIST_CONCURRENCY) {
    const chunk = uniqueIds.slice(i, i + LIST_CONCURRENCY);
    const rows = await Promise.all(
      chunk.map(async (id) => {
        try {
          const { data } = await gmail.users.messages.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Delivered-To", "Cc"],
          });
          const internalMs = data.internalDate != null ? Number(data.internalDate) : null;
          const headers = data.payload?.headers || [];
          return { internalMs, headers };
        } catch {
          return null;
        }
      })
    );

    for (const row of rows) {
      if (!row || row.internalMs == null) continue;
      if (row.internalMs < overallStartMs || row.internalMs > overallEndMs) continue;

      if (lowerFilter) {
        const detected = detectAgent(row.headers);
        if (!detected || detected.toLowerCase() !== lowerFilter) continue;
      }

      const dayKey = bucketInternalMsToReportingDay(
        row.internalMs,
        startDateStr,
        endDateStr,
        zone
      );
      if (!dayKey) continue;
      inboundByDate.set(dayKey, (inboundByDate.get(dayKey) || 0) + 1);
      totalInboundFromGmail += 1;
    }
  }

  return { inboundByDate, totalInboundFromGmail };
}

/** DB fallback using GmailMessage + same IST windows (internalDate / createdAt). */
export async function fetchInboundCountsFromMongoIst({
  startDateStr,
  endDateStr,
  agentEmailFilter,
}) {
  const zone = GMAIL_INBOUND_STATS_ZONE;
  const overallStartMs = reportingDayBoundsMs(
    moment.tz(startDateStr, "YYYY-MM-DD", zone).format("YYYY-MM-DD"),
    zone
  ).startMs;
  const overallEndMs = reportingDayBoundsMs(
    moment.tz(endDateStr, "YYYY-MM-DD", zone).format("YYYY-MM-DD"),
    zone
  ).endMs;

  const rangeMatch = {
    arrivalAt: {
      $gte: new Date(overallStartMs),
      $lte: new Date(overallEndMs),
    },
  };
  if (agentEmailFilter) {
    rangeMatch.agentEmail = new RegExp(
      `^${String(agentEmailFilter).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i"
    );
  }

  const rows = await GmailMessage.aggregate([
    {
      $addFields: {
        arrivalAt: { $ifNull: ["$internalDate", "$createdAt"] },
      },
    },
    { $match: rangeMatch },
    { $project: { arrivalAt: 1 } },
  ]);

  const inboundByDate = new Map();
  let totalInboundFromGmail = 0;

  for (const doc of rows) {
    const internalMs = doc.arrivalAt ? new Date(doc.arrivalAt).getTime() : null;
    if (internalMs == null) continue;

    const dayKey = bucketInternalMsToReportingDay(
      internalMs,
      startDateStr,
      endDateStr,
      zone
    );
    if (!dayKey) continue;
    inboundByDate.set(dayKey, (inboundByDate.get(dayKey) || 0) + 1);
    totalInboundFromGmail += 1;
  }

  return { inboundByDate, totalInboundFromGmail };
}
