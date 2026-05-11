import moment from "moment-timezone";
import Lead from "../models/Lead.js";
import {
  createGmailServiceTransport,
} from "../utils/serviceGmailTransport.js";

const IST_ZONE = "Asia/Kolkata";
const RECIPIENTS = [
  "dipsikha.spotopsdigital@gmail.com",
  "50starsauto110@gmail.com",
];

// Send at 4:30 PM IST every day
const SEND_HOUR_IST = 16;
const SEND_MINUTE_IST = 30;

// Reporting window: previous day 6:30 PM IST -> current day 5:00 AM IST
const WINDOW_START_HOUR = 18;
const WINDOW_START_MINUTE = 30;
const WINDOW_END_HOUR = 5;
const WINDOW_END_MINUTE = 0;

// In-memory guard to avoid duplicate sends during same day/runtime.
let lastDigestKeySent = "";

const AGENT_GROUPS = [
  { displayName: "Charlie", names: ["michael", "charlie"] },
  { displayName: "Richard", names: ["richard", "victor"] },
  { displayName: "Mark", names: ["mark", "sam"] },
  { displayName: "Nick", names: ["nick", "noah"] },
];

function detectBrandFromLead(lead = {}) {
  const hay = `${lead?.from || ""} ${lead?.subject || ""}`.toLowerCase();
  if (hay.includes("prolane") || hay.includes("pro lane")) return "PROLANE";
  return "50STARS";
}

function normalizePart(partRequired = "") {
  const raw = String(partRequired || "").toLowerCase().trim();
  if (!raw) return "invalid";
  if (raw.includes("abs") || raw.includes("anti lock braking")) return "abs";
  if (raw.includes("drive shaft") || raw.includes("driveshaft")) return "driveShaft";
  if (raw.includes("transmission")) return "trans";
  if (raw.includes("engine") && !raw.includes("control module")) return "engine";
  return "invalid";
}

function createEmptyRow() {
  return { abs: 0, driveShaft: 0, engine: 0, trans: 0, invalid: 0, total: 0 };
}

function ensureAgentRows() {
  const rows = {};
  AGENT_GROUPS.forEach((group) => {
    rows[group.displayName] = createEmptyRow();
  });
  return rows;
}

function addLeadToRows(rows, lead) {
  const salesAgent = String(lead?.salesAgent || "").trim().toLowerCase();
  const matchingGroup = AGENT_GROUPS.find((group) =>
    group.names.includes(salesAgent)
  );
  if (!matchingGroup) return;

  const bucket = normalizePart(lead?.partRequired || "");
  const row = rows[matchingGroup.displayName];
  row[bucket] += 1;
  row.total += 1;
}

function sumTotals(rows) {
  const totals = createEmptyRow();
  Object.values(rows).forEach((row) => {
    totals.abs += row.abs;
    totals.driveShaft += row.driveShaft;
    totals.engine += row.engine;
    totals.trans += row.trans;
    totals.invalid += row.invalid;
    totals.total += row.total;
  });
  return totals;
}

function renderTableHtml(title, rows) {
  const order = ["Charlie", "Mark", "Richard", "Nick"];
  const totals = sumTotals(rows);
  const rowHtml = order
    .map((name) => {
      const row = rows[name] || createEmptyRow();
      return `
        <tr>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;font-weight:600;">${name}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.abs}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.driveShaft}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.engine}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.trans}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${row.invalid}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:600;">${row.total}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="margin-bottom:18px;">
      <div style="font-weight:700;background:#f2b183;padding:7px 10px;border:1px solid #d49d72;">${title}</div>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#cfe0f3;">
            <th style="padding:6px 8px;border:1px solid #b8c7dc;text-align:left;">Name</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">ABS Leads</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Drive shaft</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Engine</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Trans</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Invalid</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rowHtml}
          <tr style="background:#d9efc1;font-weight:700;">
            <td style="padding:6px 8px;border:1px solid #b8c7dc;">Total</td>
            <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.abs}</td>
            <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.driveShaft}</td>
            <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.engine}</td>
            <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.trans}</td>
            <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.invalid}</td>
            <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function getWindowForDigest(nowIst = moment.tz(IST_ZONE)) {
  const windowEnd = nowIst
    .clone()
    .startOf("day")
    .hour(WINDOW_END_HOUR)
    .minute(WINDOW_END_MINUTE)
    .second(0)
    .millisecond(0);

  const windowStart = windowEnd
    .clone()
    .subtract(1, "day")
    .hour(WINDOW_START_HOUR)
    .minute(WINDOW_START_MINUTE);

  return { windowStart, windowEnd };
}

async function buildDigestData(nowIst) {
  const { windowStart, windowEnd } = getWindowForDigest(nowIst);

  const leads = await Lead.find({
    claimedAt: { $gte: windowStart.toDate(), $lte: windowEnd.toDate() },
  })
    .select("salesAgent partRequired from subject claimedAt")
    .lean();

  const rows50 = ensureAgentRows();
  const rowsPro = ensureAgentRows();
  const rowsAll = ensureAgentRows();

  leads.forEach((lead) => {
    const brand = detectBrandFromLead(lead);
    if (brand === "PROLANE") {
      addLeadToRows(rowsPro, lead);
    } else {
      addLeadToRows(rows50, lead);
    }
    addLeadToRows(rowsAll, lead);
  });

  return { rows50, rowsPro, rowsAll, windowStart, windowEnd };
}

export async function sendLeadStatisticsDigest({ force = false } = {}) {
  const nowIst = moment.tz(IST_ZONE);
  const digestKey = nowIst.format("YYYY-MM-DD");
  if (!force && lastDigestKeySent === digestKey) return { skipped: true, reason: "already_sent_today" };

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

  const { rows50, rowsPro, rowsAll, windowStart, windowEnd } = await buildDigestData(
    nowIst
  );

  const transporter = createGmailServiceTransport(smtpUser, smtpPass);
  const dayLabel = windowEnd.clone().subtract(1, "day").format("D MMM YYYY");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1f2d3d;">
      <h3 style="margin:0 0 6px 0;">Lead Statistics Digest</h3>
      <div style="margin-bottom:12px;color:#4a5b6d;font-size:13px;">
        Window (IST): ${windowStart.format("DD MMM YYYY hh:mm A")} to ${windowEnd.format(
          "DD MMM YYYY hh:mm A"
        )}
      </div>
      ${renderTableHtml(`50STARS — Leads on ${dayLabel}`, rows50)}
      ${renderTableHtml(`PROLANE — Leads on ${dayLabel}`, rowsPro)}
      ${renderTableHtml(`Combined — Leads on ${dayLabel}`, rowsAll)}
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

