import moment from "moment-timezone";
import GmailMessage from "../models/GmailMessage.js";
import Lead from "../models/Lead.js";
import { extractStructuredFields } from "../utils/extractStructuredFields.js";
import { labelsIncludeInvalidDisposition } from "../utils/invalidLeadDispositionLabels.js";
import { normalizePartRequiredLabel } from "../utils/normalizePartRequiredLabel.js";
import { getGmailClient } from "./googleAuth.js";

/** Calendar dates (YYYY-MM-DD) for inbound stats are interpreted in this zone. */
export const GMAIL_INBOUND_STATS_ZONE =
  process.env.GMAIL_STATS_INBOUND_TZ || "Asia/Kolkata";

/**
 * One "reporting day" for inbound volume: same calendar date D in IST,
 * from 05:30 IST on D through 05:00 IST the next calendar day (inclusive).
 */
export function reportingDayBoundsMs(dateYYYYMMDD, zone = GMAIL_INBOUND_STATS_ZONE) {
  const d = moment.tz(dateYYYYMMDD, "YYYY-MM-DD", zone);
  const start = d.clone().hour(5).minute(30).second(0).millisecond(0);
  const end = d.clone().add(1, "day").hour(5).minute(0).second(0).millisecond(0);
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
const BRAND_50STARS = "50STARS";
const BRAND_PROLANE = "PROLANE";

/** Same first-name labels as CRM / gmailController — used when headers lack brand text. */
const BRAND_SALES_LABEL_NAMES = {
  [BRAND_50STARS]: ["Mark", "Richard", "Nick", "Michael"],
  [BRAND_PROLANE]: ["Victor", "Sam", "Noah", "Charlie"],
};

/**
 * Infer 50STARS vs PROLANE from Gmail user label names (distribution queue labels).
 */
function inferLeadBrandFromGmailLabelNames(labelNames = []) {
  const lower = new Set(
    labelNames.map((l) => String(l || "").trim().toLowerCase()).filter(Boolean)
  );
  let hitStars = false;
  let hitPro = false;
  for (const n of BRAND_SALES_LABEL_NAMES[BRAND_50STARS]) {
    if (lower.has(String(n || "").toLowerCase())) hitStars = true;
  }
  for (const n of BRAND_SALES_LABEL_NAMES[BRAND_PROLANE]) {
    if (lower.has(String(n || "").toLowerCase())) hitPro = true;
  }
  if (hitStars && !hitPro) return BRAND_50STARS;
  if (hitPro && !hitStars) return BRAND_PROLANE;
  return null;
}

function detectLeadBrandFromText(raw = "") {
  const lower = String(raw || "").toLowerCase();
  if (!lower) return null;
  // Prolane first: many lead templates/snippets mention both brands; 50STARS check alone hid all PROLANE (received).
  if (lower.includes("prolane") || lower.includes("pro lane")) return BRAND_PROLANE;
  if (lower.includes("50stars") || lower.includes("50 stars")) return BRAND_50STARS;
  return null;
}

function detectLeadBrandFromGmailLeanDoc(doc = {}) {
  const parts = [
    doc.from,
    doc.subject,
    ...(Array.isArray(doc.to) ? doc.to : []),
    ...(Array.isArray(doc.deliveredTo) ? doc.deliveredTo : []),
  ];
  return detectLeadBrandFromText(parts.join(" "));
}

function headerValueLower(headers, name) {
  const h = (headers || []).find(
    (x) => String(x?.name || "").toLowerCase() === String(name || "").toLowerCase()
  );
  return String(h?.value || "");
}

function detectLeadBrandFromMetadataHeaders(headers) {
  const haystack = [
    headerValueLower(headers, "From"),
    headerValueLower(headers, "Subject"),
    headerValueLower(headers, "To"),
    headerValueLower(headers, "Delivered-To"),
    headerValueLower(headers, "Cc"),
  ].join(" ");
  return detectLeadBrandFromText(haystack);
}

/**
 * Prefer brand from visible text (headers + snippet). Snippet often contains
 * "Prolane Auto Parts" / "50 Stars" even when the only user labels are cross-team (e.g. Richard on a Prolane lead).
 */
function detectLeadBrandFromLiveGmailRow(headers, snippet = "") {
  const headerHay = [
    headerValueLower(headers, "From"),
    headerValueLower(headers, "Subject"),
    headerValueLower(headers, "To"),
    headerValueLower(headers, "Delivered-To"),
    headerValueLower(headers, "Cc"),
  ].join(" ");
  return detectLeadBrandFromText([headerHay, String(snippet || "")].join("\n"));
}

function isSystemGmailLabelName(labelName = "") {
  const upper = String(labelName || "").toUpperCase();
  const system = new Set([
    "INBOX",
    "UNREAD",
    "IMPORTANT",
    "STARRED",
    "CATEGORY_PERSONAL",
    "CATEGORY_SOCIAL",
    "CATEGORY_PROMOTIONS",
    "CATEGORY_UPDATES",
    "CATEGORY_FORUMS",
    "SENT",
    "DRAFT",
    "SPAM",
    "TRASH",
    "CHAT",
  ]);
  return system.has(upper);
}

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
 * Per-part "Received" counts. Default: Lead → Mongo GmailMessage → live full fetch.
 * When `liveGmailOnly` + `snippetByMessageId`: skip DB and use snippets first, then full fetch for gaps.
 */
export async function buildPartWiseReceivedFromMessageIds(messageIds, options = {}) {
  const { gmail, snippetByMessageId, liveGmailOnly = false } = options;
  const partWiseReceived = new Map();
  const partWiseReceivedByBrand = new Map();
  const brandByMessageId = options.brandByMessageId instanceof Map ? options.brandByMessageId : new Map();
  if (!messageIds?.length) return { partWiseReceived, partWiseReceivedByBrand };

  const uniq = [...new Set(messageIds)];
  const resolved = new Map();

  if (snippetByMessageId instanceof Map) {
    for (const mid of uniq) {
      const sn = snippetByMessageId.get(mid);
      if (!sn) continue;
      const p = partFromParsed(sn);
      if (p) resolved.set(mid, p);
    }
  }

  let missing = uniq.filter((id) => !resolved.has(id));

  if (!liveGmailOnly && missing.length) {
    const leads = await Lead.find({ messageId: { $in: missing } })
      .select("messageId partRequired")
      .lean();
    for (const l of leads) {
      const p = String(l.partRequired || "").trim();
      if (p) resolved.set(l.messageId, p);
    }
    missing = uniq.filter((id) => !resolved.has(id));
  }

  if (!liveGmailOnly && missing.length) {
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

  const CANONICAL_OTHER = "Others";

  for (const mid of uniq) {
    const raw = resolved.get(mid);
    let partKey = "";
    if (raw && String(raw).trim()) {
      partKey = normalizePartRequiredLabel(String(raw).trim());
    }
    if (!partKey) partKey = CANONICAL_OTHER;

    partWiseReceived.set(partKey, (partWiseReceived.get(partKey) || 0) + 1);

    const brand = brandByMessageId.get(mid);
    if (brand === BRAND_50STARS || brand === BRAND_PROLANE) {
      if (!partWiseReceivedByBrand.has(partKey)) {
        partWiseReceivedByBrand.set(partKey, { [BRAND_50STARS]: 0, [BRAND_PROLANE]: 0 });
      }
      const current = partWiseReceivedByBrand.get(partKey);
      current[brand] = (current[brand] || 0) + 1;
      partWiseReceivedByBrand.set(partKey, current);
    }
  }

  return { partWiseReceived, partWiseReceivedByBrand };
}

/**
 * Live Gmail API: list messages in a loose date window, then filter by internalDate
 * and bucket into IST reporting days.
 */
export async function fetchInboundCountsFromGmailApi({
  startDateStr,
  endDateStr,
  agentEmailFilter,
  zone: zoneOverride,
}) {
  const zone = zoneOverride || GMAIL_INBOUND_STATS_ZONE;
  const first = moment.tz(startDateStr, "YYYY-MM-DD", zone);
  const last = moment.tz(endDateStr, "YYYY-MM-DD", zone);
  const overallStartMs = reportingDayBoundsMs(first.format("YYYY-MM-DD"), zone).startMs;
  const overallEndMs = reportingDayBoundsMs(last.format("YYYY-MM-DD"), zone).endMs;

  const gmail = await getGmailClient();

  let labelIdToName = new Map();
  try {
    const { data: labelsData } = await gmail.users.labels.list({ userId: "me" });
    labelIdToName = new Map(
      (Array.isArray(labelsData?.labels) ? labelsData.labels : []).map((l) => [l.id, l.name])
    );
  } catch {
    labelIdToName = new Map();
  }

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
  const partEligibleMessageIds = [];
  const brandByMessageId = new Map();
  /** One row per message in the stats window — used for label-wise / agent-matrix (live labelIds). */
  const labelStatRows = [];

  for (let i = 0; i < uniqueIds.length; i += LIST_CONCURRENCY) {
    const chunk = uniqueIds.slice(i, i + LIST_CONCURRENCY);
    const rows = await Promise.all(
      chunk.map(async (id) => {
        try {
          const { data } = await gmail.users.messages.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Delivered-To", "Cc", "Subject"],
          });
          const internalMs = data.internalDate != null ? Number(data.internalDate) : null;
          const headers = data.payload?.headers || [];
          const labelIds = Array.isArray(data.labelIds) ? data.labelIds : [];
          return {
            id,
            internalMs,
            headers,
            labelIds,
            snippet: String(data?.snippet || ""),
          };
        } catch {
          return null;
        }
      })
    );

    for (const row of rows) {
      if (!row || row.internalMs == null) continue;
      if (row.internalMs < overallStartMs || row.internalMs > overallEndMs) continue;

      const resolvedLabelNames = (row.labelIds || [])
        .map((lid) => labelIdToName.get(lid))
        .filter((name) => Boolean(name) && !isSystemGmailLabelName(name));

      let detectedBrand = detectLeadBrandFromLiveGmailRow(row.headers, row.snippet);
      if (!detectedBrand) {
        detectedBrand = inferLeadBrandFromGmailLabelNames(resolvedLabelNames);
      }
      if (detectedBrand) {
        brandByMessageId.set(row.id, detectedBrand);
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
      if (!labelsIncludeInvalidDisposition(resolvedLabelNames)) {
        partEligibleMessageIds.push(row.id);
      }

      labelStatRows.push({
        messageId: row.id,
        internalMs: row.internalMs,
        dayKey,
        snippet: row.snippet || "",
        from: headerValueLower(row.headers, "From"),
        subject: headerValueLower(row.headers, "Subject"),
        to: [],
        deliveredTo: [],
        labels: resolvedLabelNames,
        labelIds: [],
      });
    }
  }

  const snippetByMessageId = new Map(
    labelStatRows.map((r) => [r.messageId, r.snippet || ""]).filter(([id]) => Boolean(id))
  );
  const { partWiseReceived, partWiseReceivedByBrand } = await buildPartWiseReceivedFromMessageIds(
    partEligibleMessageIds,
    {
      gmail,
      brandByMessageId,
      snippetByMessageId,
      liveGmailOnly: true,
    }
  );

  let invalidReceived = 0;
  const invalidReceivedByBrand = { [BRAND_50STARS]: 0, [BRAND_PROLANE]: 0 };
  for (const row of labelStatRows) {
    if (!labelsIncludeInvalidDisposition(row.labels || [])) continue;
    invalidReceived += 1;
    const b = brandByMessageId.get(row.messageId);
    if (b === BRAND_50STARS || b === BRAND_PROLANE) {
      invalidReceivedByBrand[b] = (invalidReceivedByBrand[b] || 0) + 1;
    }
  }
  partWiseReceived.set("Invalid", invalidReceived);
  partWiseReceivedByBrand.set("Invalid", { ...invalidReceivedByBrand });

  return {
    inboundByDate,
    totalInboundFromGmail,
    partWiseReceived,
    partWiseReceivedByBrand,
    labelStatRows,
  };
}

/** DB fallback using GmailMessage + same IST windows (internalDate / createdAt). */
export async function fetchInboundCountsFromMongoIst({
  startDateStr,
  endDateStr,
  agentEmailFilter,
  zone: zoneOverride,
}) {
  const zone = zoneOverride || GMAIL_INBOUND_STATS_ZONE;
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
  // Do not filter by agentEmailFilter here — it is the CRM user's login email, not
  // GmailMessage.agentEmail (sales distribution inbox). That mismatch zeroed inbound stats.

  const rows = await GmailMessage.aggregate([
    {
      $addFields: {
        arrivalAt: { $ifNull: ["$internalDate", "$createdAt"] },
      },
    },
    { $match: rangeMatch },
    {
      $project: {
        arrivalAt: 1,
        messageId: 1,
        from: 1,
        subject: 1,
        to: 1,
        deliveredTo: 1,
        labels: 1,
      },
    },
  ]);

  const inboundByDate = new Map();
  let totalInboundFromGmail = 0;
  const acceptedMessageIds = [];
  const partEligibleMessageIds = [];
  const brandByMessageId = new Map();
  const rowsForInvalidRollup = [];

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
    if (doc.messageId) {
      acceptedMessageIds.push(doc.messageId);
      const detectedBrand = detectLeadBrandFromGmailLeanDoc(doc);
      if (detectedBrand) {
        brandByMessageId.set(doc.messageId, detectedBrand);
      }
      const labs = Array.isArray(doc.labels) ? doc.labels : [];
      rowsForInvalidRollup.push({ messageId: doc.messageId, labels: labs });
      if (!labelsIncludeInvalidDisposition(labs)) {
        partEligibleMessageIds.push(doc.messageId);
      }
    }
  }

  let gmailForParts = null;
  try {
    gmailForParts = await getGmailClient();
  } catch {
    /* optional */
  }
  const { partWiseReceived, partWiseReceivedByBrand } = await buildPartWiseReceivedFromMessageIds(
    partEligibleMessageIds,
    {
      gmail: gmailForParts,
      brandByMessageId,
    }
  );

  let invalidReceived = 0;
  const invalidReceivedByBrand = { [BRAND_50STARS]: 0, [BRAND_PROLANE]: 0 };
  for (const row of rowsForInvalidRollup) {
    if (!labelsIncludeInvalidDisposition(row.labels || [])) continue;
    invalidReceived += 1;
    const b = brandByMessageId.get(row.messageId);
    if (b === BRAND_50STARS || b === BRAND_PROLANE) {
      invalidReceivedByBrand[b] = (invalidReceivedByBrand[b] || 0) + 1;
    }
  }
  partWiseReceived.set("Invalid", invalidReceived);
  partWiseReceivedByBrand.set("Invalid", { ...invalidReceivedByBrand });

  return {
    inboundByDate,
    totalInboundFromGmail,
    partWiseReceived,
    partWiseReceivedByBrand,
    labelStatRows: [],
  };
}
