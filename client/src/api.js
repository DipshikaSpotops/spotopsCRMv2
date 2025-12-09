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
// Attach Bearer token and firstName from localStorage if present
API.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("token");
  if (token) {
    cfg.headers = cfg.headers || {};
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  
  // Always add firstName from localStorage to query params if not already present
  const firstName = localStorage.getItem("firstName");
  if (firstName && !cfg.url.includes("firstName=")) {
    // Parse existing URL or create new one
    const separator = cfg.url.includes("?") ? "&" : "?";
    cfg.url = `${cfg.url}${separator}firstName=${encodeURIComponent(firstName)}`;
  }
  
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