function parseShippingValue(field = "") {
  if (typeof field !== "string") return 0;
  if (!field.includes(":")) return 0;
  const parts = field.split(":");
  const num = parseFloat(String(parts[1]).trim());
  return isNaN(num) ? 0 : num;
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
