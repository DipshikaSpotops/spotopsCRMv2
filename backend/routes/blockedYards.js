import express from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  ensureBlockedYardsSeeded,
  getBlockedYardsForClient,
  invalidateBlockedYardCache,
  listBlockedYardsForAdmin,
  seedBlockedYardsFromFile,
  unblockYardById,
} from "../services/blockedYardService.js";

const router = express.Router();

const AUTHORIZED_EMAIL = "50starsauto110@gmail.com";

function requireAdminOrAuthorizedEmail(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Not authenticated" });
  const isAuthorizedEmail = req.user.email?.toLowerCase() === AUTHORIZED_EMAIL;
  if (req.user.role !== "Admin" && !isAuthorizedEmail) {
    return res.status(403).json({ message: "Admin or 50starsauto110@gmail.com only." });
  }
  next();
}

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

/** GET /api/blocked-yards/list — admin paginated list for Yards page */
router.get("/list", requireAuth, requireAdminOrAuthorizedEmail, async (req, res) => {
  try {
    await ensureBlockedYardsSeeded();
    const result = await listBlockedYardsForAdmin({
      page: req.query.page,
      limit: req.query.limit,
      searchTerm: req.query.searchTerm,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
    });
    res.json(result);
  } catch (err) {
    console.error("GET /api/blocked-yards/list failed:", err);
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

/** DELETE /api/blocked-yards/:id — admin remove from blocked list */
router.delete("/:id", requireAuth, requireAdminOrAuthorizedEmail, async (req, res) => {
  try {
    const deleted = await unblockYardById(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Blocked yard not found" });
    }
    res.json({ message: "Yard unblocked successfully" });
  } catch (err) {
    console.error("DELETE /api/blocked-yards/:id failed:", err);
    res.status(500).json({ message: "Failed to unblock yard" });
  }
});

export default router;
