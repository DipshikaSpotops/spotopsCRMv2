/**
 * Roster for the attendance calendar (IST rules).
 * Keep firstName values in sync with backend routes/attendance.js ACTIVE_ATTENDANCE_NAMES.
 */
export const ACTIVE_ATTENDANCE_USER_LIST = [
  "Nik",
  "Tristan",
  "James",
  "Mark",
  "Richard",
  "Ashley",
  "Max",
  "Peter",
  "Jessie",
  "Guru",
  "Suzanne",
  "Tony",
  "Dipsikha",
];

/** Lookup object: firstName -> { firstName } */
export const activeAttendanceUsers = Object.fromEntries(
  ACTIVE_ATTENDANCE_USER_LIST.map((firstName) => [firstName, { firstName }])
);

function normalizeAttendanceFirstNameKey(firstName) {
  const n = String(firstName || "").trim().toLowerCase();
  if (n === "dipshika") return "dipsikha";
  return n;
}

/** Match roster to first word (e.g. "Richard Parker" → Richard). */
function rosterKeyFromUserFirstName(firstName) {
  const raw = String(firstName || "").trim();
  if (!raw) return "";
  const firstToken = raw.split(/\s+/)[0];
  return normalizeAttendanceFirstNameKey(firstToken);
}

export function isActiveAttendanceUser(firstName) {
  const key = rosterKeyFromUserFirstName(firstName);
  if (!key) return false;
  return ACTIVE_ATTENDANCE_USER_LIST.some((a) => a.toLowerCase() === key);
}

export function canonicalAttendanceName(firstName) {
  const key = rosterKeyFromUserFirstName(firstName);
  if (!key) return null;
  return (
    ACTIVE_ATTENDANCE_USER_LIST.find((a) => a.toLowerCase() === key) ||
    null
  );
}
