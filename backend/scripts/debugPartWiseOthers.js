/**
 * List live Gmail messages counted as "Others" for 50STARS on a reporting day.
 * Usage: node scripts/debugPartWiseOthers.js 2026-05-14
 */
import {
  fetchInboundCountsFromGmailApi,
  GMAIL_INBOUND_STATS_ZONE,
  reportingDayBoundsMs,
} from "../services/gmailInboundStats.js";
import { normalizePartRequiredLabel } from "../utils/normalizePartRequiredLabel.js";
import { resolvePartRequired } from "../utils/extractStructuredFields.js";

const REPORT_PARTS = ["Anti Lock Braking", "Engine", "Others", "Transmission"];

function normalizeReportPart(partRequired = "") {
  const normalized = normalizePartRequiredLabel(partRequired);
  return REPORT_PARTS.includes(normalized) ? normalized : "Others";
}

const dateStr = process.argv[2] || "2026-05-14";
const zone = process.env.STATS_CALENDAR_ZONE || GMAIL_INBOUND_STATS_ZONE;
const { startMs, endMs } = reportingDayBoundsMs(dateStr, zone);

const pack = await fetchInboundCountsFromGmailApi({
  startDateStr: dateStr,
  endDateStr: dateStr,
  zone,
});

const BRAND_50 = "50STARS";

function detectBrand(row) {
  const hay = `${row.from || ""} ${row.subject || ""} ${row.snippet || ""}`.toLowerCase();
  if (hay.includes("prolane") || hay.includes("pro lane")) return "PROLANE";
  if (hay.includes("50stars") || hay.includes("50 stars")) return BRAND_50;
  const lower = new Set((row.labels || []).map((l) => String(l).toLowerCase()));
  for (const n of ["mark", "richard", "nick", "michael"]) {
    if (lower.has(n)) return BRAND_50;
  }
  for (const n of ["victor", "sam", "noah", "charlie"]) {
    if (lower.has(n)) return "PROLANE";
  }
  return null;
}

const others50 = [];

for (const row of pack.labelStatRows || []) {
  if (row.dayKey !== dateStr) continue;
  if (detectBrand(row) !== BRAND_50) continue;

  const rawPart = resolvePartRequired({ snippet: row.snippet, subject: row.subject });
  const reportBucket = normalizeReportPart(rawPart);

  if (reportBucket !== "Others") continue;

  others50.push({
    messageId: row.messageId,
    from: row.from,
    subject: row.subject,
    rawPart: rawPart || "(empty — no Part Required in email body)",
    fullNormalized: rawPart ? normalizePartRequiredLabel(rawPart) : "(empty)",
    labels: row.labels || [],
    snippetPreview: String(row.snippet || "").slice(0, 280).replace(/\s+/g, " "),
  });
}

console.log(`Reporting day ${dateStr} (${zone})`);
console.log(`Window UTC: ${new Date(startMs).toISOString()} → ${new Date(endMs).toISOString()}`);
console.log(`50STARS rows in "Others" report bucket: ${others50.length}\n`);

for (const o of others50) {
  console.log("---");
  console.log("messageId:", o.messageId);
  console.log("From:", o.from);
  console.log("Subject:", o.subject);
  console.log("Part in email:", o.rawPart);
  if (o.fullNormalized !== o.rawPart && o.fullNormalized !== "(empty)") {
    console.log("Parsed as part type:", o.fullNormalized, "→ rolled up to Others in stats table");
  }
  console.log("Gmail labels:", o.labels.join(", ") || "(none)");
  console.log("Snippet:", o.snippetPreview);
}

if (!others50.length) {
  console.log("None found. Check date (Dallas picker day vs IST reporting day) or Gmail auth.");
}
