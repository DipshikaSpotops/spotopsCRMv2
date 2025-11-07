import axios from "axios";

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
// Attach Bearer token if present
API.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("token");
  if (token) {
    cfg.headers = cfg.headers || {};
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});
export default API;