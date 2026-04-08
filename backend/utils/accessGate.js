// Feature flag + effective unlock state for post-login access codes.

export function isAppAccessGateEnabled() {
  return String(process.env.APP_ACCESS_GATE_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}

export function getAppAccessBypassRoles() {
  const raw = process.env.APP_ACCESS_GATE_BYPASS_ROLES ?? "Admin";
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function shouldBypassAppAccessGate(user) {
  if (!user?.role) return false;
  return getAppAccessBypassRoles().includes(user.role);
}

/**
 * @param {object} dbUser - user document (plain object or mongoose doc)
 */
export function computeEffectiveAppAccessUnlocked(dbUser) {
  if (!isAppAccessGateEnabled()) return true;
  if (shouldBypassAppAccessGate(dbUser)) return true;
  if (dbUser.appAccessUnlocked === true) return true;
  if (dbUser.appAccessUnlocked === false) return false;
  // Missing field: treat as grandfathered (already in DB before feature)
  const gf = String(process.env.APP_ACCESS_GATE_GRANDFATHER_MISSING ?? "true")
    .trim()
    .toLowerCase();
  return gf !== "false";
}

export function isAppAccessGateExemptRequest(req) {
  const path = (req.originalUrl || req.url || "").split("?")[0];
  return (
    path.endsWith("/auth/access-redeem") ||
    path.includes("/api/auth/access-redeem") ||
    path.endsWith("/auth/me") ||
    path.includes("/api/auth/me")
  );
}

export function initialAppAccessUnlockedForNewUser() {
  return isAppAccessGateEnabled() ? false : undefined;
}

/** Safe user payload for login / me / redeem (includes effective appAccessUnlocked). */
export function toAuthSafeUser(dbUser) {
  const u = dbUser?.toObject ? dbUser.toObject() : dbUser;
  return {
    _id: u._id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    team: u.team,
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    appAccessUnlocked: computeEffectiveAppAccessUnlocked(u),
  };
}
