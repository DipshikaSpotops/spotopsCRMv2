import moment from "moment-timezone";
import GmailMessage from "../models/GmailMessage.js";
import Lead from "../models/Lead.js";
import { extractStructuredFields } from "../utils/extractStructuredFields.js";
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
const PART_FULL_PARSE_MAX = Number(process.env.GMAIL_PART_PARSE_FULL_MAX || 200);

function extractHtmlFromGmailPayload(payload) {
  if (!payload) return "";
  function findHtmlPart(part) {
    if (!part) return null;
    if (part.mimeType === "text/html" && part.body?.data) {
      const raw = part.body.data.replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(raw, "base64").toString("utf-8");
    }
    if (part.parts) {
      for (const p of part.parts) {
        const found = findHtmlPart(p);
        if (found) return found;
      }
    }
    return null;
  }
  return findHtmlPart(payload) || "";
}

function partFromParsed(htmlOrSnippet) {
  if (!htmlOrSnippet) return "";
  const p = String(extractStructuredFields(htmlOrSnippet).partRequired || "").trim();
  return p;
}

/**
 * Per-part "Received" counts: Lead.partRequired, else parse GmailMessage body/snippet,
 * else optional Gmail API full message (for ids not in DB yet).
 */
async function buildPartWiseReceivedFromMessageIds(messageIds, options = {}) {
  const { gmail } = options;
  const partWiseReceived = new Map();
  if (!messageIds?.length) return partWiseReceived;

  const uniq = [...new Set(messageIds)];
  const resolved = new Map();

  const leads = await Lead.find({ messageId: { $in: uniq } })
    .select("messageId partRequired")
    .lean();
  for (const l of leads) {
    const p = String(l.partRequired || "").trim();
    if (p) resolved.set(l.messageId, p);
  }

  let missing = uniq.filter((id) => !resolved.has(id));
  if (missing.length) {
    const gdocs = await GmailMessage.find({ messageId: { $in: missing } })
      .select("messageId bodyHtml snippet")
      .lean();
    for (const g of gdocs) {
      let p = partFromParsed(g.bodyHtml || "");
      if (!p) p = partFromParsed(g.snippet || "");
      if (p) resolved.set(g.messageId, p);
    }
    missing = uniq.filter((id) => !resolved.has(id));
  }

  if (gmail && missing.length > 0) {
    let fullFetchesDone = 0;
    const conc = Math.min(LIST_CONCURRENCY, 15);
    for (let i = 0; i < missing.length && fullFetchesDone < PART_FULL_PARSE_MAX; i += conc) {
      const room = PART_FULL_PARSE_MAX - fullFetchesDone;
      const chunk = missing.slice(i, i + conc).slice(0, room);
      if (chunk.length === 0) break;
      const rows = await Promise.all(
        chunk.map(async (id) => {
          try {
            const { data } = await gmail.users.messages.get({
              userId: "me",
              id,
              format: "full",
            });
            const html = extractHtmlFromGmailPayload(data.payload);
            const p = partFromParsed(html);
            return { id, p };
          } catch {
            return { id, p: "" };
          }
        })
      );
      fullFetchesDone += chunk.length;
      for (const row of rows) {
        if (row.p) resolved.set(row.id, row.p);
      }
    }
  }

  for (const mid of uniq) {
    const part = resolved.get(mid);
    if (!part) continue;
    partWiseReceived.set(part, (partWiseReceived.get(part) || 0) + 1);
  }

  return partWiseReceived;
}

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
  const acceptedMessageIds = [];

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
          return { id, internalMs, headers };
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
      acceptedMessageIds.push(row.id);
    }
  }

  const partWiseReceived = await buildPartWiseReceivedFromMessageIds(acceptedMessageIds, {
    gmail,
  });

  return { inboundByDate, totalInboundFromGmail, partWiseReceived };
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
    { $project: { arrivalAt: 1, messageId: 1 } },
  ]);

  const inboundByDate = new Map();
  let totalInboundFromGmail = 0;
  const acceptedMessageIds = [];

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
    if (doc.messageId) acceptedMessageIds.push(doc.messageId);
  }

  let gmailForParts = null;
  try {
    gmailForParts = await getGmailClient();
  } catch {
    /* optional */
  }
  const partWiseReceived = await buildPartWiseReceivedFromMessageIds(acceptedMessageIds, {
    gmail: gmailForParts,
  });

  return { inboundByDate, totalInboundFromGmail, partWiseReceived };
}
