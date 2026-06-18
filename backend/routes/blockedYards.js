import express from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  ensureBlockedYardsSeeded,
  getBlockedYardsForClient,
  invalidateBlockedYardCache,
  seedBlockedYardsFromFile,
} from "../services/blockedYardService.js";

const router = express.Router();

/** GET /api/blocked-yards — list for dropdown filtering in Add Yard modal */
router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureBlockedYardsSeeded();
    const yards = await getBlockedYardsForClient();
    res.json({ yards });
  } catch (err) {
    console.error("GET /api/blocked-yards failed:", err);
    res.status(500).json({ message: "Failed to load blocked yards" });
  }
});

/** POST /api/blocked-yards/seed — admin re-import from seed file */
router.post("/seed", requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== "Admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const result = await seedBlockedYardsFromFile();
    invalidateBlockedYardCache();
    res.json({ message: "Blocked yards seed completed", ...result });
  } catch (err) {
    console.error("POST /api/blocked-yards/seed failed:", err);
    res.status(500).json({ message: "Failed to seed blocked yards" });
  }
});

export default router;
