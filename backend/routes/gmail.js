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
} from "../controllers/gmailController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/watch", startWatchHandler);
router.post("/sync", manualSyncHandler);
router.get("/messages", listMessagesHandler);
router.get("/state", syncStateHandler);
router.post("/pubsub", pubsubWebhook);

// Protected routes (require auth)
router.get("/messages/:id", requireAuth, getMessageHandler);
router.post("/messages/:id/claim-and-view", requireAuth, claimAndViewHandler);
router.patch("/messages/:id/labels", requireAuth, updateLabelsHandler);

export default router;

