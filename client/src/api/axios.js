// /src/api/axios.js
import axios from "axios";
import { getActorId } from "../utils/actorId";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL
});

function getTokenFromLS() {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const { token } = JSON.parse(raw) || {};
      if (token) return token;
    }
  } catch {}
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("auth_token") ||
    localStorage.getItem("jwt") ||
    null
  );
}

axios.interceptors.request.use((cfg) => {
  cfg.headers = cfg.headers || {};
  cfg.headers["x-actor-id"] = getActorId();
  return cfg;
});

export default api;
