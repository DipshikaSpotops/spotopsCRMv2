/**
 * Trace which eligible messages land in partKey "Others" (production buildPartWise path).
 * Usage: node scripts/tracePartWiseOthers.js 2026-05-14
 */
import {
  fetchInboundCountsFromGmailApi,
  buildPartWiseReceivedFromMessageIds,
  GMAIL_INBOUND_STATS_ZONE,
} from "../services/gmailInboundStats.js";
import { getGmailClient } from "../services/googleAuth.js";
import { labelsIncludeInvalidDisposition } from "../utils/invalidLeadDispositionLabels.js";
import { normalizePartRequiredLabel } from "../utils/normalizePartRequiredLabel.js";
import { resolvePartRequired } from "../utils/extractStructuredFields.js";

const REPORT_PARTS = new Set(["Anti Lock Braking", "Engine", "Transmission"]);
const dateStr = process.argv[2] || "2026-05-14";

function detectBrand(row) {
  const hay = `${row.from || ""} ${row.subject || ""} ${row.snippet || ""}`.toLowerCase();
  if (hay.includes("prolane") || hay.includes("pro lane")) return "PROLANE";
  if (hay.includes("50stars") || hay.includes("50 stars")) return "50STARS";
  const lower = new Set((row.labels || []).map((l) => String(l).toLowerCase()));
  for (const n of ["mark", "richard", "nick", "michael"]) {
    if (lower.has(n)) return "50STARS";
  }
  for (const n of ["victor", "sam", "noah", "charlie"]) {
    if (lower.has(n)) return "PROLANE";
  }
  return null;
}

const pack = await fetchInboundCountsFromGmailApi({
  startDateStr: dateStr,
  endDateStr: dateStr,
  zone: GMAIL_INBOUND_STATS_ZONE,
});

const eligible = (pack.labelStatRows || []).filter(
  (row) =>
    row.dayKey === dateStr && !labelsIncludeInvalidDisposition(row.labels || [])
);

const brandByMessageId = new Map();
const snippetByMessageId = new Map();
const subjectByMessageId = new Map();
for (const row of eligible) {
  const b = detectBrand(row);
  if (b) brandByMessageId.set(row.messageId, b);
  snippetByMessageId.set(row.messageId, row.snippet || "");
  subjectByMessageId.set(row.messageId, row.subject || "");
}

const gmail = await getGmailClient();
const built = await buildPartWiseReceivedFromMessageIds(
  eligible.map((r) => r.messageId),
  {
    gmail,
    brandByMessageId,
    snippetByMessageId,
    subjectByMessageId,
    liveGmailOnly: true,
  }
);

console.log("partWise keys:", [...built.partWiseReceived.entries()]);
console.log("Others by brand:", built.partWiseReceivedByBrand.get("Others"));

const REPORT = new Set(["Anti Lock Braking", "Engine", "Transmission"]);
for (const row of eligible) {
  const raw = built.resolvedByMessageId?.get(row.messageId) || "";
  let partKey = raw ? normalizePartRequiredLabel(String(raw).trim()) : "Others";
  if (!partKey) partKey = "Others";
  const brand = brandByMessageId.get(row.messageId) || detectBrand(row);
  if (partKey !== "Others" && !REPORT.has(partKey)) {
  } else if (partKey === "Others" || !REPORT.has(partKey)) {
    if (partKey === "Others" || (partKey && !REPORT.has(partKey))) {
      console.log("\n--- buildPartWise bucket Others/non-report ---");
      console.log({
        messageId: row.messageId,
        brand,
        raw,
        partKey,
        subject: row.subject,
        labels: row.labels,
      });
    }
  }
}

for (const row of eligible) {
  const prelim = resolvePartRequired({ snippet: row.snippet, subject: row.subject });
  const prelimNorm = normalizePartRequiredLabel(prelim);
  const brand = brandByMessageId.get(row.messageId) || detectBrand(row);
  const reportPart = REPORT_PARTS.has(prelimNorm) ? prelimNorm : "Others";
  if (reportPart !== "Others") continue;
  console.log("\n--- Others (snippet+subject preview) ---");
  console.log({
    messageId: row.messageId,
    brand,
    subject: row.subject,
    prelim,
    prelimNorm,
    labels: row.labels,
    snippet: String(row.snippet || "").slice(0, 200),
  });
}
