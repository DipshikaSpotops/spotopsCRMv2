// /middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/**
 * Require a valid JWT and hydrate req.user from DB.
 * Works with tokens created as: { id, email, role } (from your login route).
 */
export const requireAuth = async (req, res, next) => {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const payload = jwt.verify(token, JWT_SECRET);
    // NOTE: your login route signs { id, email, role } — not `sub`.
    if (!payload?.id) return res.status(401).json({ message: "Invalid token payload" });

    const user = await User.findById(payload.id).lean();
    if (!user) return res.status(401).json({ message: "Invalid user" });

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,          // "Admin" | "Sales" | "Support"
      firstName: user.firstName,
      lastName: user.lastName,
      team: user.team,
    };
    next();
  } catch (e) {
    console.error("[requireAuth] error:", e);
    return res.status(401).json({ message: "Auth failed" });
  }
};

/**
 * Allow only specific roles to access a route.
 */
export const allow = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Not authenticated" });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
  next();
};
