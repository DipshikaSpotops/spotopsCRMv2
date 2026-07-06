import express from "express";
import Team from "../models/Team.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const teamName = String(req.body?.teamName || "").trim();
    if (!teamName) {
      return res.status(400).json({ message: "Team name is required." });
    }

    const team = await Team.create({ teamName });
    return res.status(201).json(team);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Team name already exists." });
    }
    console.error("Error creating team:", err);
    return res.status(500).json({ message: err?.message || "Server error creating team." });
  }
});

router.get("/", async (req, res) => {
  try {
    const teams = await Team.find({}).sort({ teamName: 1 }).lean();
    return res.json(teams);
  } catch (err) {
    console.error("Error fetching teams:", err);
    return res.status(500).json({ message: "Failed to fetch teams." });
  }
});

export default router;
