/**
 * Active roster for attendance sheet + authorization codes page.
 * Add new names here only — backend attendance + client UI both use this file.
 */
export const ACTIVE_ATTENDANCE_USER_LIST = [
  "Nik",
  "Tristan",
  "James",
  "Richard",
  "Max",
  "Guru",
  "Suzanne",
  "Tony",
  "Tyler",
  "Dipsikha",
  "Alex",
  "Hannah",
  "Natasha",
  "Kevin",
  "Hardin",
  "Amy",
  "Rhea",
  "Chris",
  "Steve",
  "Mona",
  "Duke",
  "Adam",
];

/** Never show on attendance sheet and never require Mark Present. */
export const EXCLUDED_ATTENDANCE_NAMES = [
  "Ashley",
  "Olivia",
  "Emily",
  "John",
  "Ricky",
  "David",
  "Michael",
  "Charlie",
  "Test",
];

/** Hidden from the attendance sheet, but still get the Present popup. */
export const ATTENDANCE_SHEET_HIDDEN_NAMES = ["Mark"];

/** Always get Present popup even if not shown on the attendance sheet. */
export const ATTENDANCE_PRESENT_REQUIRED_NAMES = ["Mark"];

/** Emails that always appear on Authorization Code page (even if firstName roster match fails). */
export const AUTHORIZATION_CODES_EXTRA_EMAILS = new Set([
  "50starsauto116@gmail.com",
]);

/** Emails allowed to open the Authorization Code page (in addition to Admin). */
export const AUTHORIZATION_CODES_VIEWER_EMAILS = new Set([
  "50starsauto110@gmail.com",
]);

/** First token only — used for attendance table display. */
export function displayAttendanceFirstName(firstName) {
  const token = String(firstName || "").trim().split(/\s+/)[0];
  return token || "";
}

/** Stable key for matching roster rows (handles Dipshika/Dipsikha). */
export function attendanceNameKey(firstName) {
  const key = displayAttendanceFirstName(firstName).toLowerCase();
  if (key === "dipshika") return "dipsikha";
  if (key === "taylor" || key === "tylor") return "tyler";
  if (key === "susana" || key === "suzanna") return "suzanne";
  if (key === "ginny") return "olivia";
  return key;
}

export function isExcludedAttendanceName(firstName) {
  const key = attendanceNameKey(firstName);
  if (!key) return false;
  return EXCLUDED_ATTENDANCE_NAMES.some((n) => attendanceNameKey(n) === key);
}

export function isHiddenFromAttendanceSheet(firstName) {
  const key = attendanceNameKey(firstName);
  if (!key) return false;
  return ATTENDANCE_SHEET_HIDDEN_NAMES.some((n) => attendanceNameKey(n) === key);
}

export function isAttendancePresentRequiredName(firstName) {
  const key = attendanceNameKey(firstName);
  if (!key) return false;
  return ATTENDANCE_PRESENT_REQUIRED_NAMES.some((n) => attendanceNameKey(n) === key);
}

/** Display name for marking present: roster spelling if known, else first token. */
export function resolveAttendanceMarkName(firstName) {
  const canonical = canonicalAttendanceName(firstName);
  if (canonical) return canonical;
  return displayAttendanceFirstName(firstName) || null;
}

/** Lookup object: firstName -> { firstName } */
export const activeAttendanceUsers = Object.fromEntries(
  ACTIVE_ATTENDANCE_USER_LIST.map((firstName) => [firstName, { firstName }])
);

export function isActiveAttendanceUser(firstName) {
  const key = attendanceNameKey(firstName);
  if (!key) return false;
  return ACTIVE_ATTENDANCE_USER_LIST.some((a) => attendanceNameKey(a) === key);
}

export function canonicalAttendanceName(firstName) {
  const key = attendanceNameKey(firstName);
  if (!key) return null;
  return ACTIVE_ATTENDANCE_USER_LIST.find((a) => attendanceNameKey(a) === key) || null;
}

export function isOnAttendanceRoster(firstName) {
  if (isExcludedAttendanceName(firstName)) return false;
  if (isHiddenFromAttendanceSheet(firstName)) return false;
  return isActiveAttendanceUser(firstName);
}

export function isOnAuthorizationCodesRoster({ firstName, email } = {}) {
  if (isOnAttendanceRoster(firstName)) return true;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return AUTHORIZATION_CODES_EXTRA_EMAILS.has(normalizedEmail);
}

/** Client/server: use auth user payload when available (DB roster flag). */
export function userRequiresAttendanceRoster(user) {
  if (!user) return false;
  if (String(user.role || "").trim() === "Admin") return false;
  if (isExcludedAttendanceName(user.firstName)) return false;
  if (isAttendancePresentRequiredName(user.firstName)) return true;
  if (isOnAttendanceRoster(user.firstName)) return true;
  if (user.onAttendanceRoster === false) return false;
  if (user.onAttendanceRoster === true) return true;
  const email = String(user.email || "").trim().toLowerCase();
  if (AUTHORIZATION_CODES_EXTRA_EMAILS.has(email)) return true;
  if (user.onAttendanceRoster === undefined) return true;
  return false;
}
