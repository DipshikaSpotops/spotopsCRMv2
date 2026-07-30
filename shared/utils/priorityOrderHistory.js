import moment from "moment-timezone";

const TZ = "America/Chicago";
const HISTORY_DATE_FORMATS = [
  "D MMM, YYYY HH:mm",
  "DD MMM, YYYY HH:mm",
  "D MMM YYYY HH:mm",
  "DD MMM YYYY HH:mm",
];

/** Must be at least 4 calendar days — i.e. more than 3 full days. */
export const PRIORITY_STALE_MIN_CALENDAR_DAYS = 4;

const YARD_PO_SENT_STATUS = /^yard\s+po\s+sent$/i;

/** Parse "on …" timestamp from orderHistory lines (America/Chicago). */
export function parseHistoryWhen(whenStr) {
  if (!whenStr) return null;
  const trimmed = String(whenStr).trim();
  for (const fmt of HISTORY_DATE_FORMATS) {
    const m = moment.tz(trimmed, fmt, TZ);
    if (m.isValid()) return m;
  }
  const fallback = moment(trimmed);
  return fallback.isValid() ? fallback.tz(TZ) : null;
}

export function extractHistoryWhen(line) {
  const whenMatch = String(line).match(/\bon\s(.+)$/i);
  return whenMatch ? whenMatch[1].trim() : null;
}

/** Whole calendar days in America/Chicago (matches “X days” in the UI). */
export function daysSinceHistoryWhen(whenStr, now = moment().tz(TZ)) {
  const since = parseHistoryWhen(whenStr);
  if (!since) return null;
  const endDay = now.clone().startOf("day");
  const startDay = since.clone().startOf("day");
  return endDay.diff(startDay, "days");
}

export function isStaleEnoughCalendarDays(calendarDays) {
  const n = Number(calendarDays);
  return Number.isFinite(n) && n >= PRIORITY_STALE_MIN_CALENDAR_DAYS;
}

/**
 * When yard N last entered "Yard PO Sent" (from orderHistory).
 * Matches: "Yard N PO sent by …", "Yard N status updated to Yard PO Sent …",
 * and "Yard N label voided …" (status becomes Yard PO Sent).
 */
export function getYardPOSentSinceWhen(orderHistory, yardIndex1Based) {
  const hist = Array.isArray(orderHistory) ? orderHistory : [];
  let sinceWhen = null;

  const poSentRe = new RegExp(`^Yard\\s+${yardIndex1Based}\\s+PO\\s+sent\\s+by\\b`, "i");
  const labelVoidedRe = new RegExp(`^Yard\\s+${yardIndex1Based}\\s+label\\s+voided\\b`, "i");
  const statusRe = new RegExp(
    `^Yard\\s+${yardIndex1Based}\\s+status\\s+updated\\s+to\\s+(.+?)\\s+by\\s+`,
    "i"
  );

  for (const line of hist) {
    const str = String(line);
    const whenStr = extractHistoryWhen(str);

    if (poSentRe.test(str) || labelVoidedRe.test(str)) {
      sinceWhen = whenStr;
      continue;
    }

    const statusMatch = str.match(statusRe);
    if (statusMatch) {
      const newStatus = statusMatch[1].trim();
      if (YARD_PO_SENT_STATUS.test(newStatus)) {
        sinceWhen = whenStr;
      } else {
        sinceWhen = null;
      }
    }
  }

  return sinceWhen;
}

/**
 * Prefer the newer of history "when" vs yard.poSentDate so a re-sent / new-yard PO
 * resets Days Stale even if an older history line still exists.
 */
function resolveYardPOSentCalendarDays(yard, orderHistory, yardIndex1Based, now = moment().tz(TZ)) {
  const whenStr = getYardPOSentSinceWhen(orderHistory, yardIndex1Based);
  const fromHistory = whenStr ? daysSinceHistoryWhen(whenStr, now) : null;

  let fromPoDate = null;
  let poDateFormatted = null;
  if (yard?.poSentDate) {
    const m = moment(yard.poSentDate).tz(TZ);
    if (m.isValid()) {
      fromPoDate = now.clone().startOf("day").diff(m.clone().startOf("day"), "days");
      poDateFormatted = m.format("D MMM, YYYY HH:mm");
    }
  }

  if (fromHistory == null && fromPoDate == null) {
    return { calendarDays: null, statusSince: whenStr };
  }
  if (fromHistory == null) {
    return { calendarDays: fromPoDate, statusSince: whenStr || poDateFormatted };
  }
  if (fromPoDate == null) {
    return { calendarDays: fromHistory, statusSince: whenStr };
  }
  // Fewer days = more recent start — use that after a new PO.
  if (fromPoDate <= fromHistory) {
    return { calendarDays: fromPoDate, statusSince: poDateFormatted || whenStr };
  }
  return { calendarDays: fromHistory, statusSince: whenStr };
}

/**
 * Yards still on Yard PO Sent for more than 3 calendar days (4+ shown).
 * Only the latest yard (current) counts — older yards must not keep Days Stale
 * stuck on Yard 1 after a new PO / relocate.
 */
export function getStaleYardPOSentEntries(order) {
  const yards = Array.isArray(order?.additionalInfo) ? order.additionalInfo : [];
  if (!yards.length) return [];

  const lastIndex = yards.length - 1;
  const yard = yards[lastIndex];
  const status = String(yard?.status || "").trim();
  if (!YARD_PO_SENT_STATUS.test(status)) return [];

  const { calendarDays, statusSince } = resolveYardPOSentCalendarDays(
    yard,
    order?.orderHistory,
    lastIndex + 1
  );
  if (calendarDays == null || !isStaleEnoughCalendarDays(calendarDays)) return [];

  return [
    {
      yardIndex: lastIndex + 1,
      yardName: yard?.yardName || "",
      statusSince: statusSince || "",
      daysInStatus: calendarDays,
      reason: "yard_po_sent",
    },
  ];
}

/**
 * When the order's current main status last took effect (from orderHistory).
 */
export function getOrderStatusSinceWhen(orderHistory, currentStatus) {
  const hist = Array.isArray(orderHistory) ? orderHistory : [];
  const target = normalizeStatusLabel(currentStatus);
  if (!target) return null;

  let statusSince = null;
  const targetIsYardProcessing = target === "yard processing";

  for (const line of hist) {
    const str = String(line);
    const whenStr = extractHistoryWhen(str);

    if (/^Order placed by\b/i.test(str)) {
      statusSince = normalizeStatusLabel("Placed") === target ? whenStr : null;
      continue;
    }

    if (/^Partially charged order by\b/i.test(str)) {
      statusSince =
        normalizeStatusLabel("Partially charged order") === target ? whenStr : null;
      continue;
    }

    if (/^Order Cancelled by\b/i.test(str)) {
      statusSince =
        normalizeStatusLabel("Order Cancelled") === target ? whenStr : null;
      continue;
    }

    // sendPO sets orderStatus to Yard Processing but usually does not append
    // "Order status changed → Yard Processing". Each new PO must reset the clock.
    if (targetIsYardProcessing && /^Yard\s+\d+\s+PO\s+sent\s+by\b/i.test(str)) {
      statusSince = whenStr;
      continue;
    }

    const arrowMatch = str.match(/^Order status changed:\s*.+?\s*→\s*(.+?)\s+by\b/i);
    if (arrowMatch) {
      const newStatus = normalizeStatusLabel(arrowMatch[1].trim());
      statusSince = newStatus === target ? whenStr : null;
      continue;
    }

    const changedToMatch = str.match(/^Order status changed to\s+(.+?)\s+by\b/i);
    if (changedToMatch) {
      let newStatus = changedToMatch[1].trim();
      newStatus = newStatus.replace(/\s*\([^)]*\)\s*$/, "").trim();
      statusSince = normalizeStatusLabel(newStatus) === target ? whenStr : null;
      continue;
    }

    const setToMatch = str.match(/^Order status set to\s+(.+?)\s+by\b/i);
    if (setToMatch) {
      let newStatus = setToMatch[1].trim();
      // "Yard Processing (Yard 2)" → Yard Processing
      newStatus = newStatus.replace(/\s*\([^)]*\)\s*$/, "").trim();
      statusSince = normalizeStatusLabel(newStatus) === target ? whenStr : null;
    }
  }

  return statusSince;
}

export function normalizeStatusLabel(status) {
  return String(status || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Not eligible for Priority Orders list — only track up to Yard Processing. */
export function isExcludedFromPriorityOrders(orderStatus) {
  const normalized = normalizeStatusLabel(orderStatus);
  if (!normalized) return false;
  if (normalized === "order cancelled" || normalized === "refunded") return true;
  if (normalized === "dispute" || normalized === "dispute 2") return true;
  if (normalized.startsWith("dispute")) return true;
  if (normalized === "in transit") return true;
  if (normalized === "order fulfilled") return true;
  if (normalized === "voided") return true;
  return false;
}

/** Main order status unchanged for more than 3 calendar days (4+ shown). */
export function getStaleOrderStatusEntry(order) {
  const orderStatus = String(order?.orderStatus || "").trim();
  if (!orderStatus || isExcludedFromPriorityOrders(orderStatus)) return null;

  const whenStr = getOrderStatusSinceWhen(order?.orderHistory, orderStatus);
  if (!whenStr) return null;

  const calendarDays = daysSinceHistoryWhen(whenStr);
  if (!isStaleEnoughCalendarDays(calendarDays)) return null;

  return {
    orderStatus,
    statusSince: whenStr,
    daysInStatus: calendarDays,
    reason: "order_status",
  };
}

export function orderQualifiesForPriority(order) {
  if (isExcludedFromPriorityOrders(order?.orderStatus)) return false;
  return (
    getStaleYardPOSentEntries(order).length > 0 ||
    getStaleOrderStatusEntry(order) != null
  );
}

export function enrichPriorityOrder(order) {
  const staleYards = getStaleYardPOSentEntries(order);
  const staleOrderStatus = getStaleOrderStatusEntry(order);

  const priorityReasons = [];
  if (staleYards.length) priorityReasons.push("yard_po_sent");
  if (staleOrderStatus) priorityReasons.push("order_status");

  const maxPriorityDays = Math.max(
    staleYards.reduce((max, y) => Math.max(max, y.daysInStatus || 0), 0),
    staleOrderStatus?.daysInStatus || 0
  );

  return {
    ...order,
    staleYards,
    staleOrderStatus,
    priorityReasons,
    maxPriorityDays,
    maxDaysInYardLocated: maxPriorityDays,
  };
}
