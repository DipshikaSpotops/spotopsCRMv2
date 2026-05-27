/**
 * True when "(...)" content looks like "City, ST" — not Google/rating text.
 */
function isLocationParenthetical(inner) {
  const text = String(inner || "").trim();
  if (!text.includes(",")) return false;
  if (/google|review|rating|stars?/i.test(text)) return false;
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  if (/^\d/.test(parts[0])) return false;
  const statePart = parts[parts.length - 1];
  return Boolean(statePart && statePart.length >= 2);
}

/**
 * Remove trailing "(...)" blocks that are ratings / Google text, not (city, state).
 */
export function stripNonLocationParentheticals(yardName) {
  let name = String(yardName || "").trim();
  if (!name) return "";

  for (;;) {
    const match = name.match(/\s*\(([^)]*)\)\s*$/);
    if (!match) break;
    if (isLocationParenthetical(match[1])) break;
    name = name.slice(0, match.index).trim();
  }
  return name;
}

export function hasCityStateSuffix(yardName, city, state) {
  const cityTrimmed = String(city || "").trim();
  const stateTrimmed = String(state || "").trim();
  if (!cityTrimmed || !stateTrimmed) return false;
  const escapedCity = cityTrimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedState = stateTrimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\(\\s*${escapedCity}\\s*,\\s*${escapedState}\\s*\\)\\s*$`,
    "i"
  );
  return re.test(String(yardName || "").trim());
}

/**
 * Format as "Yard Name (City, State)" — strips Google/rating parentheticals first.
 */
export function normalizeYardName(yardName, city, state) {
  const cityTrimmed = String(city || "").trim();
  const stateTrimmed = String(state || "").trim();
  let base = stripNonLocationParentheticals(yardName);
  if (!base) return "";

  if (!cityTrimmed || !stateTrimmed) return base;

  if (hasCityStateSuffix(base, cityTrimmed, stateTrimmed)) return base;

  const trailing = base.match(/\s*\(([^)]*)\)\s*$/);
  if (trailing && isLocationParenthetical(trailing[1])) return base;

  return `${base} (${cityTrimmed}, ${stateTrimmed})`;
}
