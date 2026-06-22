/**
 * Re-export shared attendance roster for the client app.
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
  if (key === "ginny") return "olivia";
  return key;
}

/** Lookup object: firstName -> { firstName } */
export const activeAttendanceUsers = Object.fromEntries(
  ACTIVE_ATTENDANCE_USER_LIST.map((firstName) => [firstName, { firstName }])
);

function normalizeAttendanceFirstNameKey(firstName) {
  const n = String(firstName || "").trim().toLowerCase();
  if (n === "dipshika") return "dipsikha";
  return n;
}

/** Match roster to first word (e.g. "Richard Parker" → Richard, "Alex Morgan" → Alex). */
function rosterKeyFromUserFirstName(firstName) {
  return attendanceNameKey(firstName);
}

function rosterEntryKey(rosterName) {
  return attendanceNameKey(rosterName);
}

export function isActiveAttendanceUser(firstName) {
  const key = rosterKeyFromUserFirstName(firstName);
  if (!key) return false;
  return ACTIVE_ATTENDANCE_USER_LIST.some((a) => rosterEntryKey(a) === key);
}

export function canonicalAttendanceName(firstName) {
  const key = rosterKeyFromUserFirstName(firstName);
  if (!key) return null;
  return ACTIVE_ATTENDANCE_USER_LIST.find((a) => rosterEntryKey(a) === key) || null;
}
