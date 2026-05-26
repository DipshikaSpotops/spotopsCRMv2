/**
 * Purchase-side BCC (PO, yard refund, PO cancel): PURCHASE_BCC (50STARS) / PURCHASE_BCC_PROLANE (PROLANE).
 * Falls back to ops + brand purchase display address if env is unset.
 */

function getBrand(req) {
  const b = String(req?.brand || "").toUpperCase();
  if (b === "PROLANE" || b === "PROTP") return b;
  return "50STARS";
}

export function bccFromEnv(...keys) {
  for (const key of keys) {
    const raw = process.env[key];
    if (raw == null) continue;
    const cleaned = String(raw)
      .replace(/;+\s*$/g, "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(",");
    if (cleaned) return cleaned;
  }
  return "";
}

function purchaseDisplayAddress(brand) {
  return brand === "PROLANE" || brand === "PROTP"
    ? "purchase@prolaneautoparts.com"
    : "purchase@auto-partsgroup.com";
}

export function getPurchaseBcc(req) {
  const brand = getBrand(req);
  const fromEnv =
    brand === "PROLANE" || brand === "PROTP"
      ? bccFromEnv("PURCHASE_BCC_PROLANE")
      : bccFromEnv("PURCHASE_BCC");
  if (fromEnv) return fromEnv;
  return `dipsikha.spotopsdigital@gmail.com,${purchaseDisplayAddress(brand)}`;
}
