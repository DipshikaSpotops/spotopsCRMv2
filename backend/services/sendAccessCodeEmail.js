import {
  resolveSmtpCredentialsForRequest,
  createGmailServiceTransport,
  getBrand,
} from "../utils/serviceGmailTransport.js";

/**
 * Access-code notifications use the same Nodemailer pattern as routes/emails.js:
 *   createTransport({ service: "gmail", auth: { user, pass } })
 * Do not use raw SMTP_HOST unless you set ACCESS_CODE_SMTP_STARTTLS=true (port 587).
 *
 * Credentials follow x-brand / req.brand like customer emails (SERVICE_EMAIL vs SERVICE_EMAIL_PROLANE).
 *
 * All issue/login flows email the code to the CRM user’s login address; ACCESS_CODE_NOTIFY_TO
 * receives a separate internal copy when set (see sendAccessCodeEmailToUser).
 */

function parseNotifyRecipients() {
  const raw = process.env.ACCESS_CODE_NOTIFY_TO?.trim() || "";
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((e) => e.includes("@"));
}

function assertMailConfig(req) {
  const { smtpUser, smtpPass, brand } = resolveSmtpCredentialsForRequest(req);

  if (!smtpUser || !smtpPass) {
    throw new Error(
      "SMTP not configured for this brand. Set SERVICE_EMAIL + SERVICE_PASS (or PROLANE_*), or ACCESS_CODE_SMTP_USER/PASS."
    );
  }

  const notifyTo = parseNotifyRecipients();
  if (notifyTo.length === 0) {
    throw new Error(
      "Set ACCESS_CODE_NOTIFY_TO in .env (comma-separated). Those addresses receive access-code messages."
    );
  }

  return { smtpUser, smtpPass, notifyTo, brand };
}

function assertSmtpOnly(req) {
  const { smtpUser, smtpPass, brand } = resolveSmtpCredentialsForRequest(req);
  if (!smtpUser || !smtpPass) {
    throw new Error(
      "SMTP not configured for this brand. Set SERVICE_EMAIL + SERVICE_PASS (or PROLANE_*)."
    );
  }
  return { smtpUser, smtpPass, brand };
}

/**
 * Send access code TO the CRM user’s login email, then optional separate message to ACCESS_CODE_NOTIFY_TO.
 * Two SMTP sends so the user message has a single RCPT TO (some setups mishandle To+BCC for outside inboxes).
 */
export async function sendAccessCodeEmailToUser({ req, toEmail, code }) {
  const { smtpUser, smtpPass, brand } = assertSmtpOnly(req);
  const transporter = createGmailServiceTransport(smtpUser, smtpPass);
  const to = String(toEmail || "").trim().toLowerCase();
  if (!to) throw new Error("toEmail is required");

  const notifyLower = parseNotifyRecipients().map((a) => a.trim().toLowerCase());
  const notifyOthers = [...new Set(notifyLower.filter((a) => a && a !== to))];

  const fromName = process.env.ACCESS_CODE_EMAIL_FROM_NAME?.trim() || "CRM Access";
  const from = `"${fromName}" <${smtpUser}>`;

  console.log(
    `[access-code-mail] user inbox | brand=${brand} smtpLogin=${smtpUser} to=${to} internalNotifyCount=${notifyOthers.length}`
  );
  console.log("[access-code-mail] ACCESS CODE (email to user):", code);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: "Your CRM access code",
      text:
        `Your access code is: ${code}\n\n` +
        `Return to the CRM, keep this window open, and enter the code in the popup after you signed in.\n` +
        `This code only works for ${to}.\n`,
      html:
        `<p>Your access code is:</p>` +
        `<p style="font-size:20px;font-weight:bold;letter-spacing:3px;font-family:monospace;">${code}</p>` +
        `<p>Enter this in the CRM verification popup (you are already signed in).</p>` +
        `<p style="color:#666;font-size:13px;">This code only works for <b>${to}</b>.</p>`,
    });
    console.log(`[access-code-mail] user inbox OK messageId=${info.messageId || "n/a"}`);
  } catch (err) {
    console.error("[access-code-mail] user inbox failed:", err?.message);
    throw err;
  }

  if (notifyOthers.length === 0) return;

  try {
    const info2 = await transporter.sendMail({
      from,
      to: notifyOthers,
      subject: `CRM access code for user: ${to}`,
      text:
        `This access code is for the CRM login email: ${to}\n\n` +
        `Code: ${code}\n\n` +
        `Only that user can use it — they sign in first, then enter the code in the popup.\n`,
      html:
        `<p><b>CRM user (login email) this code is for:</b> ${to}</p>` +
        `<p style="font-size:20px;font-weight:bold;letter-spacing:3px;font-family:monospace;">${code}</p>` +
        `<p>That person must sign in with <b>${to}</b>, then enter this code in the verification popup.</p>` +
        `<p style="color:#666;font-size:13px;">Internal copy — the same code was emailed directly to ${to}.</p>`,
    });
    console.log(`[access-code-mail] internal notify OK messageId=${info2.messageId || "n/a"}`);
  } catch (err) {
    console.error("[access-code-mail] internal notify failed (user already got code):", err?.message);
  }
}

/** Admin: see who gets mail, which mailbox sends, and whether SMTP auth succeeds. */
export async function getAccessMailDebug(req) {
  const brand = getBrand(req);
  const { smtpUser, smtpPass } = resolveSmtpCredentialsForRequest(req);
  const notifyTo = parseNotifyRecipients();
  const startTls =
    String(process.env.ACCESS_CODE_SMTP_STARTTLS ?? "").trim().toLowerCase() === "true";

  let smtpVerified = null;
  let verifyError = null;
  if (smtpUser && smtpPass) {
    try {
      const t = createGmailServiceTransport(smtpUser, smtpPass);
      await t.verify();
      smtpVerified = true;
    } catch (e) {
      smtpVerified = false;
      verifyError = e?.message || String(e);
    }
  }

  return {
    brand,
    sendFromMailbox: smtpUser || null,
    hasAppPassword: Boolean(smtpPass),
    appPasswordLength: smtpPass ? smtpPass.length : 0,
    notifyTo,
    transport: startTls ? "smtp.gmail.com:587+STARTTLS" : "service:gmail (same as Order emails)",
    smtpVerified,
    verifyError,
    note: "Invite/login sends the code to the CRM user’s email first; ACCESS_CODE_NOTIFY_TO gets a separate internal copy when set.",
  };
}

/**
 * Admin-only diagnostic: same transport as customer emails in emails.js.
 */
export async function sendAccessCodeSmtpTest(req) {
  const { smtpUser, smtpPass, notifyTo, brand } = assertMailConfig(req);
  const transporter = createGmailServiceTransport(smtpUser, smtpPass);
  const fromName = process.env.ACCESS_CODE_EMAIL_FROM_NAME?.trim() || "CRM Access";

  console.log(
    `[access-code-mail] TEST brand=${brand} to=${notifyTo.join(",")} smtpLogin=${smtpUser}`
  );

  try {
    await transporter.verify();
    console.log("[access-code-mail] TEST transporter.verify() OK");
  } catch (verErr) {
    console.error("[access-code-mail] TEST verify failed:", verErr?.message);
    throw new Error(
      `SMTP login failed (transporter.verify): ${verErr?.message || verErr}. Fix SERVICE_EMAIL/SERVICE_PASS or set ACCESS_CODE_SMTP_STARTTLS=true.`
    );
  }

  const toField = notifyTo.join(", ");
  const info = await transporter.sendMail({
    from: `"${fromName}" <${smtpUser}>`,
    to: notifyTo,
    subject: "CRM access-mail test (SMTP OK)",
    text:
      "If you see this, access-code SMTP matches the working CRM email setup (emails.js / service: gmail).\n" +
      `Recipients: ${toField}\n`,
    html: `<p>Access-code SMTP test OK (same as customer mail).</p><p>Recipients: ${toField}</p>`,
  });

  console.log(`[access-code-mail] TEST messageId=${info.messageId || "n/a"}`);
  return { messageId: info.messageId, to: toField, smtpLogin: smtpUser, brand };
}
