/**
 * When a yard is PO cancelled AND paymentStatus is Card charged,
 * auto-flag Collect Refund with refund amount = partPrice + Yard shipping.
 */

function parseMoney(val) {
  if (val == null || val === "") return 0;
  const num = parseFloat(String(val).replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function isPoCancelledStatus(status) {
  const t = String(status || "").trim().toLowerCase();
  return t === "po cancelled" || t === "po canceled" || t === "po cancel";
}

function isCardCharged(paymentStatus) {
  return String(paymentStatus || "").trim().toLowerCase() === "card charged";
}

/** partPrice + numeric Yard shipping from shippingDetails (Own shipping ignored). */
export function calcPartPricePlusYardShipping(yard) {
  const partPrice = parseMoney(yard?.partPrice);
  const details = String(yard?.shippingDetails || "");
  const yardMatch = details.match(/yard shipping:\s*([\d.]+)/i);
  const yardShipping = yardMatch ? parseMoney(yardMatch[1]) : 0;
  const total = partPrice + yardShipping;
  return total > 0 ? total.toFixed(2) : "";
}

/**
 * Mutates yard in place when both conditions are met.
 * Skips if refund is already collected.
 * @returns {{ applied: boolean, refundToCollect?: string, reason?: string }}
 */
export function applyAutoCollectRefundIfPoCancelledAndCardCharged(yard) {
  if (!yard) return { applied: false, reason: "no-yard" };
  if (!isPoCancelledStatus(yard.status)) {
    return { applied: false, reason: "not-po-cancelled" };
  }
  if (!isCardCharged(yard.paymentStatus)) {
    return { applied: false, reason: "not-card-charged" };
  }
  if (String(yard.refundStatus || "").trim() === "Refund collected") {
    return { applied: false, reason: "already-collected" };
  }
  if (String(yard.collectRefundCheckbox || "").trim() === "Ticked") {
    return { applied: false, reason: "already-ticked" };
  }

  const refundToCollect = calcPartPricePlusYardShipping(yard);
  yard.collectRefundCheckbox = "Ticked";
  yard.refundStatus = "Refund not collected";
  if (refundToCollect) {
    yard.refundToCollect = refundToCollect;
  }

  return { applied: true, refundToCollect };
}
