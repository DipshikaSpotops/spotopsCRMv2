/** Payment sources that do NOT collect card info / CC auth page. */
export const NO_CARD_INFO_PAYMENT_SOURCES = [
  "Affirm",
  "Bank/Wire Transfer",
  "Both (VPS & SA Payment)",
  "Paypal",
  "FTC - Authorize",
  "PayTomorrow",
  "RP Payment",
  "SA Payment Link",
  "SSP Payment Link",
  "VP2 Payment Link",
  "VPS Payment Link",
  "Zelle",
];

export const DEFAULT_PAYMENT_SOURCES = [
  { name: "247 - PRO Payments", showCardInfo: true },
  { name: "Affirm", showCardInfo: false },
  { name: "Bank/Wire Transfer", showCardInfo: false },
  { name: "Both (VPS & SA Authorized)", showCardInfo: true },
  { name: "Both (VPS & SA Payment)", showCardInfo: false },
  { name: "FTC - Authorize", showCardInfo: false },
  { name: "Paypal", showCardInfo: false },
  { name: "PayTomorrow", showCardInfo: false },
  { name: "RP Authorize", showCardInfo: true },
  { name: "RP Payment", showCardInfo: false },
  { name: "SA Authorized", showCardInfo: true },
  { name: "SA Payment Link", showCardInfo: false },
  { name: "SSP Autorized", showCardInfo: true },
  { name: "SSP Payment Link", showCardInfo: false },
  { name: "VP2 Authorized", showCardInfo: true },
  { name: "VP2 Payment Link", showCardInfo: false },
  { name: "VPS Authorized", showCardInfo: true },
  { name: "VPS Payment Link", showCardInfo: false },
  { name: "Zelle", showCardInfo: false },
];

export function normalizePaymentSourceName(name) {
  return String(name || "")
    .trim()
    .replace(/^\s+/, "")
    .toLowerCase();
}

export function defaultShowCardInfoForName(name) {
  const key = normalizePaymentSourceName(name);
  if (!key) return false;
  const known = DEFAULT_PAYMENT_SOURCES.find(
    (row) => normalizePaymentSourceName(row.name) === key
  );
  if (known) return Boolean(known.showCardInfo);
  return !NO_CARD_INFO_PAYMENT_SOURCES.some(
    (n) => normalizePaymentSourceName(n) === key
  );
}
