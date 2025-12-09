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
  getDailyStatisticsHandler,
  oauth2UrlHandler,
  oauth2CallbackHandler,
} from "../controllers/gmailController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// OAuth2 routes (public, no auth required for initial setup)
router.get("/oauth2/url", oauth2UrlHandler);
router.get("/oauth2/callback", oauth2CallbackHandler);

router.post("/watch", startWatchHandler);
router.post("/sync", manualSyncHandler);
router.get("/messages", listMessagesHandler);
router.get("/state", syncStateHandler);
router.post("/pubsub", pubsubWebhook);

// Protected routes (require auth)
router.get("/messages/:id", requireAuth, getMessageHandler);
router.post("/messages/:id/claim-and-view", requireAuth, claimAndViewHandler);
router.patch("/messages/:id/labels", requireAuth, updateLabelsHandler);
router.get("/statistics/daily", requireAuth, getDailyStatisticsHandler);

export default router;

