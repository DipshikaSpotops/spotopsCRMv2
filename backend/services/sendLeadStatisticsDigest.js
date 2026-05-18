import moment from "moment-timezone";
import Lead from "../models/Lead.js";
import {
  buildPartWiseReceivedFromMessageIds,
  fetchInboundCountsFromGmailApi,
  GMAIL_INBOUND_STATS_ZONE,
  reportingDayBoundsMs,
} from "./gmailInboundStats.js";
import { getGmailClient } from "./googleAuth.js";
import { resolvePartRequired } from "../utils/extractStructuredFields.js";
import { labelsIncludeInvalidDisposition } from "../utils/invalidLeadDispositionLabels.js";
import { normalizePartRequiredLabel } from "../utils/normalizePartRequiredLabel.js";
import { createGmailServiceTransport } from "../utils/serviceGmailTransport.js";

const IST_ZONE = GMAIL_INBOUND_STATS_ZONE || "Asia/Kolkata";
const RECIPIENTS = [
  "dipsikha.spotopsdigital@gmail.com",
  "50starsauto110@gmail.com",
];

// Send at 4:30 PM IST every day.
const SEND_HOUR_IST = 16;
const SEND_MINUTE_IST = 30;

// In-memory guard to avoid duplicate sends during same day/runtime.
let lastDigestKeySent = "";

const REPORT_PARTS = [
  "Anti Lock Braking",
  "Engine",
  "Others",
  "Transmission",
];

/** Column order for digest HTML tables (part-wise + sales agent). */
const DIGEST_PART_COLUMNS = [
  "Anti Lock Braking",
  "Engine",
  "Transmission",
  "Invalid",
  "Others",
];

const BRAND_SALES_LABEL_NAMES = {
  "50STARS": ["Mark", "Richard", "Nick", "Michael"],
  PROLANE: ["Victor", "Sam", "Noah", "Charlie"],
};

function detectBrandFromLead(lead = {}) {
  const hay = `${lead?.from || ""} ${lead?.subject || ""} ${lead?.snippet || ""}`.toLowerCase();
  if (hay.includes("prolane") || hay.includes("pro lane")) return "PROLANE";
  if (hay.includes("50stars") || hay.includes("50 stars")) return "50STARS";

  const labels = [
    ...(Array.isArray(lead?.labels) ? lead.labels : []),
    lead?.salesAgent,
  ]
    .map((label) => String(label || "").trim().toLowerCase())
    .filter(Boolean);
  const labelSet = new Set(labels);

  for (const [brand, names] of Object.entries(BRAND_SALES_LABEL_NAMES)) {
    if (names.some((name) => labelSet.has(name.toLowerCase()))) return brand;
  }
  return "";
}

function pickSalesAgentNameFromLabels(labels = []) {
  const lower = new Set((labels || []).map((label) => String(label || "").trim().toLowerCase()));
  for (const name of BRAND_SALES_LABEL_NAMES["50STARS"]) {
    if (lower.has(name.toLowerCase())) return name;
  }
  for (const name of BRAND_SALES_LABEL_NAMES.PROLANE) {
    if (lower.has(name.toLowerCase())) return name;
  }
  return "";
}

function partRequiredFromLeadRow(row = {}) {
  return resolvePartRequired({
    snippet: row.snippet,
    subject: row.subject,
  });
}

function normalizeReportPart(partRequired = "") {
  const raw = String(partRequired || "").trim();
  if (raw === "Invalid") return "Invalid";
  const normalized = normalizePartRequiredLabel(partRequired);
  if (normalized === "Invalid") return "Invalid";
  return REPORT_PARTS.includes(normalized) ? normalized : "Others";
}

function incrementMap(map, rawPart, count = 1) {
  const part = normalizeReportPart(rawPart);
  map.set(part, (map.get(part) || 0) + (Number(count) || 0));
}

function incrementBrandMap(map, rawPart, brand, count = 1) {
  if (brand !== "50STARS" && brand !== "PROLANE") return;
  const part = normalizeReportPart(rawPart);
  const current = map.get(part) || { "50STARS": 0, PROLANE: 0 };
  current[brand] = (current[brand] || 0) + (Number(count) || 0);
  map.set(part, current);
}

function createSalesAgentPartMatrixSeed() {
  const createAgentRow = () => ({
    "Anti Lock Braking": 0,
    Engine: 0,
    Others: 0,
    Transmission: 0,
    Invalid: 0,
    total: 0,
  });
  return {
    "50STARS": Object.fromEntries(BRAND_SALES_LABEL_NAMES["50STARS"].map((agent) => [agent, createAgentRow()])),
    PROLANE: Object.fromEntries(BRAND_SALES_LABEL_NAMES.PROLANE.map((agent) => [agent, createAgentRow()])),
  };
}

function incrementSalesAgentPartMatrix(matrix, brand, salesAgent, partRequired, options = {}) {
  if (brand !== "50STARS" && brand !== "PROLANE") return;
  const agent = String(salesAgent || "").trim().split(/\s+/)[0];
  if (!agent) return;
  if (!matrix[brand]) matrix[brand] = {};
  if (!matrix[brand][agent]) {
    matrix[brand][agent] = {
      "Anti Lock Braking": 0,
      Engine: 0,
      Others: 0,
      Transmission: 0,
      Invalid: 0,
      total: 0,
    };
  }
  if (options?.asInvalid) {
    matrix[brand][agent].Invalid = (matrix[brand][agent].Invalid || 0) + 1;
    matrix[brand][agent].total = (matrix[brand][agent].total || 0) + 1;
    return;
  }
  const part = normalizeReportPart(partRequired);
  matrix[brand][agent][part] = (matrix[brand][agent][part] || 0) + 1;
  matrix[brand][agent].total = (matrix[brand][agent].total || 0) + 1;
}

function mapFromObject(obj = {}) {
  const out = new Map();
  Object.entries(obj || {}).forEach(([part, count]) => incrementMap(out, part, count));
  return out;
}

function brandMapFromObject(obj = {}) {
  const out = new Map();
  Object.entries(obj || {}).forEach(([part, counts]) => {
    incrementBrandMap(out, part, "50STARS", counts?.["50STARS"]);
    incrementBrandMap(out, part, "PROLANE", counts?.PROLANE);
  });
  return out;
}

function buildPartWiseRows({ claimed, received, receivedByBrand }) {
  const claimedMap = claimed instanceof Map ? claimed : mapFromObject(claimed);
  const receivedMap = received instanceof Map ? received : mapFromObject(received);
  const receivedBrandMap =
    receivedByBrand instanceof Map ? receivedByBrand : brandMapFromObject(receivedByBrand);

  return DIGEST_PART_COLUMNS.map((partRequired) => {
    const received50Stars = receivedBrandMap.get(partRequired)?.["50STARS"] || 0;
    const receivedProlane = receivedBrandMap.get(partRequired)?.PROLANE || 0;
    return {
      partRequired,
      received50Stars,
      receivedProlane,
      claimedOverall: claimedMap.get(partRequired) || 0,
      receivedOverall: receivedMap.get(partRequired) || received50Stars + receivedProlane,
    };
  });
}

function renderPartWiseTableHtml(title, rows) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.received50Stars += Number(row.received50Stars) || 0;
      acc.receivedProlane += Number(row.receivedProlane) || 0;
      acc.claimedOverall += Number(row.claimedOverall) || 0;
      acc.receivedOverall += Number(row.receivedOverall) || 0;
      return acc;
    },
    { received50Stars: 0, receivedProlane: 0, claimedOverall: 0, receivedOverall: 0 }
  );

  const rowHtml = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;font-weight:600;">${row.partRequired}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.received50Stars}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.receivedProlane}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:600;">${row.claimedOverall}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:600;">${row.receivedOverall}</td>
        </tr>
      `
    )
    .join("");

  const totalRowHtml = `
        <tr style="background:#d9efc1;font-weight:700;">
          <td style="padding:6px 8px;border:1px solid #b8c7dc;">Total</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.received50Stars}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.receivedProlane}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.claimedOverall}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.receivedOverall}</td>
        </tr>
      `;

  return `
    <div style="margin-bottom:18px;">
      <div style="font-weight:700;background:#f2b183;padding:7px 10px;border:1px solid #d49d72;">${title}</div>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#cfe0f3;">
            <th style="padding:6px 8px;border:1px solid #b8c7dc;text-align:left;">Part Required</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">50STARS (received)</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">PROLANE (received)</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Overall Claimed</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Overall Received</th>
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
        <tfoot>${totalRowHtml}</tfoot>
      </table>
    </div>
  `;
}

function buildSalesAgentPartRowsByBrand(matrixByBrand = {}) {
  const makeRows = (brand) => {
    const brandMatrix = matrixByBrand?.[brand] || {};
    // Only canonical agents for this brand so cross-team names never appear in the wrong table.
    const orderedAgents = [...(BRAND_SALES_LABEL_NAMES[brand] || [])];
    return orderedAgents
      .map((agent) => {
        const counts = brandMatrix?.[agent] || {};
        const row = {
          agent,
          counts: Object.fromEntries(DIGEST_PART_COLUMNS.map((part) => [part, Number(counts?.[part]) || 0])),
          total: Number(counts?.total) || 0,
        };
        if (!row.total) {
          row.total = DIGEST_PART_COLUMNS.reduce((sum, part) => sum + (row.counts?.[part] || 0), 0);
        }
        return row;
      })
      .filter((row) => row.total > 0);
  };

  return {
    "50STARS": makeRows("50STARS"),
    PROLANE: makeRows("PROLANE"),
  };
}

function renderSalesAgentPartTableHtml(title, rows) {
  const emptyTotals = Object.fromEntries(DIGEST_PART_COLUMNS.map((p) => [p, 0]));
  emptyTotals.total = 0;

  const bodyHtml =
    rows.length === 0
      ? `<tr><td colspan="${DIGEST_PART_COLUMNS.length + 2}" style="padding:8px;border:1px solid #b8c7dc;text-align:center;color:#667;">No live Gmail part data found.</td></tr>`
      : rows
          .map(
            (row) => `
              <tr>
                <td style="padding:6px 8px;border:1px solid #b8c7dc;font-weight:600;">${row.agent}</td>
                ${DIGEST_PART_COLUMNS.map(
                  (part) =>
                    `<td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.counts?.[part] || 0}</td>`
                ).join("")}
                <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:600;">${row.total || 0}</td>
              </tr>
            `
          )
          .join("");

  const totals =
    rows.length === 0
      ? emptyTotals
      : rows.reduce((acc, row) => {
          DIGEST_PART_COLUMNS.forEach((part) => {
            acc[part] += row.counts?.[part] || 0;
          });
          acc.total += row.total || 0;
          return acc;
        }, { ...emptyTotals });

  const totalHtml =
    rows.length === 0
      ? ""
      : `
          <tr style="background:#d9efc1;font-weight:700;">
            <td style="padding:6px 8px;border:1px solid #b8c7dc;">Total</td>
          ${DIGEST_PART_COLUMNS.map(
            (part) =>
              `<td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals[part]}</td>`
          ).join("")}
            <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.total}</td>
        </tr>
      `;

  return `
    <div style="margin-bottom:18px;">
      <div style="font-weight:700;background:#f2b183;padding:7px 10px;border:1px solid #d49d72;">${title}</div>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#cfe0f3;">
            <th style="padding:6px 8px;border:1px solid #b8c7dc;text-align:left;">Sales Agent</th>
            ${DIGEST_PART_COLUMNS.map(
              (part) => `<th style="padding:6px 8px;border:1px solid #b8c7dc;">${part}</th>`
            ).join("")}
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Total</th>
          </tr>
        </thead>
        <tbody>${bodyHtml}${totalHtml}</tbody>
      </table>
    </div>
  `;
}

function getDefaultDigestDate(nowIst = moment.tz(IST_ZONE)) {
  return nowIst.clone().subtract(1, "day").format("YYYY-MM-DD");
}

function getWindowForDigest(startDateStr, endDateStr, zone = IST_ZONE) {
  const startBounds = reportingDayBoundsMs(startDateStr, zone);
  const endBounds = reportingDayBoundsMs(endDateStr, zone);
  return {
    windowStart: moment.tz(startBounds.startMs, zone),
    windowEnd: moment.tz(endBounds.endMs, zone),
  };
}

function formatDateRangeLabel(startDateStr, endDateStr) {
  const start = moment.tz(startDateStr, "YYYY-MM-DD", IST_ZONE);
  const end = moment.tz(endDateStr, "YYYY-MM-DD", IST_ZONE);
  if (startDateStr === endDateStr) return start.format("D MMM YYYY");
  return `${start.format("D MMM YYYY")} - ${end.format("D MMM YYYY")}`;
}

async function fetchClaimedPartStats({ start, end, salesAgentFirstName }) {
  const match = {
    claimedAt: { $gte: start, $lte: end },
    partRequired: { $regex: /\S/ },
  };
  const fn = String(salesAgentFirstName || "").trim();
  if (fn) match.salesAgent = fn;

  const leads = await Lead.find(match)
    .select("messageId partRequired from subject labels salesAgent claimedAt")
    .lean();

  const claimed = new Map();
  const claimedByBrand = new Map();
  const salesAgentPartMatrixByBrand = createSalesAgentPartMatrixSeed();
  const seen = new Set();

  leads.forEach((lead) => {
    const leadKey = lead?.messageId || lead?._id?.toString();
    if (!leadKey || seen.has(leadKey)) return;
    seen.add(leadKey);

    if (labelsIncludeInvalidDisposition(lead.labels || [])) {
      incrementMap(claimed, "Invalid", 1);
      const brand = detectBrandFromLead(lead);
      incrementBrandMap(claimedByBrand, "Invalid", brand, 1);
      incrementSalesAgentPartMatrix(salesAgentPartMatrixByBrand, brand, lead.salesAgent, null, {
        asInvalid: true,
      });
      return;
    }

    incrementMap(claimed, lead.partRequired, 1);
    const brand = detectBrandFromLead(lead);
    incrementBrandMap(claimedByBrand, lead.partRequired, brand, 1);
    incrementSalesAgentPartMatrix(salesAgentPartMatrixByBrand, brand, lead.salesAgent, lead.partRequired);
  });

  return { claimed, claimedByBrand, salesAgentPartMatrixByBrand };
}

async function buildDigestData({
  startDate,
  endDate,
  salesAgentFirstName,
} = {}) {
  const nowIst = moment.tz(IST_ZONE);
  const startDateStr = startDate || getDefaultDigestDate(nowIst);
  const endDateStr = endDate || startDateStr;
  const { windowStart, windowEnd } = getWindowForDigest(startDateStr, endDateStr, IST_ZONE);

  const [inboundPack, claimedPack] = await Promise.all([
    fetchInboundCountsFromGmailApi({
      startDateStr,
      endDateStr,
      zone: IST_ZONE,
    }),
    fetchClaimedPartStats({
      start: windowStart.toDate(),
      end: windowEnd.toDate(),
      salesAgentFirstName,
    }),
  ]);

  let received = inboundPack.partWiseReceived;
  let receivedByBrand = inboundPack.partWiseReceivedByBrand;
  let liveRowsForPartMatrix = Array.isArray(inboundPack.labelStatRows)
    ? inboundPack.labelStatRows
    : [];
  if (salesAgentFirstName) {
    const agentLabel = String(salesAgentFirstName).trim().toLowerCase();
    const rowsForAgent = (inboundPack.labelStatRows || []).filter((row) =>
      (row.labels || []).some((label) => String(label).trim().toLowerCase() === agentLabel)
    );
    liveRowsForPartMatrix = rowsForAgent;
    const gmail = await getGmailClient();
    const snippetByMessageId = new Map(
      rowsForAgent.map((row) => [row.messageId, row.snippet || ""]).filter(([id]) => Boolean(id))
    );
    const subjectByMessageId = new Map(
      rowsForAgent.map((row) => [row.messageId, row.subject || ""]).filter(([id]) => Boolean(id))
    );
    const brandByMessageId = new Map();
    rowsForAgent.forEach((row) => {
      const brand = detectBrandFromLead(row);
      if (brand) brandByMessageId.set(row.messageId, brand);
    });
    const eligibleIds = rowsForAgent
      .filter((row) => !labelsIncludeInvalidDisposition(row.labels || []))
      .map((row) => row.messageId)
      .filter(Boolean);
    const rebuilt = await buildPartWiseReceivedFromMessageIds(eligibleIds, {
      gmail,
      brandByMessageId,
      snippetByMessageId,
      subjectByMessageId,
      liveGmailOnly: true,
    });
    let invalidReceived = 0;
    const invalidReceivedByBrand = { "50STARS": 0, PROLANE: 0 };
    for (const row of rowsForAgent) {
      if (!labelsIncludeInvalidDisposition(row.labels || [])) continue;
      invalidReceived += 1;
      const brand = detectBrandFromLead(row);
      if (brand === "50STARS" || brand === "PROLANE") invalidReceivedByBrand[brand] += 1;
    }
    rebuilt.partWiseReceived.set("Invalid", invalidReceived);
    rebuilt.partWiseReceivedByBrand.set("Invalid", { ...invalidReceivedByBrand });
    received = rebuilt.partWiseReceived;
    receivedByBrand = rebuilt.partWiseReceivedByBrand;
  }

  const rows = buildPartWiseRows({
    claimed: claimedPack.claimed,
    received,
    receivedByBrand,
  });
  const liveSalesAgentPartMatrixByBrand = createSalesAgentPartMatrixSeed();
  liveRowsForPartMatrix.forEach((row) => {
    const brand = detectBrandFromLead(row);
    const inv = labelsIncludeInvalidDisposition(row.labels || []);
    incrementSalesAgentPartMatrix(
      liveSalesAgentPartMatrixByBrand,
      brand,
      pickSalesAgentNameFromLabels(row.labels || []),
      partRequiredFromLeadRow(row),
      inv ? { asInvalid: true } : {}
    );
  });
  const salesAgentPartRowsByBrand = buildSalesAgentPartRowsByBrand(liveSalesAgentPartMatrixByBrand);

  return {
    rows,
    salesAgentPartRowsByBrand,
    windowStart,
    windowEnd,
    startDateStr,
    endDateStr,
  };
}

export async function sendLeadStatisticsDigest({
  force = false,
  startDate,
  endDate,
  agentEmailFilter,
  salesAgentFirstName,
} = {}) {
  const nowIst = moment.tz(IST_ZONE);
  const startDateStr = startDate || getDefaultDigestDate(nowIst);
  const endDateStr = endDate || startDateStr;
  const digestKey = `${startDateStr}:${endDateStr}:${agentEmailFilter || ""}:${salesAgentFirstName || ""}`;
  if (!force && lastDigestKeySent === digestKey) {
    return { skipped: true, reason: "already_sent_today" };
  }

  const smtpUser =
    process.env.SMTP_USER?.trim() ||
    process.env.SERVICE_EMAIL?.trim() ||
    process.env.SERVICE_EMAIL_50STARS?.trim();
  const smtpPassRaw =
    process.env.SMTP_PASS?.trim() ||
    process.env.SERVICE_PASS?.trim() ||
    process.env.SERVICE_PASS_50STARS?.trim();
  const smtpPass = String(smtpPassRaw || "").replace(/\s+/g, "").trim();

  if (!smtpUser || !smtpPass) {
    console.warn("[Lead Digest] SMTP credentials missing. Skipping digest email.");
    return;
  }

  const { rows, salesAgentPartRowsByBrand, windowStart, windowEnd } = await buildDigestData({
    startDate: startDateStr,
    endDate: endDateStr,
    salesAgentFirstName,
  });

  const transporter = createGmailServiceTransport(smtpUser, smtpPass);
  const dayLabel = formatDateRangeLabel(startDateStr, endDateStr);

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1f2d3d;">
      <h3 style="margin:0 0 6px 0;">Lead Statistics Digest</h3>
      <div style="margin-bottom:12px;color:#4a5b6d;font-size:13px;">
        Window (IST): ${windowStart.format("DD MMM YYYY hh:mm A")} to ${windowEnd.format(
          "DD MMM YYYY hh:mm A"
        )}
      </div>
      ${renderPartWiseTableHtml(`Part-wise Leads - ${dayLabel}`, rows)}
      ${renderSalesAgentPartTableHtml(
        `50STARS - Part-wise by Sales Agent - ${dayLabel}`,
        salesAgentPartRowsByBrand["50STARS"] || []
      )}
      ${renderSalesAgentPartTableHtml(
        `PROLANE - Part-wise by Sales Agent - ${dayLabel}`,
        salesAgentPartRowsByBrand.PROLANE || []
      )}
    </div>
  `;

  await transporter.sendMail({
    from: `"Lead Statistics" <${smtpUser}>`,
    to: RECIPIENTS.join(", "),
    subject: `Lead Statistics Report - ${dayLabel}`,
    html,
    text: `Lead Statistics Report (${dayLabel})`,
  });

  lastDigestKeySent = digestKey;
  console.log(`[Lead Digest] Sent successfully for key=${digestKey}`);
  return {
    skipped: false,
    key: digestKey,
    recipients: RECIPIENTS,
    dayLabel,
    startDate: startDateStr,
    endDate: endDateStr,
  };
}

export function startLeadStatisticsDigestScheduler() {
  const runner = async () => {
    try {
      const nowIst = moment.tz(IST_ZONE);
      const isSendTime =
        nowIst.hour() === SEND_HOUR_IST && nowIst.minute() === SEND_MINUTE_IST;
      if (!isSendTime) return;
      await sendLeadStatisticsDigest();
    } catch (err) {
      console.error("[Lead Digest] scheduler error:", err?.message || err);
    }
  };

  // Check every 30 seconds for minute-level schedule.
  setInterval(runner, 30 * 1000);

  console.log(
    `[Lead Digest] Scheduler started (IST ${String(SEND_HOUR_IST).padStart(
      2,
      "0"
    )}:${String(SEND_MINUTE_IST).padStart(2, "0")})`
  );
}
