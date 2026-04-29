import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { setCredentials, selectToken, logout } from "../store/authSlice";
import { persistStoredAuth, readStoredAuth, clearStoredAuth } from "../utils/authStorage";

/**
 * Blocks the CRM until POST /auth/access-redeem succeeds ( JWT session already exists ).
 */
export default function AccessCodeModal() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector(selectToken);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const stored = readStoredAuth();
  const email = stored?.user?.email || "";

  const handleLogout = () => {
    clearStoredAuth();
    dispatch(logout());
    navigate("/login", { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await API.post("/auth/access-redeem", { code });
      const nextUser = res.data?.user;
      if (!nextUser) {
        setError("Unexpected response from server.");
        return;
      }
      const authPayload = {
        user: nextUser,
        token: token || stored?.token || localStorage.getItem("token"),
        loginAt: stored?.loginAt || Date.now(),
      };
      dispatch(setCredentials(authPayload));
      persistStoredAuth(authPayload);
    } catch (err) {
      setError(err.response?.data?.message || "Could not verify code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-code-title"
    >
      <div className="w-full max-w-md rounded-lg bg-gray-900 border border-gray-600 shadow-2xl p-6 text-white">
        <h2 id="access-code-title" className="text-xl font-semibold text-center mb-1">
          Access code required
        </h2>
        <p className="text-sm text-gray-400 text-center mb-4">
          You are signed in as{" "}
          <span className="text-gray-200 font-medium">{email || "this account"}</span>.
          Enter the current rotating authorization code for your account
          (shared by your admin from the Authorization Code page).
          This code is required to finish unlocking the app.
        </p>

        {error && (
          <p className="text-red-400 text-sm text-center mb-3" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="access-code-input" className="block text-xs text-gray-400 mb-1">
              Access code
            </label>
            <input
              id="access-code-input"
              name="code"
              autoComplete="one-time-code"
              autoFocus
              className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-600 text-white font-mono tracking-widest uppercase placeholder:text-gray-600"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter code"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md bg-accentPink hover:bg-pink-600 font-medium disabled:opacity-50 transition"
          >
            {loading ? "Verifying…" : "Verify & continue"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-white transition"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
