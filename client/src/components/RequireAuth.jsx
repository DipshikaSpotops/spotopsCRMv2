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

    const expire = () => {
      clearStoredAuth();
      dispatch(logout());
      navigate("/login", { replace: true });
      alert("Session expired. Please log in again.");
    };

    const stored = readStoredAuth();
    if (!stored || !stored.token) return;

    const loginAt = Number(stored.loginAt || localStorage.getItem("loginAt"));
    if (!loginAt) {
      expire();
      return;
    }

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
  const loginAt = Number(stored?.loginAt || localStorage.getItem("loginAt"));

  useSessionTimeout(effectiveToken);

  if (!effectiveToken || !loginAt) {
    clearStoredAuth();
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (Date.now() - loginAt > SESSION_DURATION_MS) {
    clearStoredAuth();
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

