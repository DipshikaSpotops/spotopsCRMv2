/**
 * Active roster for attendance sheet + authorization codes page.
 * Add new names here only — backend attendance + client UI both use this file.
 */
export const ACTIVE_ATTENDANCE_USER_LIST = [
  "Nik",
  "Tristan",
  "James",
  "Mark",
  "Richard",
  "Max",
  "Guru",
  "Suzanne",
  "Tony",
  "Dipsikha",
  "Alex",
  "Hannah",
  "Natasha",
  "Stella",
  "Hardin",
  "Amy",
  "Rhea",
  "Kylie",
  "Olivia",
];

/** First token only — used for attendance table display. */
export function displayAttendanceFirstName(firstName) {
  const token = String(firstName || "").trim().split(/\s+/)[0];
  return token || "";
}

/** Stable key for matching roster rows (handles Dipshika/Dipsikha). */
export function attendanceNameKey(firstName) {
  const key = displayAttendanceFirstName(firstName).toLowerCase();
  if (key === "dipshika") return "dipsikha";
  return key;
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
  return isActiveAttendanceUser(firstName);
}
