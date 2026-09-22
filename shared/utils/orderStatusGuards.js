/**
 * Order statuses that should not be auto-changed by yard updates
 * (Edit Status, Escalation, void label, etc.). Manual order-status edits still allowed.
 */
export function isProtectedFromYardAutoStatus(orderStatus) {
  const s = String(orderStatus || "").trim().toLowerCase();
  if (!s) return false;
  if (s === "order cancelled") return true;
  if (s === "refunded") return true;
  if (s === "dispute") return true;
  if (s === "dispute after cancellation") return true;
  if (s === "dispute 2") return true; // legacy alias
  return false;
}
