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
 * Access-code emails are internal-only: they go to ACCESS_CODE_NOTIFY_TO.
 * The CRM user is referenced in subject/body but is not emailed directly.
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
 * Send access code to ACCESS_CODE_NOTIFY_TO only (internal recipients).
 * `toEmail` is the CRM login email the code is bound to (for message context), not a mail recipient.
 */
export async function sendAccessCodeEmailToUser({ req, toEmail, code }) {
  const { smtpUser, smtpPass, notifyTo, brand } = assertMailConfig(req);
  const transporter = createGmailServiceTransport(smtpUser, smtpPass);
  const to = String(toEmail || "").trim().toLowerCase();
  if (!to) throw new Error("toEmail is required");

  const fromName = process.env.ACCESS_CODE_EMAIL_FROM_NAME?.trim() || "CRM Access";
  const from = `"${fromName}" <${smtpUser}>`;

  console.log(
    `[access-code-mail] internal-only | brand=${brand} smtpLogin=${smtpUser} notifyTo=${notifyTo.join(",")} forUser=${to}`
  );
  console.log("[access-code-mail] ACCESS CODE (internal mail only):", code);

  try {
    const info = await transporter.sendMail({
      from,
      to: notifyTo,
      subject: `CRM access code for user: ${to}`,
      text:
        `This access code is for the CRM login email: ${to}\n\n` +
        `Code: ${code}\n\n` +
        `Only that user can use it — they sign in first, then enter the code in the verification popup.\n`,
      html:
        `<p><b>CRM user (login email) this code is for:</b> ${to}</p>` +
        `<p style="font-size:20px;font-weight:bold;letter-spacing:3px;font-family:monospace;">${code}</p>` +
        `<p>That person must sign in with <b>${to}</b>, then enter this code in the verification popup.</p>` +
        `<p style="color:#666;font-size:13px;">Sent only to ACCESS_CODE_NOTIFY_TO recipients.</p>`,
    });
    console.log(`[access-code-mail] internal notify OK messageId=${info.messageId || "n/a"}`);
  } catch (err) {
    console.error("[access-code-mail] internal notify failed:", err?.message);
    throw err;
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
    note: "Invite/login sends code only to ACCESS_CODE_NOTIFY_TO (internal). CRM user is not emailed directly.",
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
