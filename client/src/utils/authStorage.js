const AUTH_KEYS = ["auth", "token", "firstName", "role", "loginAt"];

export const SESSION_DURATION_MS = 10 * 60 * 60 * 1000; // 10 hours

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
    localStorage.setItem("auth", JSON.stringify(payload));
    if (payload.token) {
      localStorage.setItem("token", payload.token);
    }
    if (payload.user?.firstName) {
      localStorage.setItem("firstName", payload.user.firstName);
    }
    if (payload.user?.role) {
      localStorage.setItem("role", payload.user.role);
    }
    if (payload.loginAt) {
      localStorage.setItem("loginAt", String(payload.loginAt));
    }
  } catch {
    // ignore storage failures
  }
}

export function clearStoredAuth() {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function ensureLoginTimestamp(auth) {
  if (!auth) return null;
  if (auth.loginAt) return auth;
  const updated = { ...auth, loginAt: Date.now() };
  persistStoredAuth(updated);
  return updated;
}

