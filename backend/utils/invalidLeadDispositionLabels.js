/**
 * Gmail / CRM labels that mark a lead as invalid for part-wise "received" rollups.
 * Aligns with label normalization used in statistics (see gmailController.normalizeStatsLabel).
 */
export const INVALID_DISPOSITION_CANONICAL = new Set([
  "Not in Service",
  "Duplicate",
  "Invalid",
  "Need New",
  "No Part",
  "No Number",
  "Spanish customer",
  "Wrong description",
  "wrong Number",
]);

/** Map a raw user label to a canonical stats label, or null if unknown. */
export function normalizeDispositionLabelForInvalidCheck(rawLabel = "") {
  const normalized = String(rawLabel || "").trim().toLowerCase();
  if (!normalized) return null;

  const aliasMap = new Map([
    ["not in service", "Not in Service"],
    ["duplicate", "Duplicate"],
    ["invalid", "Invalid"],
    ["need new", "Need New"],
    ["no part", "No Part"],
    ["no number", "No Number"],
    ["wrong number", "wrong Number"],
    ["wrong no", "wrong Number"],
    ["spanish customer", "Spanish customer"],
    ["wrong description", "Wrong description"],
  ]);

  return aliasMap.get(normalized) || null;
}

export function labelsIncludeInvalidDisposition(labelStrings = []) {
  if (!Array.isArray(labelStrings)) return false;
  for (const raw of labelStrings) {
    const c = normalizeDispositionLabelForInvalidCheck(raw);
    if (c && INVALID_DISPOSITION_CANONICAL.has(c)) return true;
  }
  return false;
}
