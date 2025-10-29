// client/src/api.js
import axios from "axios";

// Prefer the env var; otherwise default to "/api"
const baseURL =
  (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, ""); // strip trailing slash

const API = axios.create({
  baseURL,               // e.g. "/api" or "http://localhost:5000/api"
  withCredentials: true, // keep cookies for login
  timeout: 15000,
});

export default API;
