import express from "express";
import {
  listMessagesHandler,
  manualSyncHandler,
  pubsubWebhook,
  startWatchHandler,
  syncStateHandler,
  getMessageHandler,
  claimAndViewHandler,
  updateLabelsHandler,
  closeLeadHandler,
  reopenLeadHandler,
  getDailyStatisticsHandler,
  oauth2UrlHandler,
  oauth2CallbackHandler,
  addCommentHandler,
  checkTokenHandler,
  reparseLeadsHandler,
} from "../controllers/gmailController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// OAuth2 routes (public, no auth required for initial setup)
router.get("/oauth2/url", oauth2UrlHandler);
router.get("/oauth2/callback", oauth2CallbackHandler);

router.post("/watch", startWatchHandler);
router.post("/sync", manualSyncHandler);
router.get("/messages", requireAuth, listMessagesHandler);
router.get("/state", syncStateHandler);
router.get("/check-token", checkTokenHandler); // Debug endpoint to check token.json
router.post("/pubsub", pubsubWebhook);

// Protected routes (require auth)
router.get("/messages/:id", requireAuth, getMessageHandler);
router.post("/messages/:id/claim-and-view", requireAuth, claimAndViewHandler);
router.patch("/messages/:id/labels", requireAuth, updateLabelsHandler);
router.patch("/messages/:id/close", requireAuth, closeLeadHandler);
router.patch("/messages/:id/reopen", requireAuth, reopenLeadHandler);
router.post("/messages/:id/comments", requireAuth, addCommentHandler);
router.get("/statistics/daily", requireAuth, getDailyStatisticsHandler);
router.post("/reparse-leads", requireAuth, reparseLeadsHandler); // Admin only - re-parse existing leads

export default router;

