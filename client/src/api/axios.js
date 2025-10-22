// /src/api/axios.js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000", // matches your server mounts (/orders/...)
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

api.interceptors.request.use((config) => {
  const token = getTokenFromLS();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
