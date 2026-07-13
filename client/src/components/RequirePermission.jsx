import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectRole, selectUser } from "../store/authSlice";
import { readStoredAuth } from "../utils/authStorage";
import { canAccessRoute } from "../../../shared/constants/userPermissions.js";

/**
 * Blocks direct-URL access to permission-scoped pages. A user who cannot see a
 * page in the sidebar must not be able to reach it by typing the URL.
 * Admins and unmapped (common) routes always pass through.
 */
export default function RequirePermission({ children }) {
  const location = useLocation();
  const reduxUser = useSelector(selectUser);
  const reduxRole = useSelector(selectRole);

  const stored = readStoredAuth();
  const user = reduxUser || stored?.user || null;
  const role = reduxRole || user?.role;

  if (!canAccessRoute(user, location.pathname, role)) {
    return <Navigate to="/monthly-orders" replace />;
  }

  return children;
}
