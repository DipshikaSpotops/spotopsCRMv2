import API from "../api";

/**
 * @param {string | { start: string; end: string } | { date?: string }} params
 *        Day mode: string YYYY-MM-DD or { date }
 *        Range mode: { start, end } ISO (same as UnifiedDatePicker / orders API)
 */
export async function fetchAttendance(params) {
  const q =
    typeof params === "string"
      ? { date: params }
      : params?.start && params?.end
        ? { start: params.start, end: params.end }
        : { date: params?.date };
  const { data } = await API.get("/attendance", { params: q });
  return data;
}

export async function markMyAttendancePresent() {
  const { data } = await API.post("/attendance/mark-present");
  return data;
}

/** Call before auth logout; non-blocking on failure */
export async function recordAttendanceLogout() {
  try {
    await API.patch("/attendance/logout");
  } catch (e) {
    console.warn("[attendance] logout record failed:", e?.message);
  }
}

/** @param {{ dateKey: string, firstName: string, action: string, at?: string }} payload — `at` ISO 8601 for markPresentNow / markLogoutNow */
export async function adminUpdateAttendanceEntry(payload) {
  const { data } = await API.patch("/attendance/admin/entry", payload);
  return data;
}
