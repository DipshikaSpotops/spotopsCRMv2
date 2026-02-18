import axios from "axios";
import { clearStoredAuth } from "./utils/authStorage";

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
  timeout: 15000,
});
// Attach Bearer token + brand header from localStorage if present
API.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("token");
  if (token) {
    cfg.headers = cfg.headers || {};
    cfg.headers.Authorization = `Bearer ${token}`;
  }

  // Brand: 50STARS (default) or PROLANE
  try {
    const stored = localStorage.getItem("currentBrand") || "50STARS";
    const brand = String(stored || "50STARS").toUpperCase();
    cfg.headers = cfg.headers || {};
    cfg.headers["x-brand"] = brand === "PROLANE" ? "PROLANE" : "50STARS";
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
    return Promise.reject(error);
  }
);
export default API;