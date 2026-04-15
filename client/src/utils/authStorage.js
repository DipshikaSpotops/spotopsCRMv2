const AUTH_KEYS = [
  "auth",
  "token",
  "firstName",
  "role",
  "loginAt",
  // Legacy keys still read by parts of the app; clear them on logout too.
  "user",
  "email",
  "username",
];

export const SESSION_DURATION_MS = 10.5 * 60 * 60 * 1000; // 10.5 hours

export function readStoredAuth() {
  try {
    const raw = localStorage.getItem("auth");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persistStoredAuth(payload = {}) {
  try {
    // Always reset auth-related keys first so stale values from a previous user/session never leak.
    clearStoredAuth();
    const user = payload.user || {};
    localStorage.setItem("auth", JSON.stringify(payload));
    if (payload.token) {
      localStorage.setItem("token", payload.token);
    } else {
      localStorage.removeItem("token");
    }
    if (user.firstName) {
      localStorage.setItem("firstName", user.firstName);
    }
    if (user.role) {
      localStorage.setItem("role", user.role);
    }
    if (user.email) {
      localStorage.setItem("email", user.email);
      // Some legacy pages still read username for display/search filters.
      localStorage.setItem("username", user.email);
    }
    // Keep legacy "user" in sync so old fallbacks don't read stale account data.
    localStorage.setItem("user", JSON.stringify(user));
    if (!user.firstName) {
      localStorage.removeItem("firstName");
    }
    if (!user.role) {
      localStorage.removeItem("role");
    }
    if (!user.email) {
      localStorage.removeItem("email");
      localStorage.removeItem("username");
    }
    if (payload.loginAt) {
      localStorage.setItem("loginAt", String(payload.loginAt));
    } else {
      localStorage.removeItem("loginAt");
    }
  } catch {
    // ignore storage failures
  }
}

export function clearStoredAuth() {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function ensureLoginTimestamp(auth) {
  if (!auth || !auth.loginAt) return null;
  return auth;
}

