/**
 * Re-export shared attendance roster for the client app.
 */
export {
  ACTIVE_ATTENDANCE_USER_LIST,
  EXCLUDED_ATTENDANCE_NAMES,
  AUTHORIZATION_CODES_EXTRA_EMAILS,
  AUTHORIZATION_CODES_VIEWER_EMAILS,
  displayAttendanceFirstName,
  attendanceNameKey,
  isExcludedAttendanceName,
  resolveAttendanceMarkName,
  activeAttendanceUsers,
  isActiveAttendanceUser,
  canonicalAttendanceName,
  isOnAttendanceRoster,
  isOnAuthorizationCodesRoster,
  userRequiresAttendanceRoster,
} from "@spotops/shared/constants/activeAttendanceUsers.js";
