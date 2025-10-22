// this page is to ensure that salesagents only see their data, admins can see all or filter by agents 
middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const requireAuth = async (req, res, next) => {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const payload = jwt.verify(token, process.env.JWT_SECRET); 
    const user = await User.findById(payload.sub).lean();
    if (!user) return res.status(401).json({ message: "Invalid user" });

    req.user = { _id: user._id, role: user.role, email: user.email, firstName: user.firstName, lastName: user.lastName };
    next();
  } catch (e) {
    console.error(e);
    return res.status(401).json({ message: "Auth failed" });
  }
};

export const allow = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Not authenticated" });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
  next();
};