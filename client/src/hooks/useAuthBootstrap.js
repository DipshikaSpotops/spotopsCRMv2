// /src/hooks/useAuthBootstrap.js
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setCredentials } from "../store/authSlice";

export default function useAuthBootstrap() {
  const dispatch = useDispatch();

  useEffect(() => {
    try {
      // canonical place we store auth
      const raw = localStorage.getItem("auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.user && parsed?.token) {
          dispatch(setCredentials(parsed));
          return;
        }
      }
      // legacy fallback
      const token = localStorage.getItem("token");
      const role = localStorage.getItem("role");
      const firstName = localStorage.getItem("firstName");
      if (token) {
        dispatch(
          setCredentials({
            user: { role: role || undefined, firstName: firstName || undefined },
            token,
          })
        );
      }
    } catch {}
  }, [dispatch]);
}
