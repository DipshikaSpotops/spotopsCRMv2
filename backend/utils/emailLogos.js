/** American Auto Supply — PROTP yard-facing emails only. */
export const PROTP_YARD_LOGO_DEFAULT =
  "https://prolanelogo.s3.ap-south-1.amazonaws.com/american_AS_img.png";

function pickEnv(baseKey, brand) {
  if (!baseKey) return "";
  const base = String(baseKey).trim();
  if (!base) return "";

  const envBrand = brand === "PROTP" ? "PROLANE" : brand;
  if (envBrand === "PROLANE") {
    const brandKey = `${base}_PROLANE`;
    if (process.env[brandKey]) return process.env[brandKey];
  }
  return process.env[base] || "";
}

function trimUrl(value) {
  const v = String(value || "").trim();
  return v || null;
}

export function resolveBrandFromOrderNo(orderNo, fallbackBrand = "50STARS") {
  const no = String(orderNo || "").trim().toUpperCase();
  if (no.startsWith("PROTP")) return "PROTP";
  if (no.startsWith("PROLANE")) return "PROLANE";
  if (no.startsWith("50STARS")) return "50STARS";
  const normalized = String(fallbackBrand || "").toUpperCase();
  if (normalized === "PROLANE") return "PROLANE";
  if (normalized === "PROTP") return "PROTP";
  return "50STARS";
}

/** Customer / service emails (never uses PROTP_LOGO / American AS). No fallback image. */
export function resolveCustomerLogoUrl(brand) {
  const b = String(brand || "").toUpperCase();

  if (b === "PROLANE" || b === "PROTP") {
    return trimUrl(process.env.PROLANE_LOGO) || trimUrl(pickEnv("LOGO_URL", "PROLANE"));
  }

  return trimUrl(pickEnv("LOGO_URL", b));
}

/** PROTP yard emails only — American Auto Supply logo. */
export function logoForProtpYardEmail() {
  return trimUrl(process.env.PROTP_LOGO) || PROTP_YARD_LOGO_DEFAULT;
}

/**
 * Logo for yard/purchase emails.
 * PROTP → American Auto Supply (PROTP_LOGO).
 * 50STARS / PROLANE → unchanged customer-logo rules (PROLANE_LOGO, LOGO_URL, etc.).
 */
export function logoForYardFacingEmail(brand) {
  if (String(brand || "").toUpperCase() === "PROTP") {
    return logoForProtpYardEmail();
  }
  return resolveCustomerLogoUrl(brand);
}

export function emailLogoHtml(logoUrl) {
  if (!logoUrl) return "";
  return `<p><img src="cid:logo" alt="logo" style="width: 180px; height: 100px;"></p>`;
}

export function withEmailLogoAttachment(logoUrl, attachments = []) {
  if (!logoUrl) return attachments;
  return [
    ...attachments,
    { filename: "logo.png", path: logoUrl, cid: "logo" },
  ];
}
