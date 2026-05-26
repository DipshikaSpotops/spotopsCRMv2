import nodemailer from "nodemailer";

/**
 * Same env resolution pattern as routes/emails.js getEmailBrandConfig (50STARS vs PROLANE).
 */
export function pickEnv(baseKey, brand) {
  if (!baseKey) return "";
  const base = String(baseKey).trim();
  if (!base) return "";

  // PROTP shares credentials with PROLANE
  const envBrand = brand === "PROTP" ? "PROLANE" : brand;
  if (envBrand === "PROLANE") {
    const brandKey = `${base}_PROLANE`;
    if (process.env[brandKey] != null && String(process.env[brandKey]).trim() !== "") {
      return String(process.env[brandKey]).trim();
    }
  }
  const v = process.env[base];
  return v == null ? "" : String(v).trim();
}

export function getBrand(req) {
  const b = String(req?.brand || "").toUpperCase();
  if (b === "PROLANE" || b === "PROTP") return b;
  return "50STARS";
}

/**
 * Credentials used by customer-facing emails in emails.js. Access-code mail reuses these
 * unless ACCESS_CODE_SMTP_* / SMTP_* overrides are set.
 */
export function resolveSmtpCredentialsForRequest(req) {
  const brand = getBrand(req);
  let smtpUser, passRaw;
  if (brand === "PROTP") {
    smtpUser = process.env.EMAIL_PROLANE_TRUCK?.trim() || pickEnv("SERVICE_EMAIL", "PROLANE");
    passRaw = process.env.PASS_PROLANE_TRUCK?.trim() || pickEnv("SERVICE_PASS", "PROLANE");
  } else {
    smtpUser =
      process.env.ACCESS_CODE_SMTP_USER?.trim() ||
      process.env.SMTP_USER?.trim() ||
      pickEnv("SERVICE_EMAIL", brand);
    passRaw =
      process.env.ACCESS_CODE_SMTP_PASS?.trim() ||
      process.env.SMTP_PASS?.trim() ||
      pickEnv("SERVICE_PASS", brand);
  }
  const smtpPass = String(passRaw || "").replace(/\s+/g, "").trim();
  return { brand, smtpUser, smtpPass };
}

/**
 * Match working routes in emails.js: service "gmail" (not raw SMTP_HOST), which is more reliable with Nodemailer + Gmail.
 * Set ACCESS_CODE_SMTP_STARTTLS=true to use port 587 if 465/service path is blocked.
 */
export function createGmailServiceTransport(smtpUser, smtpPass) {
  const startTls =
    String(process.env.ACCESS_CODE_SMTP_STARTTLS ?? "").trim().toLowerCase() === "true";

  if (startTls) {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}
