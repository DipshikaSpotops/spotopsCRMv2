// login/signup/logout routes.
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import LoggedInUser from "../models/LoggedInUser.js";
import { validateSignup } from "../middleware/validateSignup.js";
import { validateLogin } from "../middleware/validateLogin.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

const allowedEmails = [
  "dipsikha.spotopsdigital@gmail.com",
  "contact@50starsautoparts.com"
];
// Signup Route (Admins Only)
router.post("/signup", validateSignup, async (req, res) => {
  try {
    const { firstName, lastName, email, password, team, role } = req.body;
    // Email whitelist check
    console.log("Allowed emails:", allowedEmails,email);
    if (!allowedEmails.includes(email)) {
      return res.status(403).json({ message: "Email not authorized for signup" });
    }

    // Role must be Admin
    if (role !== "Admin") {
      return res.status(403).json({ message: "Only Admins can sign up directly." });
    }

    // User already exists
    const existingUser = await User.findOne({ email });
    console.log("Existing user from DB:", existingUser);
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    // 5. Create user
    const newUser = new User({
      firstName,
      lastName,
      email,
      password,
      team,
      role
    });

    await newUser.save();

    res.status(201).json({ message: "Admin account created successfully" });
  } catch (err) {
    res.status(500).json({ message: "Something went wrong" });
  }
});

// Login Route
router.post("/login", validateLogin, async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }); // not .lean() so pre-save etc if needed
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role }, // keep in sync with requireAuth
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    // Optional: clean old sessions as you do
    await LoggedInUser.deleteMany({ expiry: { $lte: new Date() } });

    const expiryDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await LoggedInUser.findOneAndUpdate(
      { userId: user._id },
      { userId: user._id, loginTime: new Date(), jwtToken: token, expiry: expiryDate },
      { upsert: true, new: true }
    );
    const safeUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      team: user.team,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return res.status(200).json({ token, user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Logout Route
router.post("/logout", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    await LoggedInUser.deleteOne({ userId: decoded.id });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(401).json({ message: "Invalid token" });
  }
});

export default router;
