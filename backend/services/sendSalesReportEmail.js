import moment from "moment-timezone";
import { getOrderModelForBrand } from "../models/Order.js";
import { createGmailServiceTransport } from "../utils/serviceGmailTransport.js";

const TZ = "America/Chicago";

const RECIPIENTS = [
  "dipsikha.spotopsdigital@gmail.com",
  "50starsauto110@gmail.com",
];

/** 50STARS firstName → PROLANE firstName (same as monthlyOrders route). */
const AGENT_BRAND_MAPPING = {
  Richard: "Victor",
  Mark: "Sam",
  David: "Steve",
  Michael: "Charlie",
  Dipsikha: "Dipsikha",
};

const PROLANE_TO_CANONICAL = Object.fromEntries(
  Object.entries(AGENT_BRAND_MAPPING).map(([canonical, prolane]) => [
    String(prolane).toLowerCase(),
    canonical,
  ])
);

function buildDateRange(q) {
  const { start, end, month, year } = q;

  if (start && end) {
    const startMoment = moment.tz(start, TZ).startOf("day");
    const endExclusiveMoment = moment.tz(end, TZ).endOf("day").add(1, "millisecond");
    return {
      orderDate: {
        $gte: startMoment.toDate(),
        $lt: endExclusiveMoment.toDate(),
      },
      startDateStr: start,
      endDateStr: end,
    };
  }

  if (month && year) {
    const monthIndex = Number.isNaN(Number(month))
      ? { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }[
          month
        ]
      : parseInt(month, 10) - 1;
    const y = parseInt(year, 10);
    if (Number.isNaN(monthIndex) || Number.isNaN(y)) {
      throw new Error("Invalid month/year");
    }
    const startMoment = moment.tz({ year: y, month: monthIndex }, TZ).startOf("month");
    const endExclusiveMoment = startMoment.clone().add(1, "month");
    return {
      orderDate: {
        $gte: startMoment.toDate(),
        $lt: endExclusiveMoment.toDate(),
      },
      startDateStr: startMoment.format("YYYY-MM-DD"),
      endDateStr: endExclusiveMoment.clone().subtract(1, "day").format("YYYY-MM-DD"),
    };
  }

  throw new Error("Provide either start/end or month/year");
}

function daySuffix(d) {
  if (d >= 11 && d <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[d % 10] || "th";
}

export function formatSalesReportDateLabel(startDateStr, endDateStr) {
  const formatOne = (ymd) => {
    const m = moment.tz(ymd, "YYYY-MM-DD", TZ);
    const d = m.date();
    return `${d}${daySuffix(d)} ${m.format("MMMM YYYY")}`;
  };
  if (startDateStr && endDateStr && startDateStr !== endDateStr) {
    return `${formatOne(startDateStr)} – ${formatOne(endDateStr)}`;
  }
  const single = endDateStr || startDateStr;
  return single ? formatOne(single) : moment.tz(TZ).format("D MMMM YYYY");
}

function salesAgentFirstName(salesAgent) {
  const trimmed = String(salesAgent || "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] || trimmed;
}

function canonicalAgentName(firstName, sourceBrand) {
  const raw = salesAgentFirstName(firstName);
  if (!raw) return "";
  if (sourceBrand === "PROLANE") {
    const mapped = PROLANE_TO_CANONICAL[raw.toLowerCase()];
    if (mapped) return mapped;
  }
  return raw;
}

function isExcludedOrderStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return false;
  if (s.includes("cancelled")) return true;
  if (s === "refunded") return true;
  if (s.startsWith("dispute")) return true;
  return false;
}

function toGp(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export async function buildSalesReportData({ start, end, month, year }) {
  const { orderDate, startDateStr, endDateStr } = buildDateRange({ start, end, month, year });
  const projectFields = { salesAgent: 1, grossProfit: 1, orderStatus: 1 };

  const brands = ["50STARS", "PROLANE"];
  const allOrders = [];
  for (const brand of brands) {
    const Order = getOrderModelForBrand(brand);
    const rows = await Order.find({ orderDate }, projectFields).lean();
    rows.forEach((row) => allOrders.push({ ...row, _sourceBrand: brand }));
  }

  const byAgent = new Map();

  for (const order of allOrders) {
    if (isExcludedOrderStatus(order.orderStatus)) continue;

    const name = canonicalAgentName(order.salesAgent, order._sourceBrand);
    if (!name) continue;

    if (!byAgent.has(name)) {
      byAgent.set(name, {
        name,
        orders: 0,
        fiftyStarsGp: 0,
        prolaneGp: 0,
      });
    }
    const row = byAgent.get(name);
    row.orders += 1;
    const gp = toGp(order.grossProfit);
    if (order._sourceBrand === "PROLANE") {
      row.prolaneGp += gp;
    } else {
      row.fiftyStarsGp += gp;
    }
  }

  const rows = [...byAgent.values()]
    .map((r) => ({
      ...r,
      fiftyStarsGp: Number(r.fiftyStarsGp.toFixed(2)),
      prolaneGp: Number(r.prolaneGp.toFixed(2)),
      totalGp: Number((r.fiftyStarsGp + r.prolaneGp).toFixed(2)),
    }))
    .sort((a, b) => b.totalGp - a.totalGp || a.name.localeCompare(b.name));

  const totals = rows.reduce(
    (acc, r) => {
      acc.orders += r.orders;
      acc.fiftyStarsGp += r.fiftyStarsGp;
      acc.prolaneGp += r.prolaneGp;
      acc.totalGp += r.totalGp;
      return acc;
    },
    { orders: 0, fiftyStarsGp: 0, prolaneGp: 0, totalGp: 0 }
  );
  totals.fiftyStarsGp = Number(totals.fiftyStarsGp.toFixed(2));
  totals.prolaneGp = Number(totals.prolaneGp.toFixed(2));
  totals.totalGp = Number(totals.totalGp.toFixed(2));

  const dayLabel = formatSalesReportDateLabel(startDateStr, endDateStr);
  const isSingleDay = startDateStr === endDateStr;
  const title = isSingleDay
    ? `Today's Sales report ${dayLabel}`
    : `Sales report ${dayLabel}`;

  return { rows, totals, dayLabel, title, startDateStr, endDateStr };
}

function renderSalesReportTableHtml({ title, rows, totals }) {
  const bodyHtml =
    rows.length === 0
      ? `<tr><td colspan="5" style="padding:8px;border:1px solid #b8c7dc;text-align:center;color:#667;">No orders in this range.</td></tr>`
      : rows
          .map(
            (r) => `
        <tr>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;font-weight:700;text-align:center;">${r.name}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:700;">${r.orders}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:700;">${r.fiftyStarsGp.toFixed(2)}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:700;">${r.prolaneGp.toFixed(2)}</td>
          <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;font-weight:700;">${r.totalGp.toFixed(2)}</td>
        </tr>
      `
          )
          .join("");

  const totalRow = `
    <tr style="background:#d9efc1;font-weight:700;">
      <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">Total</td>
      <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.orders}</td>
      <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.fiftyStarsGp.toFixed(2)}</td>
      <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.prolaneGp.toFixed(2)}</td>
      <td style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">${totals.totalGp.toFixed(2)}</td>
    </tr>
  `;

  return `
    <div style="margin-bottom:18px;">
      <div style="font-weight:700;background:#f2b183;padding:8px 10px;border:1px solid #d49d72;text-align:center;font-size:15px;">${title}</div>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#cfe0f3;">
            <th style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">Name</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">Orders</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">50 Star GP</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">Prolane GP</th>
            <th style="padding:6px 8px;border:1px solid #b8c7dc;text-align:center;">Total GP</th>
          </tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
        <tfoot>${totalRow}</tfoot>
      </table>
    </div>
  `;
}

export async function sendSalesReportEmail({ start, end, month, year } = {}) {
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
    throw new Error("SMTP credentials missing. Cannot send sales report.");
  }

  const report = await buildSalesReportData({ start, end, month, year });
  const html = `
    <div style="font-family:Arial,sans-serif;color:#1f2d3d;">
      ${renderSalesReportTableHtml(report)}
    </div>
  `;

  const transporter = createGmailServiceTransport(smtpUser, smtpPass);
  await transporter.sendMail({
    from: `"Sales Report" <${smtpUser}>`,
    to: RECIPIENTS.join(", "),
    subject: report.title,
    html,
    text: `${report.title}\n\nAgents: ${report.rows.length}, Total orders: ${report.totals.orders}`,
  });

  return {
    recipients: RECIPIENTS,
    ...report,
  };
}
