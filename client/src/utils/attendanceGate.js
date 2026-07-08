import {
  attendanceNameKey,
  canonicalAttendanceName,
  isActiveAttendanceUser,
} from "../constants/activeAttendanceUsers";
import { todayDateKeyIST } from "./attendanceStatus";
import { fetchAttendance } from "./attendanceApi";

export const ATTENDANCE_BLOCKING_KEY = "attendanceBlocking";

/** True when user is on the roster and has not marked present for today's IST shift day. */
export async function userNeedsAttendanceMark(firstName) {
  if (!isActiveAttendanceUser(firstName)) return false;

  const canonical = canonicalAttendanceName(firstName);
  if (!canonical) return false;

  const dateKey = todayDateKeyIST();
  const data = await fetchAttendance(dateKey);
  const row = (data?.rows || []).find(
    (r) => attendanceNameKey(r.firstName) === attendanceNameKey(canonical)
  );
  return !row?.loginAt;
}

export function setAttendanceBlocking(active) {
  if (active) {
    sessionStorage.setItem(ATTENDANCE_BLOCKING_KEY, "true");
    window.dispatchEvent(new Event("attendance-blocking-changed"));
  } else {
    sessionStorage.removeItem(ATTENDANCE_BLOCKING_KEY);
    window.dispatchEvent(new Event("attendance-blocking-changed"));
  }
}

export function isAttendanceBlocking() {
  return sessionStorage.getItem(ATTENDANCE_BLOCKING_KEY) === "true";
}
