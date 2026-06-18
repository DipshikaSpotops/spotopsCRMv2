import { stripNonLocationParentheticals } from "./yardName.js";

/** Strip trailing (City, ST) suffixes for blocked-yard name comparison. */
function stripCityStateParenthetical(name) {
  let base = String(name || "").trim();
  for (;;) {
    const match = base.match(/\s*\(([^)]*)\)\s*$/);
    if (!match) break;
    const inner = match[1].trim();
    if (
      inner.includes(",") &&
      !/google|review|rating|stars?/i.test(inner)
    ) {
      base = base.slice(0, match.index).trim();
      continue;
    }
    break;
  }
  return base;
}

/**
 * Normalize a yard name for blocked-yard comparison.
 * Strips (City, ST) suffixes, lowercases, and removes punctuation/spaces.
 */
export function normalizeYardKey(name) {
  const base = stripCityStateParenthetical(
    stripNonLocationParentheticals(String(name || ""))
  ).trim();
  return base
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeLoc(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeState(value) {
  const s = String(value || "").trim().toUpperCase();
  return s.length === 2 ? s : normalizeLoc(s);
}

export function normalizeZip(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.slice(0, 5);
}

export function normalizeStreet(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** @param {object} loc */
export function hasBlockedLocation(loc = {}) {
  return Boolean(
    String(loc.street || "").trim() ||
      String(loc.city || "").trim() ||
      String(loc.state || "").trim() ||
      String(loc.zipcode || "").trim() ||
      String(loc.phone || "").trim()
  );
}

/** @param {object} loc */
export function buildLocationKey(loc = {}) {
  if (!hasBlockedLocation(loc)) return "";
  return [
    normalizeState(loc.state),
    normalizeLoc(loc.city),
    normalizeZip(loc.zipcode),
    normalizeStreet(loc.street).slice(0, 24),
    normalizePhone(loc.phone),
  ]
    .filter(Boolean)
    .join("|");
}

/** True when two yard names refer to the same yard (fuzzy-safe for punctuation). */
export function yardNamesMatch(a, b) {
  const keyA = normalizeYardKey(a);
  const keyB = normalizeYardKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
}

/**
 * Location-specific blocked entry matches when name + geography align.
 * Phone is never used to veto a match — order forms often use agent/different numbers.
 */
export function blockedLocationsMatch(blocked = {}, input = {}) {
  if (!hasBlockedLocation(blocked)) return true;

  const inputHasLocation = hasBlockedLocation(input);
  if (!inputHasLocation) return false;

  const bState = normalizeState(blocked.state);
  const iState = normalizeState(input.state);
  if (blocked.state && bState) {
    if (!iState || bState !== iState) return false;
  }

  const bCity = normalizeLoc(blocked.city);
  const iCity = normalizeLoc(input.city);
  if (blocked.city && bCity) {
    if (!iCity || bCity !== iCity) return false;
  }

  const bZip = normalizeZip(blocked.zipcode);
  const iZip = normalizeZip(input.zipcode);
  if (blocked.zipcode && bZip && iZip && bZip !== iZip) return false;

  const bStreet = normalizeStreet(blocked.street);
  const iStreet = normalizeStreet(input.street);
  if (blocked.street && bStreet && iStreet) {
    if (!iStreet.includes(bStreet) && !bStreet.includes(iStreet)) return false;
  }

  // City + state match (when present on blocked row) is enough to block.
  if (blocked.city && blocked.state && bCity === iCity && bState === iState) {
    return true;
  }

  // Blocked row has street/zip only — require those to match when provided.
  if (blocked.street && bStreet && iStreet && bStreet === iStreet) return true;
  if (blocked.zipcode && bZip && iZip && bZip === iZip) return true;

  return false;
}

/**
 * @param {object|string} yardInput - yard name string or { yardName, street, city, state, zipcode, phone }
 * @param {Array<object>} blockedList
 */
export function findBlockedYardMatch(yardInput, blockedList) {
  const input =
    typeof yardInput === "string" ? { yardName: yardInput } : yardInput || {};
  const inputKey = normalizeYardKey(input.yardName);
  if (!inputKey || !Array.isArray(blockedList)) return null;

  const candidates = blockedList.filter((entry) => {
    const entryKey =
      entry?.normalizedKey || normalizeYardKey(entry?.yardName || "");
    return entryKey && entryKey === inputKey;
  });
  if (!candidates.length) return null;

  const global = candidates.find((entry) => !hasBlockedLocation(entry));
  if (global) return global;

  return candidates.find((entry) => blockedLocationsMatch(entry, input)) || null;
}

export function isBlockedYardName(yardInput, blockedList) {
  return Boolean(findBlockedYardMatch(yardInput, blockedList));
}

export function formatBlockedYardLabel(entry) {
  if (!entry) return "";
  const parts = [entry.yardName];
  const loc = [entry.city, entry.state, entry.zipcode].filter(Boolean).join(", ");
  if (loc) parts.push(`(${loc})`);
  return parts.join(" ");
}
