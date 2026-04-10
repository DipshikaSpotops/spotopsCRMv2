/**
 * Normalize orderStatus strings on write (matches Placed flow: "Customer approved").
 * @param {string} [status]
 * @returns {string|undefined}
 */
export function canonicalOrderStatus(status) {
  if (status == null) return status;
  const s = String(status).trim();
  if (!s) return s;
  const lower = s.toLowerCase();
  if (lower === "customer approved") return "Customer approved";
  return s;
}
