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

export function getAppAccessBypassEmails() {
  // Default bypass for explicitly trusted operational account(s).
  const raw =
    process.env.APP_ACCESS_GATE_BYPASS_EMAILS ?? "spotops.digital12@gmail.com";
  return String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function shouldBypassAppAccessGate(user) {
  const role = String(user?.role || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  if (email && getAppAccessBypassEmails().includes(email)) return true;
  if (!role) return false;
  return getAppAccessBypassRoles().includes(role);
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
    path.endsWith("/auth/access-resend") ||
    path.includes("/api/auth/access-resend") ||
    path.endsWith("/auth/me") ||
    path.includes("/api/auth/me")
  );
}

export function initialAppAccessUnlockedForNewUser() {
  return isAppAccessGateEnabled() ? false : undefined;
}

/**
 * Access-invite code expiry. Prefer ACCESS_INVITE_EXPIRES_HOURS, then ACCESS_INVITE_EXPIRES_DAYS;
 * if neither is set, default 10 hours. Use 0 or negative in env for no expiry (null).
 */
export function computeAccessInviteExpiresAt() {
  const hrsRaw = process.env.ACCESS_INVITE_EXPIRES_HOURS;
  const daysRaw = process.env.ACCESS_INVITE_EXPIRES_DAYS;

  if (hrsRaw != null && String(hrsRaw).trim() !== "") {
    const h = Number(hrsRaw);
    if (Number.isFinite(h) && h > 0) return new Date(Date.now() + h * 3600000);
    if (Number.isFinite(h) && h <= 0) return null;
  }

  if (daysRaw != null && String(daysRaw).trim() !== "") {
    const d = Number(daysRaw);
    if (Number.isFinite(d) && d > 0) return new Date(Date.now() + d * 86400000);
    if (Number.isFinite(d) && d <= 0) return null;
  }

  return new Date(Date.now() + 10 * 3600000);
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
