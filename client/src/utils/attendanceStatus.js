import moment from "moment-timezone";

const IST = "Asia/Kolkata";

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

/** Row background: absent (red) | half day (orange) | present without half-day rules (green). */
export function getAttendanceRowCategory(row) {
  const loginAt = row?.loginAt;
  if (!loginAt) return "absent";
  if (isHalfDayArrivalIST(loginAt)) return "half_day";
  const logoutAt = row?.logoutAt;
  if (logoutAt && isHalfDayEarlyLogoutIST(logoutAt)) return "half_day";
  return "full_day";
}

/**
 * @param {{ loginAt?: string|Date|null, logoutAt?: string|Date|null }} row
 * @returns {string} Status column for the attendance table
 */
export function formatAttendanceStatus(row) {
  const loginAt = row?.loginAt;
  if (!loginAt) return "Absent";

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
