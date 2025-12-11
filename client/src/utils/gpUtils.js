/**
 * Extract numeric shipping value from shippingDetails string
 * Handles both "Own shipping: X" and "Yard shipping: X" formats
 * Always extracts from shippingDetails, never from ownShipping/yardShipping fields
 */
function parseShippingValue(field = "") {
  if (typeof field !== "string" || !field) return 0;
  // Match "Own shipping: X" or "Yard shipping: X" (case-insensitive, handles decimals)
  const match = field.match(/(?:Own shipping|Yard shipping):\s*([\d.]+)/i);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

export function calculateCurrentGP(order) {
  if (!order || !Array.isArray(order.additionalInfo) || order.additionalInfo.length === 0) return 0;
  let totalYardSpent = 0;
  order.additionalInfo.forEach((info) => {
    const yardPP = parseFloat(info?.partPrice) || 0;
    const shippingValueYard = parseShippingValue(info?.shippingDetails || "");
    const yardOthers = parseFloat(info?.others) || 0;
    const escOwnShipReturn = parseFloat(info?.custOwnShippingReturn) || 0;
    const escOwnShipReplacement = parseFloat(info?.custOwnShipReplacement) || 0;
    const yardOwnShippingReplacement = parseFloat(info?.yardOwnShipping) || 0;
    const yardRefundAmount = parseFloat(info?.refundedAmount) || 0;

    const status = info?.status || "";
    const paymentStatus = info?.paymentStatus || "";
    if (status !== "PO cancelled" || (status === "PO cancelled" && paymentStatus === "Card charged")) {
      totalYardSpent +=
        yardPP +
        shippingValueYard +
        yardOthers +
        escOwnShipReturn +
        escOwnShipReplacement +
        yardOwnShippingReplacement -
        yardRefundAmount;
    }
  });

  const soldP = parseFloat(order?.soldP) || 0;
  const salesTax = parseFloat(order?.salestax) || 0;
  const custRefundedAmount = parseFloat(order?.custRefundedAmount) || 0;
  const spMinusTax = soldP - salesTax;
  const subtractRefund = spMinusTax - custRefundedAmount;
  return subtractRefund - totalYardSpent;
}
