/** Emails (besides Admin role) allowed to assign Placed orders to teams. */
export const ASSIGN_ORDERS_EMAILS = [
  "spotopsdigital.darshan@gmail.com",
  "50starsauto110@gmail.com",
];

export function isAssignOrdersEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return ASSIGN_ORDERS_EMAILS.some((e) => e.toLowerCase() === normalized);
}

/** Admin role or allowlisted email may use Assign Orders. */
export function canAssignOrders(user) {
  if (!user) return false;
  const role = String(user.role || "").trim().toLowerCase();
  if (role === "admin") return true;
  return isAssignOrdersEmail(user.email);
}
