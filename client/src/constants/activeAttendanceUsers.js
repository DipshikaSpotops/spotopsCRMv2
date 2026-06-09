/**
 * Active roster for self-service Mark Present / logout (IST rules).
 * Backend GET attendance also appends any other stored firstNames in the requested range (historical rows).
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
  "Guru",
  "Suzanne",
  "Tony",
  "Dipsikha",
  "Alex Morgan",
  "Hannah Presley",
  "Natasha Spencer",
  "Stella Allen",
  "Hardin Scott",
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

/** Match roster to first word (e.g. "Richard Parker" → Richard, "Alex" → Alex Morgan). */
function rosterKeyFromUserFirstName(firstName) {
  const raw = String(firstName || "").trim();
  if (!raw) return "";
  const firstToken = raw.split(/\s+/)[0];
  return normalizeAttendanceFirstNameKey(firstToken);
}

function rosterEntryKey(rosterName) {
  const firstToken = String(rosterName || "").trim().split(/\s+/)[0];
  return normalizeAttendanceFirstNameKey(firstToken);
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
