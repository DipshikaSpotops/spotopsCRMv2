import moment from "moment-timezone";
import Lead from "../models/Lead.js";
import {
  buildPartWiseReceivedFromMessageIds,
  fetchInboundCountsFromGmailApi,
  GMAIL_INBOUND_STATS_ZONE,
  reportingDayBoundsMs,
} from "./gmailInboundStats.js";
import { getGmailClient } from "./googleAuth.js";
import { extractStructuredFields } from "../utils/extractStructuredFields.js";
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

const BRAND_SALES_LABEL_NAMES = {
  "50STARS": ["Mark", "Richard", "Nick", "Charlie"],
  PROLANE: ["Victor", "Sam", "Noah", "Michael"],
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

function partRequiredFromSnippet(snippet = "") {
  return String(extractStructuredFields(String(snippet || "")).partRequired || "").trim();
}

function normalizeReportPart(partRequired = "") {
  const normalized = normalizePartRequiredLabel(partRequired);
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
    total: 0,
  });
  return {
    "50STARS": Object.fromEntries(BRAND_SALES_LABEL_NAMES["50STARS"].map((agent) => [agent, createAgentRow()])),
    PROLANE: Object.fromEntries(BRAND_SALES_LABEL_NAMES.PROLANE.map((agent) => [agent, createAgentRow()])),
  };
}

function incrementSalesAgentPartMatrix(matrix, brand, salesAgent, partRequired) {
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
      total: 0,
    };
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

function buildPartWiseRows({ claimed, claimedByBrand, received, receivedByBrand }) {
  const claimedMap = claimed instanceof Map ? claimed : mapFromObject(claimed);
  const claimedBrandMap =
    claimedByBrand instanceof Map ? claimedByBrand : brandMapFromObject(claimedByBrand);
  const receivedMap = received instanceof Map ? received : mapFromObject(received);
  const receivedBrandMap =
    receivedByBrand instanceof Map ? receivedByBrand : brandMapFromObject(receivedByBrand);

  return REPORT_PARTS.map((partRequired) => {
    const received50Stars = receivedBrandMap.get(partRequired)?.["50STARS"] || 0;
    const receivedProlane = receivedBrandMap.get(partRequired)?.PROLANE || 0;
    const claimed50Stars = claimedBrandMap.get(partRequired)?.["50STARS"] || 0;
    const claimedProlane = claimedBrandMap.get(partRequired)?.PROLANE || 0;
    return {
      partRequired,
      received50Stars,
      claimed50Stars,
      receivedProlane,
      claimedProlane,
      claimedOverall: claimedMap.get(partRequired) || 0,
      receivedOverall: receivedMap.get(partRequired) || received50Stars + receivedProlane,
    };
  });
}

function renderPartWiseTableHtml(title, rows) {
  const rowHtml = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;font-weight:600;">${row.partRequired}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.received50Stars}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.claimed50Stars}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.receivedProlane}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.claimedProlane}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:600;">${row.claimedOverall}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:600;">${row.receivedOverall}</td>
        </tr>
      `
    )
    .join("");

  return `
    <div style="margin-bottom:18px;">
      <div style="font-weight:700;background:#f2b183;padding:7px 10px;border:1px solid #d49d72;">${title}</div>
      <div style="font-size:12px;color:#4a5b6d;margin:6px 0 8px 0;">
        Claimed columns use the Lead collection (MongoDB) for this IST window. Received columns stay live Gmail.
      </div>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#cfe0f3;">
            <th style="padding:6px 8px;border:1px solid #b8c7dc;text-align:left;">Part Required</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">50STARS (received)</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Claimed 50STARS</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">PROLANE (received)</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Claimed PROLANE</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Overall Claimed</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Overall Received</th>
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
    </div>
  `;
}

function buildSalesAgentPartRowsByBrand(matrixByBrand = {}) {
  const makeRows = (brand) => {
    const brandMatrix = matrixByBrand?.[brand] || {};
    const orderedAgents = [
      ...(BRAND_SALES_LABEL_NAMES[brand] || []),
      ...Object.keys(brandMatrix).filter(
        (agent) => !(BRAND_SALES_LABEL_NAMES[brand] || []).includes(agent)
      ),
    ];
    return orderedAgents
      .map((agent) => {
        const counts = brandMatrix?.[agent] || {};
        const row = {
          agent,
          counts: Object.fromEntries(REPORT_PARTS.map((part) => [part, Number(counts?.[part]) || 0])),
          total: Number(counts?.total) || 0,
        };
        if (!row.total) {
          row.total = REPORT_PARTS.reduce((sum, part) => sum + (row.counts?.[part] || 0), 0);
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
  const bodyHtml =
    rows.length === 0
      ? `<tr><td colspan="${REPORT_PARTS.length + 2}" style="padding:8px;border:1px solid #b8c7dc;text-align:center;color:#667;">No live Gmail part data found.</td></tr>`
      : rows
          .map(
            (row) => `
              <tr>
                <td style="padding:6px 8px;border:1px solid #b8c7dc;font-weight:600;">${row.agent}</td>
                ${REPORT_PARTS.map(
                  (part) =>
                    `<td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.counts?.[part] || 0}</td>`
                ).join("")}
                <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:600;">${row.total || 0}</td>
              </tr>
            `
          )
          .join("");

  const totals = rows.reduce(
    (acc, row) => {
      REPORT_PARTS.forEach((part) => {
        acc[part] += row.counts?.[part] || 0;
      });
      acc.total += row.total || 0;
      return acc;
    },
    { "Anti Lock Braking": 0, Engine: 0, Others: 0, Transmission: 0, total: 0 }
  );

  const totalHtml =
    rows.length === 0
      ? ""
      : `
        <tr style="background:#d9efc1;font-weight:700;">
          <td style="padding:6px 8px;border:1px solid #b8c7dc;">Total</td>
          ${REPORT_PARTS.map(
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
            ${REPORT_PARTS.map(
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
    const brandByMessageId = new Map();
    rowsForAgent.forEach((row) => {
      const brand = detectBrandFromLead(row);
      if (brand) brandByMessageId.set(row.messageId, brand);
    });
    const rebuilt = await buildPartWiseReceivedFromMessageIds(
      rowsForAgent.map((row) => row.messageId),
      {
        gmail,
        brandByMessageId,
        snippetByMessageId,
        liveGmailOnly: true,
      }
    );
    received = rebuilt.partWiseReceived;
    receivedByBrand = rebuilt.partWiseReceivedByBrand;
  }

  const rows = buildPartWiseRows({
    claimed: claimedPack.claimed,
    claimedByBrand: claimedPack.claimedByBrand,
    received,
    receivedByBrand,
  });
  const liveSalesAgentPartMatrixByBrand = createSalesAgentPartMatrixSeed();
  liveRowsForPartMatrix.forEach((row) => {
    const brand = detectBrandFromLead(row);
    incrementSalesAgentPartMatrix(
      liveSalesAgentPartMatrixByBrand,
      brand,
      pickSalesAgentNameFromLabels(row.labels || []),
      partRequiredFromSnippet(row.snippet)
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
