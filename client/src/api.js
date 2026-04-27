import axios from "axios";
import { clearStoredAuth } from "./utils/authStorage";
import { getCurrentBrand } from "./utils/brand";
import { store } from "./store";
import { setCredentials } from "./store/authSlice";

function withSingleApi(base) {
  if (!base) return "";
  const b = String(base).replace(/\/+$/, "");     // strip trailing slashes
  return /\/api$/i.test(b) ? b : `${b}/api`;      // append /api if absent
}

const API_BASE = (() => {
  const envBase = import.meta.env.VITE_API_BASE_URL?.trim();
  if (envBase) return withSingleApi(envBase);     // << key change

  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "http://localhost:5000/api";
  }
  return "/api";
})();

console.log("[API_BASE]", API_BASE);

const API = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  // Gmail list, statistics, order details often exceed 30s under load or large mailboxes.
  timeout: 180000,
});
// Attach Bearer token + brand header (per-tab session, via getCurrentBrand)
API.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("token");
  if (token) {
    cfg.headers = cfg.headers || {};
    cfg.headers.Authorization = `Bearer ${token}`;
  }

  // Brand: 50STARS (default) or PROLANE — do not overwrite if caller set x-brand (e.g. Add Order submit)
  try {
    cfg.headers = cfg.headers || {};
    const existing =
      cfg.headers["x-brand"] ?? cfg.headers["X-Brand"] ?? cfg.headers["X-BRAND"];
    if (existing != null && String(existing).trim() !== "") {
      const n = String(existing).trim().toUpperCase();
      cfg.headers["x-brand"] = n === "PROLANE" ? "PROLANE" : "50STARS";
    } else {
      const brand = String(getCurrentBrand() || "50STARS").toUpperCase();
      cfg.headers["x-brand"] = brand === "PROLANE" ? "PROLANE" : "50STARS";
    }
  } catch {
    // fallback: keep header off, server will default to 50STARS
  }

  // Note: firstName is no longer added to query params
  // The backend gets user info from the JWT token via requireAuth middleware

  return cfg;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearStoredAuth();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    if (error?.response?.status === 403 && error?.response?.data?.code === "ACCESS_CODE_REQUIRED") {
      try {
        const raw = localStorage.getItem("auth");
        if (raw) {
          const o = JSON.parse(raw);
          if (o?.user) {
            o.user = { ...o.user, appAccessUnlocked: false };
            localStorage.setItem("auth", JSON.stringify(o));
            store.dispatch(
              setCredentials({
                user: o.user,
                token: o.token,
                loginAt: o.loginAt,
              })
            );
          }
        }
      } catch {
        /* ignore */
      }
    }
    return Promise.reject(error);
  }
);
export default API;