import GmailSyncState from "../models/GmailSyncState.js";
import GmailMessage from "../models/GmailMessage.js";
import User from "../models/User.js";
import {
  getRecentMessages,
  handlePubSubNotification,
  startWatch,
  syncHistory,
} from "../services/gmailPubSubService.js";
import { getGmailClient } from "../services/googleAuth.js";

function decodePubSubMessage(message = {}) {
  if (!message.data) return null;
  const json = Buffer.from(message.data, "base64").toString("utf8");
  try {
    return JSON.parse(json);
  } catch (err) {
    console.error("[gmail] Failed to parse Pub/Sub message", err, json);
    throw err;
  }
}

export async function pubsubWebhook(req, res, next) {
  try {
    const verifyToken = process.env.GMAIL_PUBSUB_VERIFY_TOKEN;

    if (verifyToken && req.query.token !== verifyToken) {
      return res.status(403).json({ message: "Invalid verification token" });
    }

    const payload = decodePubSubMessage(req.body?.message);
    if (!payload) {
      return res.status(400).json({ message: "No Pub/Sub payload found" });
    }

    const result = await handlePubSubNotification(payload);
    
    // Broadcast SSE event if new messages were created
    if (result?.createdCount > 0 && req.app?.locals?.sseBroadcast) {
      req.app.locals.sseBroadcast("gmail", { reason: "pubsub", ...result });
    }
    
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

export async function startWatchHandler(req, res, next) {
  try {
    const { labelIds, topicName } = req.body || {};
    const response = await startWatch({ labelIds, topicName });
    return res.json(response);
  } catch (err) {
    return next(err);
  }
}

export async function manualSyncHandler(req, res, next) {
  try {
    const userEmail =
      req.body?.userEmail ||
      req.query.userEmail ||
      process.env.GMAIL_IMPERSONATED_USER;
    if (!userEmail) {
      return res
        .status(400)
        .json({ message: "userEmail or GMAIL_IMPERSONATED_USER required" });
    }

    const startHistoryId =
      req.body?.startHistoryId ||
      req.query.startHistoryId ||
      (await GmailSyncState.findOne({ userEmail }))?.historyId;

    if (!startHistoryId) {
      return res
        .status(400)
        .json({ message: "No historyId available to start sync" });
    }

    const result = await syncHistory({ userEmail, startHistoryId });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function listMessagesHandler(req, res, next) {
  try {
    const { agentEmail, limit } = req.query;
    const parsedLimit = limit ? Math.min(Number(limit) || 50, 200) : 50;
    const messages = await getRecentMessages({
      agentEmail,
      limit: parsedLimit,
    });
    return res.json({ messages });
  } catch (err) {
    return next(err);
  }
}

export async function syncStateHandler(req, res, next) {
  try {
    const doc = await GmailSyncState.findOne({
      userEmail:
        req.query.userEmail || process.env.GMAIL_IMPERSONATED_USER || undefined,
    });
    return res.json({ state: doc });
  } catch (err) {
    return next(err);
  }
}

export async function claimAndViewHandler(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const id = String(req.params.id);
    const ownerName = String(user?.firstName || "").trim();

    const updateDoc = {
      status: "claimed",
      claimedBy: user.id,
      claimedAt: new Date(),
    };
    
    if (ownerName) {
      updateDoc.$addToSet = { labels: ownerName };
    }

    const message = await GmailMessage.findOneAndUpdate(
      { _id: id, status: "active", claimedBy: null },
      ownerName
        ? { $set: updateDoc, $addToSet: { labels: ownerName } }
        : { $set: updateDoc },
      { new: true }
    );

    if (!message) {
      const existing = await GmailMessage.findById(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      return res.status(409).json({
        message: "Already claimed",
        claimedBy: existing.claimedBy,
        claimedAt: existing.claimedAt,
      });
    }

    // Mark Gmail as read
    try {
      const gmail = getGmailClient();
      await gmail.users.messages.modify({
        userId: "me",
        id: message.messageId,
        requestBody: { removeLabelIds: ["UNREAD"] },
      });
    } catch (err) {
      console.error("[claim] Gmail modify failed:", err?.message || err);
    }

    const messageObj = message.toObject();
    
    // Broadcast SSE event for live updates
    if (req.app?.locals?.sseBroadcast) {
      req.app.locals.sseBroadcast("gmail", { reason: "claimed", messageId: messageObj._id });
    }
    
    return res.json({
      _id: String(messageObj._id),
      messageId: messageObj.messageId,
      threadId: messageObj.threadId,
      subject: messageObj.subject,
      from: messageObj.from,
      to: messageObj.to,
      internalDate: messageObj.internalDate,
      snippet: messageObj.snippet,
      status: messageObj.status,
      claimedBy: messageObj.claimedBy,
      claimedByName: ownerName,
      claimedAt: messageObj.claimedAt,
      labels: messageObj.labels || [],
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateLabelsHandler(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const id = String(req.params.id);
    const incoming = Array.isArray(req.body?.labels)
      ? req.body.labels.map((s) => String(s).trim()).filter(Boolean)
      : [];

    const message = await GmailMessage.findById(id);
    if (!message) return res.status(404).json({ message: "Not found" });

    // Determine owner label from claimer's first name
    let ownerLabel = "";
    if (message.claimedBy) {
      const owner = await User.findById(message.claimedBy).select("firstName");
      ownerLabel = String(owner?.firstName || "").trim();
    } else if (user?.id) {
      const me = await User.findById(user.id).select("firstName");
      ownerLabel = String(me?.firstName || "").trim();
    }

    const set = new Set(incoming);
    if (ownerLabel) set.add(ownerLabel); // enforce non-removable label

    message.labels = [...set];
    await message.save();

    const messageObj = message.toObject();
    
    // Broadcast SSE event for live updates
    if (req.app?.locals?.sseBroadcast) {
      req.app.locals.sseBroadcast("gmail", { reason: "labels_updated", messageId: messageObj._id });
    }
    
    return res.json({
      _id: String(messageObj._id),
      ...messageObj,
    });
  } catch (err) {
    return next(err);
  }
}

