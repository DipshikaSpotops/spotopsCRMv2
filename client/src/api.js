import axios from "axios";

const API_BASE = (() => {
  const envBase = import.meta.env.VITE_API_BASE_URL_URL?.replace(/\/$/, "");
  if (envBase) return envBase;

  if (window.location.hostname === "localhost") {
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

export default API;
