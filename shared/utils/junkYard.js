/**
 * Junk / escalation yard detection — aligned with YardEscalationModal + Junk Parts.
 *
 * Escalation processes: Replacement, Return, Junk.
 * Junked outcome:
 *   - Process = Junk
 *   - Process = Replacement AND customer reason = Junked (part junked via replacement flow)
 */

export function normStr(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Yard row is a junked part outcome (case-insensitive).
 * - Process = Junk
 * - Customer reason = Junked (Replacement flow, or legacy Return + Junked rows)
 */
export function isJunkEscalationOutcome(yard) {
  const process = normStr(yard?.escalationProcess);
  const reason = normStr(yard?.custReason);

  if (process === "junk") return true;
  if (reason === "junked") return true;

  return false;
}

/**
 * Yard has gone through escalation (modal save, status, or history).
 * @param {object} yard
 * @param {{ history?: string[], yardNum?: number }} [opts]
 */
export function isEscalatedYard(yard, opts = {}) {
  const tick = normStr(yard?.escTicked);
  if (["yes", "true", "checked", "ticked"].includes(tick)) return true;

  if (normStr(yard?.status) === "escalation") return true;

  if (String(yard?.escalationProcess ?? "").trim()) return true;
  if (String(yard?.escalationCause ?? "").trim()) return true;

  const { history, yardNum } = opts;
  if (!Array.isArray(history) || yardNum == null) return false;

  const yardRe = new RegExp(`\\bYard ${yardNum}\\b`, "i");
  for (const raw of history) {
    const line = String(raw || "");
    if (!yardRe.test(line)) continue;
    if (/status updated to\s+escalation/i.test(line)) return true;
    if (/escalation\/details updated/i.test(line)) return true;
  }

  return false;
}

/** Escalated yard with a junk outcome (Junk process or Replacement + Junked). */
export function isJunkedPartYard(yard, opts = {}) {
  if (!isEscalatedYard(yard, opts)) return false;
  return isJunkEscalationOutcome(yard);
}
