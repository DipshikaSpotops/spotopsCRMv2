// server/routes/users.js
import express from "express";
import User from "../models/User.js"; 
const router = express.Router();

// POST /api/users - create a user
router.post("/", async (req, res) => {
  try {
    const { firstName, lastName, email, password, team, role } = req.body;

    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ message: "First name, last name, email, password, and role are required." });
    }

    // Optional: check if email exists
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "Email already exists." });
    }
    //password will be hashed
    const payload = { firstName, lastName, email, password, role };
    if (team) payload.team = team;
    const user = new User(payload);
    const saved = await user.save();
    // never return password
    const { password: _, ...safe } = saved.toObject();
    return res.status(201).json(safe);
  } catch (err) {
    // Handle duplicate key (race condition) as well
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Email already exists." });
    }
    console.error("Error creating user:", err);
    return res.status(500).json({ message: err?.message || "Server error creating user." });
  }
});

// GET all users
router.get("/", async (_req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    users.forEach(u => delete u.password);
    res.json(users);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to fetch users." });
  }
});
// PATCH /api/users/:id  (partial update; password optional)
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["firstName", "lastName", "email", "team", "role", "password"];
    const payload = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }
    // if password present, let pre('save') hash it -> use findById then save()
    if (payload.password !== undefined) {
      const user = await User.findById(id);
      if (!user) return res.status(404).json({ message: "User not found." });
      Object.assign(user, payload);
      const saved = await user.save();
      const o = saved.toObject(); delete o.password;
      return res.json(o);
    }
    const updated = await User.findByIdAndUpdate(id, payload, {
      new: true, runValidators: true
    }).lean();
    if (!updated) return res.status(404).json({ message: "User not found." });
    delete updated.password;
    res.json(updated);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Email already exists." });
    }
    console.error(err);
    res.status(500).json({ message: "Failed to update user." });
  }
});
// DELETE user
router.delete("/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to delete user." });
  }
});
export default router;
