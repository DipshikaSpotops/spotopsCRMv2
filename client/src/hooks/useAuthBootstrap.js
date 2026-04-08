// /src/hooks/useAuthBootstrap.js
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setCredentials, logout } from "../store/authSlice";
import API from "../api";
import {
  readStoredAuth,
  persistStoredAuth,
  clearStoredAuth,
  SESSION_DURATION_MS,
} from "../utils/authStorage";

export default function useAuthBootstrap() {
  const dispatch = useDispatch();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = readStoredAuth();
        const token = stored?.token || localStorage.getItem("token");
        if (!token) return;

        const loginAt = Number(stored?.loginAt || localStorage.getItem("loginAt"));
        if (!loginAt) {
          clearStoredAuth();
          dispatch(logout());
          return;
        }

        if (Date.now() - loginAt > SESSION_DURATION_MS) {
          clearStoredAuth();
          dispatch(logout());
          return;
        }

        let user = stored?.user;
        try {
          const { data } = await API.get("/auth/me");
          if (!cancelled && data?.user) {
            user = data.user;
          }
        } catch {
          /* 401 clears storage via interceptor; otherwise keep cached user */
        }

        if (cancelled) return;

        const payload = {
          user: user || stored?.user || {},
          token,
          loginAt,
        };
        dispatch(setCredentials(payload));
        persistStoredAuth(payload);
      } catch {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("role");
        const firstName = localStorage.getItem("firstName");
        if (token) {
          try {
            const { data } = await API.get("/auth/me");
            if (!cancelled && data?.user) {
              const payload = {
                user: data.user,
                token,
                loginAt: Date.now(),
              };
              dispatch(setCredentials(payload));
              persistStoredAuth(payload);
              return;
            }
          } catch {
            /* ignore */
          }
          const payload = {
            user: { role: role || undefined, firstName: firstName || undefined },
            token,
            loginAt: Date.now(),
          };
          persistStoredAuth(payload);
          dispatch(setCredentials(payload));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch]);
}
