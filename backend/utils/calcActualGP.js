import moment from "moment-timezone";

const TZ = "America/Chicago";

function normalizeStatusForCalc(raw) {
  const s = (raw || "").trim();
  if (s === "Dispute 2") return "Dispute after Cancellation";
  return s;
}

/** Order-level reimbursement with a date — goodwill payout, reduces actual GP. */
export function orderLevelReimbursementDeduction(orderLike) {
  if (!orderLike?.reimbursementDate) return 0;
  const amount = parseFloat(orderLike.reimbursementAmount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/** Single source of truth for Actual GP math (keep in sync with client OrderDetails.jsx). */
export function calcActualGP(orderLike) {
  if (!orderLike) return 0;

  const orderReimbursement = orderLevelReimbursementDeduction(orderLike);

  const sp = parseFloat(orderLike.soldP) || 0;
  const tax = parseFloat(orderLike.salestax) || 0;
  const spMinusTax = parseFloat(orderLike.spMinusTax) || sp - tax;
  const custRefundedAmount =
    (parseFloat(orderLike.custRefundedAmount) || 0) +
    (parseFloat(orderLike.cancelledRefAmount) || 0) +
    (parseFloat(orderLike.custRefAmount) || 0);

  const additionalInfo = Array.isArray(orderLike.additionalInfo)
    ? orderLike.additionalInfo
    : [];

  const status = normalizeStatusForCalc(orderLike.orderStatus);
  const isDispute = ["Dispute", "Dispute after Cancellation"].includes(status);
  const isCancelled = status === "Order Cancelled";
  const isRefunded = status === "Refunded";

  if (!additionalInfo.length) {
    if (isDispute) return 0 - tax - orderReimbursement;
    if (isRefunded || isCancelled) {
      return sp - custRefundedAmount - tax - orderReimbursement;
    }
    return 0 - orderReimbursement;
  }

  let totalSum = 0;

  additionalInfo.forEach((yard) => {
    const paymentStatus = (yard.paymentStatus || "").trim();
    const refundStatusRaw = (yard.refundStatus || "").trim().toLowerCase();
    const isRefundCollected = refundStatusRaw.includes("refund collected");

    if (paymentStatus === "Card charged") {
      const yardPP = parseFloat(yard.partPrice) || 0;
      const shippingDetails = yard.shippingDetails || "";
      let shippingValueYard = 0;
      if (shippingDetails && shippingDetails.includes(":")) {
        const match = shippingDetails.match(
          /(?:Own shipping|Yard shipping):\s*([\d.]+)/i
        );
        if (match) shippingValueYard = parseFloat(match[1]) || 0;
      }

      const yardOthers = parseFloat(yard.others) || 0;
      const escOwnShipReturn = parseFloat(yard.custOwnShippingReturn) || 0;
      const escOwnShipReplacement = parseFloat(yard.custOwnShipReplacement) || 0;
      const yardOwnShippingReplacement = parseFloat(yard.yardOwnShipping) || 0;
      const yardRefundAmountRaw = parseFloat(yard.refundedAmount) || 0;
      const yardRefundAmount = isRefundCollected ? yardRefundAmountRaw : 0;
      // Legacy: yard-level reimbursement in yard spend. New flow: order-level date+amount only.
      const escReimbursement =
        orderReimbursement > 0
          ? 0
          : parseFloat(yard.reimbursementAmount) || 0;

      totalSum +=
        yardPP +
        shippingValueYard +
        yardOthers +
        escOwnShipReturn +
        escOwnShipReplacement +
        yardOwnShippingReplacement +
        escReimbursement -
        yardRefundAmount;
    }
  });

  let actualGP = 0;

  const allYardsNotCharged = additionalInfo.every((yard) => {
    const paymentStatus = (yard.paymentStatus || "").trim();
    return !paymentStatus || paymentStatus === "Card not charged";
  });

  if (allYardsNotCharged) {
    if (isDispute) actualGP = 0 - tax;
    else if (isRefunded || isCancelled) actualGP = sp - custRefundedAmount - tax;
    else actualGP = 0;
  } else if (totalSum > 0) {
    const subtractRefund = spMinusTax - custRefundedAmount;
    if (isDispute) actualGP = 0 - (totalSum + tax);
    else actualGP = subtractRefund - totalSum;
  } else {
    if (isDispute) actualGP = 0 - tax;
    else if (isRefunded || isCancelled) actualGP = sp - custRefundedAmount - tax;
    else actualGP = 0;
  }

  return (Number.isFinite(actualGP) ? actualGP : 0) - orderReimbursement;
}

/** True when order-level reimbursement (new UI) should affect actual GP. */
export function shouldApplyOrderLevelReimbursement(orderLike) {
  return orderLevelReimbursementDeduction(orderLike) > 0;
}

/** Persist actualGP when computed value differs from stored value. */
export async function recalculateAndSaveActualGP(orderDoc, { firstName = "CRM", req, publish, broadcastOrder } = {}) {
  if (!orderDoc) return null;

  const plain = orderDoc.toObject ? orderDoc.toObject() : orderDoc;
  const computed = calcActualGP(plain);
  const previous = Number(orderDoc.actualGP ?? 0);

  if (Math.abs(previous - computed) <= 0.0001) {
    return computed;
  }

  orderDoc.actualGP = computed;
  orderDoc.orderHistory = orderDoc.orderHistory || [];
  const formattedDateTime = moment().tz(TZ).format("D MMM, YYYY HH:mm");
  const editor = String(firstName || "CRM").trim() || "CRM";
  const entry = `Actual GP updated to ${computed.toFixed(2)} by ${editor} on ${formattedDateTime}`;
  if (orderDoc.orderHistory[orderDoc.orderHistory.length - 1] !== entry) {
    orderDoc.orderHistory.push(entry);
  }

  await orderDoc.save();

  const orderNo = orderDoc.orderNo;
  if (req && publish && orderNo) {
    publish(req, orderNo, { type: "GP_UPDATED", actualGP: orderDoc.actualGP });
  }
  if (req && broadcastOrder) {
    broadcastOrder(req, orderDoc);
  }

  return computed;
}
