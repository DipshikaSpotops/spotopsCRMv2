import moment from "moment-timezone";

const TZ = "America/Chicago";

function isWeekend(m) {
  const dow = m.day(); // 0 = Sun, 6 = Sat
  return dow === 0 || dow === 6;
}

/**
 * Add N full business days (Mon–Fri) in America/Chicago, keeping clock time.
 * e.g. Mon 15:00 + 2 → Wed 15:00; Fri 15:00 + 2 → Tue 15:00.
 */
export function addBusinessDays(startDate, days, tz = TZ) {
  const n = Math.max(0, Number(days) || 0);
  let m = moment.tz(startDate, tz);
  if (!m.isValid()) return null;

  let added = 0;
  while (added < n) {
    m = m.add(1, "day");
    if (!isWeekend(m)) added += 1;
  }
  return m.toDate();
}

/**
 * Go back N business days from `endDate` (same clock time).
 * Used to compute the latest orderDate that is already due for a 2-biz-day SLA.
 */
export function subtractBusinessDays(endDate, days, tz = TZ) {
  const n = Math.max(0, Number(days) || 0);
  let m = moment.tz(endDate, tz);
  if (!m.isValid()) return null;

  let removed = 0;
  while (removed < n) {
    m = m.subtract(1, "day");
    if (!isWeekend(m)) removed += 1;
  }
  return m.toDate();
}

export function isBusinessDayDue(orderDate, businessDays = 2, now = new Date(), tz = TZ) {
  const dueAt = addBusinessDays(orderDate, businessDays, tz);
  if (!dueAt) return false;
  return moment.tz(now, tz).isSameOrAfter(moment.tz(dueAt, tz));
}
