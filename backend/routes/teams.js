import express from "express";
import Team from "../models/Team.js";
import User from "../models/User.js";
import { COMMON_TEAM_NAME, isCommonTeam } from "../../shared/constants/teams.js";
import { AGENT_BRAND_MAPPING } from "../utils/orderAccessScope.js";

const router = express.Router();

/** Ensure the built-in "Common" team exists (idempotent). */
export async function ensureCommonTeam() {
  const existing = await Team.findOne({
    teamName: { $regex: new RegExp(`^${COMMON_TEAM_NAME}$`, "i") },
  }).lean();
  if (existing) return existing;
  try {
    return await Team.create({ teamName: COMMON_TEAM_NAME });
  } catch (err) {
    if (err?.code === 11000) {
      return Team.findOne({
        teamName: { $regex: new RegExp(`^${COMMON_TEAM_NAME}$`, "i") },
      }).lean();
    }
    throw err;
  }
}

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
    await ensureCommonTeam();
    const teams = await Team.find({}).sort({ teamName: 1 }).lean();
    return res.json(teams);
  } catch (err) {
    console.error("Error fetching teams:", err);
    return res.status(500).json({ message: "Failed to fetch teams." });
  }
});

/**
 * GET /teams/sales-agent-map
 * Map salesAgent firstName (+ brand aliases) → team name.
 * Used by Common-team users to show a Team column on order lists.
 */
router.get("/sales-agent-map", async (req, res) => {
  try {
    const users = await User.find({ role: "Sales", team: { $exists: true, $ne: "" } })
      .select("firstName team")
      .lean();

    const map = {};
    for (const u of users) {
      const firstName = String(u.firstName || "").trim();
      const team = String(u.team || "").trim();
      if (!firstName || !team || isCommonTeam(team)) continue;
      map[firstName] = team;
      const alias = AGENT_BRAND_MAPPING[firstName];
      if (alias) map[alias] = team;
    }
    return res.json(map);
  } catch (err) {
    console.error("Error fetching sales agent team map:", err);
    return res.status(500).json({ message: "Failed to fetch sales agent team map." });
  }
});

export default router;
