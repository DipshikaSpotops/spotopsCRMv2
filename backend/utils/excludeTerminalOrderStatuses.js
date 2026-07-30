/**
 * Terminal order statuses that should not appear on operational yard queues
 * (relocates, expedite, escalations, return-in-transit, etc.).
 */
export const TERMINAL_ORDER_STATUS_NOR = [
  { orderStatus: /^order\s+cancelled$/i },
  { orderStatus: /^refunded$/i },
  { orderStatus: /^dispute/i }, // Dispute, Dispute 2, etc.
  { orderStatus: /^order\s+fulfilled$/i },
  { orderStatus: /^voided$/i },
];

/** Mutates filter to exclude terminal order statuses via $nor. */
export function excludeTerminalOrderStatuses(filter = {}) {
  const existing = Array.isArray(filter.$nor) ? filter.$nor : [];
  filter.$nor = [...existing, ...TERMINAL_ORDER_STATUS_NOR];
  return filter;
}
