import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout, selectToken } from "../store/authSlice";
import {
  readStoredAuth,
  clearStoredAuth,
  SESSION_DURATION_MS,
} from "../utils/authStorage";

function useSessionTimeout(token) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;

    const stored = readStoredAuth();
    if (!stored || !stored.token) return;

    let loginAt = Number(stored.loginAt || localStorage.getItem("loginAt"));
    if (!loginAt) {
      loginAt = Date.now();
      try {
        const updated = { ...stored, loginAt };
        localStorage.setItem("auth", JSON.stringify(updated));
        localStorage.setItem("loginAt", String(loginAt));
      } catch {
        // ignore storage failures
      }
    }

    const expire = () => {
      clearStoredAuth();
      dispatch(logout());
      navigate("/login", { replace: true });
      alert("Session expired. Please log in again.");
    };

    const elapsed = Date.now() - loginAt;
    if (elapsed >= SESSION_DURATION_MS) {
      expire();
      return;
    }

    const timer = setTimeout(expire, SESSION_DURATION_MS - elapsed);
    return () => clearTimeout(timer);
  }, [token, dispatch, navigate]);
}

export default function RequireAuth({ children }) {
  const token = useSelector(selectToken);
  const location = useLocation();

  const stored = readStoredAuth();
  const effectiveToken = token || stored?.token || localStorage.getItem("token");

  useSessionTimeout(effectiveToken);

  if (!effectiveToken) {
    clearStoredAuth();
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

