import {
  ACTIVE_ATTENDANCE_USER_LIST,
  AUTHORIZATION_CODES_EXTRA_EMAILS,
  displayAttendanceFirstName,
  isOnAttendanceRoster as legacyIsOnAttendanceRoster,
} from "../../shared/constants/activeAttendanceUsers.js";
import User from "../models/User.js";

export function defaultOnAttendanceRosterForRole(role) {
  return String(role || "").trim() !== "Admin";
}

/** Whether user appears on attendance sheet + authorization codes page. */
export function resolveUserOnAttendanceRoster(user) {
  if (!user) return false;
  if (String(user.role || "").trim() === "Admin") return false;
  if (user.onAttendanceRoster === false) return false;
  if (user.onAttendanceRoster === true) return true;

  const email = String(user.email || "").trim().toLowerCase();
  if (AUTHORIZATION_CODES_EXTRA_EMAILS.has(email)) return true;
  if (legacyIsOnAttendanceRoster(user.firstName)) return true;
  // Non-admin users without an explicit flag (e.g. created before this field existed).
  if (user.onAttendanceRoster === undefined) return true;
  return false;
}

/** Active roster first names: legacy list + users flagged in DB (auto-includes new Sales/Support). */
export async function loadActiveAttendanceRosterNames() {
  const dbUsers = await User.find({ role: { $ne: "Admin" } })
    .select("firstName email role onAttendanceRoster")
    .lean();

  const nameKeys = new Set();
  const ordered = [];

  const addName = (name) => {
    const display = displayAttendanceFirstName(name);
    if (!display) return;
    const key = display.toLowerCase();
    if (nameKeys.has(key)) return;
    nameKeys.add(key);
    ordered.push(display);
  };

  for (const legacyName of ACTIVE_ATTENDANCE_USER_LIST) {
    addName(legacyName);
  }

  for (const user of dbUsers) {
    if (!resolveUserOnAttendanceRoster(user)) continue;
    addName(user.firstName);
  }

  return ordered;
}
