// /src/hooks/useAuthBootstrap.js
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setCredentials, logout } from "../store/authSlice";
import {
  readStoredAuth,
  persistStoredAuth,
  clearStoredAuth,
  ensureLoginTimestamp,
  SESSION_DURATION_MS,
} from "../utils/authStorage";

export default function useAuthBootstrap() {
  const dispatch = useDispatch();

  useEffect(() => {
    try {
      const stored = readStoredAuth();
      if (stored?.user && stored?.token) {
        const loginAt = Number(stored.loginAt || localStorage.getItem("loginAt"));
        if (loginAt && Date.now() - loginAt > SESSION_DURATION_MS) {
          clearStoredAuth();
          dispatch(logout());
          return;
        }
        const ensured = ensureLoginTimestamp(stored) || stored;
        dispatch(setCredentials(ensured));
        return;
      }
      // legacy fallback
      const token = localStorage.getItem("token");
      const role = localStorage.getItem("role");
      const firstName = localStorage.getItem("firstName");
      if (token) {
        const payload = {
          user: { role: role || undefined, firstName: firstName || undefined },
          token,
          loginAt: Date.now(),
        };
        persistStoredAuth(payload);
        dispatch(setCredentials(payload));
      }
    } catch {}
  }, [dispatch]);
}
