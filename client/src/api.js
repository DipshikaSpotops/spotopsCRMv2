import axios from "axios";

// 🧠 Handles both local (Vite dev) and EC2 (nginx) seamlessly
const API_BASE = (() => {
  const envBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  if (envBase) return envBase; // if defined, use it (e.g. "/api" on EC2)

  // Local fallback when vite dev runs on port 5173
  if (window.location.hostname === "localhost") {
    return "http://localhost:5000/api";
  }

  // default for prod server
  return "/api";
})();

console.log("[API_BASE]", API_BASE); // 🧩 just to confirm in console

// Create axios instance
const API = axios.create({
  baseURL: API_BASE,         // always has /api for backend routes
  withCredentials: true,     // keep cookies/session
  timeout: 15000,
});

export default API;
