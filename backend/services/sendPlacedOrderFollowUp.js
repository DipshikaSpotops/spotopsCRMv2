/**
 * Automated customer follow-up after 2 business days (Mon–Fri, America/Chicago)
 * from orderDate, while status is Placed | Customer approved | Yard Processing.
 */
import moment from "moment-timezone";
import {
  OrderModel,
  ProlaneOrderModel,
  ProTPOrderModel,
} from "../models/Order.js";
import {
  createGmailServiceTransport,
  pickEnv,
  resolveSmtpCredentialsForRequest,
} from "../utils/serviceGmailTransport.js";
import {
  emailLogoHtml,
  resolveCustomerLogoUrl,
  withEmailLogoAttachment,
} from "../utils/emailLogos.js";
import { subtractBusinessDays } from "../utils/workingDays.js";

const TZ = "America/Chicago";
const BUSINESS_DAYS = 2;
/** Only consider orders created within this many calendar days (avoids mass mail on backlog). */
const LOOKBACK_CALENDAR_DAYS = Number(process.env.PLACED_FOLLOWUP_LOOKBACK_DAYS || 14);
const POLL_MS = Math.max(
  60_000,
  Number(process.env.PLACED_FOLLOWUP_POLL_MS || 10 * 60 * 1000)
);

const ELIGIBLE_STATUS_REGEX = /^(placed|customer approved|yard processing)$/i;

const BRAND_MODELS = [
  { brand: "50STARS", Model: OrderModel },
  { brand: "PROLANE", Model: ProlaneOrderModel },
  { brand: "PROTP", Model: ProTPOrderModel },
];

function isEnabled() {
  const raw = String(process.env.PLACED_FOLLOWUP_EMAIL_ENABLED ?? "true")
    .trim()
    .toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no" && raw !== "off";
}

function getFollowUpBrandConfig(brand) {
  const b = String(brand || "50STARS").toUpperCase();
  const { smtpUser, smtpPass } = resolveSmtpCredentialsForRequest({ brand: b });

  const companyName =
    b === "PROTP"
      ? "Prolane Truck Parts"
      : b === "PROLANE"
      ? "Prolane Auto Parts"
      : "50 Stars Auto Parts";

  let phoneNumber = "+1 (866) 207-5533";
  if (b === "PROTP") {
    phoneNumber = process.env.PHONE_PROLANE_TRUCK || "+1 (888) 343-7670";
  } else if (b === "PROLANE" && process.env.PROLANE_SERVICE_NO) {
    phoneNumber = process.env.PROLANE_SERVICE_NO;
  }

  const serviceEmailAddress =
    b === "PROTP"
      ? "service@prolanetruckparts.com"
      : b === "PROLANE"
      ? "service@prolaneautoparts.com"
      : "service@50starsautoparts.com";

  const supportBcc = pickEnv("SUPPORT_BCC", b === "PROTP" ? "PROLANE" : b);
  const logoUrl = resolveCustomerLogoUrl(b);

  return {
    brand: b,
    serviceEmail: smtpUser,
    servicePass: smtpPass,
    companyName,
    customerFacingName: companyName,
    phoneNumber,
    serviceEmailAddress,
    supportBcc,
    logoUrl,
  };
}

function customerFirstName(order) {
  const f = String(order?.fName || "").trim();
  if (f) return f;
  const full = String(order?.customerName || "").trim();
  if (!full) return "there";
  return full.split(/\s+/)[0] || "there";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildFollowUpHtml(order, cfg) {
  const firstName = escapeHtml(customerFirstName(order));
  const brandName = escapeHtml(cfg.companyName);
  const orderNo = escapeHtml(order.orderNo || "");
  const partOrdered = escapeHtml(order.pReq || "your part");
  const phone = escapeHtml(cfg.phoneNumber);
  const supportEmail = escapeHtml(cfg.serviceEmailAddress);

  return `<div style="font-size:16px;line-height:1.7;color:#111;">
    <p>Hi ${firstName},</p>
    <p>Thank you for choosing ${brandName}.</p>
    <p>We wanted to provide you with a quick update on your recent order.</p>
    <p>
      <b>Order Number:</b> ${orderNo}<br/>
      <b>Part Ordered:</b> ${partOrdered}
    </p>
    <p>Your order is currently being processed by our fulfillment team.</p>
    <p>At this stage, we are carefully verifying your part, performing our quality inspection, and ensuring it is securely packaged to help protect it during shipping. Our goal is to make sure you receive the correct OEM part in excellent condition.</p>
    <p>Once your order has been shipped, you’ll automatically receive another email containing your tracking information so you can monitor your delivery every step of the way.</p>
    <p>If you have any questions or need assistance while your order is being processed, simply reply to this email or contact our Customer Support team. We’re always happy to help.</p>
    <p>Thank you for your patience and for trusting ${brandName}. We appreciate your business and look forward to getting your order to you as quickly as possible.</p>
    <p>Best regards,</p>
    <p>
      ${brandName}<br/>
      Customer Support Team<br/>
      ${phone}<br/>
      ${supportEmail}
    </p>
    ${emailLogoHtml(cfg.logoUrl)}
  </div>`;
}

async function sendFollowUpForOrder(order, brand) {
  const cfg = getFollowUpBrandConfig(brand);
  const toEmail = String(order.email || "").trim();
  if (!toEmail) return { skipped: true, reason: "no-email" };
  if (!cfg.serviceEmail || !cfg.servicePass) {
    return { skipped: true, reason: "smtp-not-configured" };
  }

  const transporter = createGmailServiceTransport(cfg.serviceEmail, cfg.servicePass);
  await transporter.sendMail({
    from: `"${cfg.customerFacingName}" <${cfg.serviceEmail}>`,
    to: toEmail,
    replyTo: cfg.serviceEmailAddress,
    bcc: cfg.supportBcc || undefined,
    subject: `Order Update | ${order.orderNo}`,
    html: buildFollowUpHtml(order, cfg),
    attachments: withEmailLogoAttachment(cfg.logoUrl),
  });

  return { sent: true };
}

function buildCandidateQuery(now = new Date()) {
  const dueOnOrBefore = subtractBusinessDays(now, BUSINESS_DAYS, TZ);
  const lookbackStart = moment
    .tz(now, TZ)
    .subtract(LOOKBACK_CALENDAR_DAYS, "days")
    .startOf("day")
    .toDate();

  const sinceEnv = String(process.env.PLACED_FOLLOWUP_SINCE || "").trim();
  let sinceDate = lookbackStart;
  if (sinceEnv) {
    const parsed = moment.tz(sinceEnv, TZ);
    if (parsed.isValid() && parsed.toDate() > sinceDate) {
      sinceDate = parsed.toDate();
    }
  }

  return {
    orderDate: { $gte: sinceDate, $lte: dueOnOrBefore },
    orderStatus: { $regex: ELIGIBLE_STATUS_REGEX },
    email: { $exists: true, $nin: [null, ""] },
    $or: [
      { placedFollowUpEmailSentAt: { $exists: false } },
      { placedFollowUpEmailSentAt: null },
    ],
  };
}

async function claimAndSend(Model, brand, order) {
  // Atomic claim so parallel poll ticks / instances don't double-send.
  const claimed = await Model.findOneAndUpdate(
    {
      _id: order._id,
      $or: [
        { placedFollowUpEmailSentAt: { $exists: false } },
        { placedFollowUpEmailSentAt: null },
      ],
      orderStatus: { $regex: ELIGIBLE_STATUS_REGEX },
    },
    {
      $set: { placedFollowUpEmailSentAt: new Date() },
    },
    { new: true }
  );

  if (!claimed) return { skipped: true, reason: "already-claimed" };

  try {
    const result = await sendFollowUpForOrder(claimed, brand);
    if (result.skipped) {
      // Roll back claim if we couldn't send (e.g. SMTP not ready / no email).
      await Model.updateOne(
        { _id: claimed._id },
        { $unset: { placedFollowUpEmailSentAt: "" } }
      );
      return result;
    }

    const when = moment().tz(TZ).format("D MMM, YYYY HH:mm");
    await Model.updateOne(
      { _id: claimed._id },
      {
        $push: {
          orderHistory: `Placed-order follow-up email sent on ${when} (America/Chicago)`,
        },
      }
    );
    return { sent: true, orderNo: claimed.orderNo };
  } catch (err) {
    await Model.updateOne(
      { _id: claimed._id },
      { $unset: { placedFollowUpEmailSentAt: "" } }
    );
    throw err;
  }
}

export async function processPlacedOrderFollowUps() {
  if (!isEnabled()) {
    return { enabled: false, sent: 0, errors: 0 };
  }

  const query = buildCandidateQuery();
  let sent = 0;
  let errors = 0;
  const details = [];

  for (const { brand, Model } of BRAND_MODELS) {
    const candidates = await Model.find(query)
      .select("orderNo orderDate orderStatus email fName customerName pReq placedFollowUpEmailSentAt")
      .sort({ orderDate: 1 })
      .limit(50)
      .lean();

    for (const order of candidates) {
      try {
        const result = await claimAndSend(Model, brand, order);
        if (result.sent) {
          sent += 1;
          details.push({ brand, orderNo: order.orderNo, status: "sent" });
          console.log(
            `[PlacedFollowUp] Sent ${brand} ${order.orderNo} → ${order.email}`
          );
        } else {
          details.push({
            brand,
            orderNo: order.orderNo,
            status: "skipped",
            reason: result.reason,
          });
        }
      } catch (err) {
        errors += 1;
        console.error(
          `[PlacedFollowUp] Failed ${brand} ${order.orderNo}:`,
          err?.message || err
        );
        details.push({
          brand,
          orderNo: order.orderNo,
          status: "error",
          error: String(err?.message || err),
        });
      }
    }
  }

  return { enabled: true, sent, errors, details };
}

let timer = null;
let running = false;

export function startPlacedOrderFollowUpScheduler() {
  if (!isEnabled()) {
    console.log(
      "[PlacedFollowUp] Disabled (set PLACED_FOLLOWUP_EMAIL_ENABLED=true to enable)"
    );
    return;
  }
  if (timer) return;

  console.log(
    `[PlacedFollowUp] Scheduler started (every ${Math.round(POLL_MS / 1000)}s, ${BUSINESS_DAYS} business days, lookback ${LOOKBACK_CALENDAR_DAYS}d)`
  );

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processPlacedOrderFollowUps();
    } catch (err) {
      console.error("[PlacedFollowUp] Tick failed:", err?.message || err);
    } finally {
      running = false;
    }
  };

  // Delay first run slightly so Mongo is ready
  setTimeout(tick, 20_000);
  timer = setInterval(tick, POLL_MS);
}
