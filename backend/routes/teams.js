import express from "express";
import Team from "../models/Team.js";
import { COMMON_TEAM_NAME } from "../../shared/constants/teams.js";
import { ensureOpsTeams } from "../services/ensureOpsTeams.js";

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

/** Common + Mavericks / Invincibles / High Clouds (never deletes existing teams). */
export async function ensureTeamsBootstrap() {
  await ensureCommonTeam();
  return ensureOpsTeams();
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
 * Deprecated: sales agents are not kept on teams. Always returns {}.
 */
router.get("/sales-agent-map", async (_req, res) => {
  return res.json({});
});

export default router;
