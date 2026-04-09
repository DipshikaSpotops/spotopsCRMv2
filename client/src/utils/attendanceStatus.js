import moment from "moment-timezone";

const IST = "Asia/Kolkata";
/** Calendar day for `dateKey` / wall range; matches client Attendance ZONE + backend Dallas shift day. */
const DALLAS = "America/Chicago";

/** Saturday or Sunday on the Dallas calendar for this `YYYY-MM-DD` key. */
export function isWeekendAttendanceDateKey(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return false;
  const dow = moment.tz(String(dateKey), "YYYY-MM-DD", DALLAS).day();
  return dow === 0 || dow === 6;
}

/** Calendar day key for attendance (must match server todayDateKeyIST). */
export function todayDateKeyIST() {
  const now = moment().tz(IST);
  const mins = now.hour() * 60 + now.minute();
  // Night shift belongs to previous date until 04:30 IST.
  if (mins < 4 * 60 + 30) return now.clone().subtract(1, "day").format("YYYY-MM-DD");
  return now.format("YYYY-MM-DD");
}

function timeStrIST(iso) {
  if (!iso) return "";
  return moment(iso).tz(IST).format("h:mm A");
}

function istMinutesFromMidnight(iso) {
  const m = moment(iso).tz(IST);
  return m.hour() * 60 + m.minute();
}

/**
 * Shift-relative minutes for night shift starting 18:30 IST.
 * Times after midnight are treated as continuation of previous shift day.
 */
function shiftRelativeMinutes(iso) {
  let mins = istMinutesFromMidnight(iso);
  if (mins < 18 * 60 + 30) mins += 24 * 60;
  return mins;
}

/** 6:30 PM–6:40 PM IST inclusive */
function isOnTimeLoginIST(loginIso) {
  const mins = shiftRelativeMinutes(loginIso);
  return mins >= 18 * 60 + 30 && mins <= 18 * 60 + 40;
}

/** After 6:40 PM and before 10:00 PM IST */
function isLateLoginIST(loginIso) {
  const mins = shiftRelativeMinutes(loginIso);
  return mins > 18 * 60 + 40 && mins < 22 * 60;
}

/** From 10:00 PM IST onward */
function isHalfDayArrivalIST(loginIso) {
  const mins = shiftRelativeMinutes(loginIso);
  return mins >= 22 * 60;
}

/** Left at or before 12:30 AM IST (next day) → half day (early departure). */
function isHalfDayEarlyLogoutIST(logoutIso) {
  const mins = shiftRelativeMinutes(logoutIso);
  return mins <= 24 * 60 + 30;
}

/**
 * Row background: weekend (no login) | absent | half day | late | on-time / other present (green).
 * @param {object} row
 * @param {string} [dateKey] Dallas `YYYY-MM-DD` for this cell (month grid passes this; detail rows use row.dateKey).
 */
export function getAttendanceRowCategory(row, dateKey) {
  const dk = dateKey ?? row?.dateKey;
  const loginAt = row?.loginAt;
  if (!loginAt) {
    if (dk && isWeekendAttendanceDateKey(dk)) return "weekend";
    return "absent";
  }
  if (isHalfDayArrivalIST(loginAt)) return "half_day";
  const logoutAt = row?.logoutAt;
  if (logoutAt && isHalfDayEarlyLogoutIST(logoutAt)) return "half_day";
  if (isLateLoginIST(loginAt)) return "late";
  return "full_day";
}

/**
 * @param {{ loginAt?: string|Date|null, logoutAt?: string|Date|null, dateKey?: string }} row
 * @param {string} [dateKey] For empty cells when `row.dateKey` is missing (month grid).
 */
export function formatAttendanceStatus(row, dateKey) {
  const dk = dateKey ?? row?.dateKey;
  const loginAt = row?.loginAt;
  if (!loginAt) {
    if (dk && isWeekendAttendanceDateKey(dk)) return "Weekend";
    return "Absent";
  }

  const parts = [];

  if (isOnTimeLoginIST(loginAt)) {
    parts.push(`Logged In — ${timeStrIST(loginAt)} IST`);
  } else if (isLateLoginIST(loginAt)) {
    parts.push(`Late Login — ${timeStrIST(loginAt)} IST`);
  } else if (isHalfDayArrivalIST(loginAt)) {
    parts.push(`Half Day — After 10:00 PM IST (${timeStrIST(loginAt)} IST)`);
  } else {
    parts.push(`Logged In — ${timeStrIST(loginAt)} IST`);
  }

  const logoutAt = row?.logoutAt;
  if (logoutAt) {
    parts.push(`Logged out ${timeStrIST(logoutAt)} IST`);
    if (isHalfDayEarlyLogoutIST(logoutAt)) {
      parts.push("Half Day (logout on or before 12:30 AM IST)");
    }
  }

  return parts.join(" • ");
}

/** Short label for month-grid cells (full detail in title / detail table). */
export function shortAttendanceLabel(row, dateKey) {
  const dk = dateKey ?? row?.dateKey;
  if (!row?.loginAt) {
    if (dk && isWeekendAttendanceDateKey(dk)) return "Weekend";
    return "Absent";
  }
  const cat = getAttendanceRowCategory(row, dk);
  if (cat === "half_day") return "Half day";
  if (isOnTimeLoginIST(row.loginAt)) return "On time";
  if (isLateLoginIST(row.loginAt)) return "Late";
  return "Present";
}

/**
 * Bucket for month-overview per-user counts (one category per user × day cell).
 * Order matches shortAttendanceLabel precedence.
 */
export function getMonthOverviewCellBucket(row, dateKey) {
  const dk = dateKey ?? row?.dateKey;
  if (!row?.loginAt) {
    if (dk && isWeekendAttendanceDateKey(dk)) return "weekend";
    return "absent";
  }
  if (getAttendanceRowCategory(row, dateKey) === "half_day") return "half_day";
  if (isOnTimeLoginIST(row.loginAt)) return "on_time";
  if (isLateLoginIST(row.loginAt)) return "late";
  return "present_other";
}
