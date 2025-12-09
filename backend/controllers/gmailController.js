import GmailSyncState from "../models/GmailSyncState.js";
import GmailMessage from "../models/GmailMessage.js";
import User from "../models/User.js";
import {
  getRecentMessages,
  handlePubSubNotification,
  startWatch,
  syncHistory,
} from "../services/gmailPubSubService.js";
import { getGmailClient, getAuthUrl, setTokensFromCode, getUserEmail } from "../services/googleAuth.js";

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

export async function oauth2UrlHandler(req, res, next) {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (err) {
    console.error("[gmail] OAuth2 URL error:", err);
    res.status(500).json({ error: "Failed to create auth URL", message: err.message });
  }
}

export async function oauth2CallbackHandler(req, res, next) {
  try {
    const code = req.query.code;
    if (!code) {
      return res.status(400).send("Missing authorization code");
    }
    
    await setTokensFromCode(code);
    const userEmail = getUserEmail();
    
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #4CAF50;">✅ Gmail Connected Successfully!</h1>
          <p>Email: <strong>${userEmail || "N/A"}</strong></p>
          <p>You can close this window now.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("[gmail] OAuth2 callback error:", err);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #f44336;">❌ OAuth Error</h1>
          <p>${err.message}</p>
          <p>Check server logs for details.</p>
        </body>
      </html>
    `);
  }
}

export async function syncStateHandler(req, res, next) {
  try {
    // Try to get email from OAuth2 first
    let oauthEmail = null;
    try {
      oauthEmail = getUserEmail();
      if (oauthEmail) {
        console.log("[syncState] Got email from OAuth2:", oauthEmail);
      }
    } catch (err) {
      console.log("[syncState] OAuth2 not available:", err.message);
    }
    
    const configuredEmail = process.env.GMAIL_IMPERSONATED_USER || oauthEmail || null;
    const doc = await GmailSyncState.findOne({
      userEmail:
        req.query.userEmail || configuredEmail || undefined,
    });
    
    // Try to get email from Gmail API profile if not configured
    let emailFromGmailApi = null;
    if (!configuredEmail && !oauthEmail) {
      try {
        const gmail = getGmailClient();
        const profile = await gmail.users.getProfile({ userId: "me" });
        if (profile?.data?.emailAddress) {
          emailFromGmailApi = profile.data.emailAddress;
          console.log("[syncState] Got email from Gmail API profile:", emailFromGmailApi);
        }
      } catch (apiErr) {
        console.error("[syncState] Failed to get email from Gmail API:", apiErr.message);
      }
    }
    
    // If no doc found, try to get userEmail from any recent message
    let userEmailFromMessages = null;
    if (!configuredEmail && !oauthEmail && !emailFromGmailApi) {
      const recentMessage = await GmailMessage.findOne({ userEmail: { $exists: true, $ne: null, $ne: "" } })
        .select("userEmail")
        .sort({ createdAt: -1 })
        .lean();
      if (recentMessage?.userEmail) {
        userEmailFromMessages = String(recentMessage.userEmail).trim();
        console.log("[syncState] Found userEmail from messages:", userEmailFromMessages);
      }
    }
    
    const finalEmail = configuredEmail || oauthEmail || emailFromGmailApi || userEmailFromMessages || doc?.userEmail || null;
    console.log("[syncState] Returning email:", finalEmail, { 
      configuredEmail: process.env.GMAIL_IMPERSONATED_USER,
      oauthEmail,
      emailFromGmailApi, 
      userEmailFromMessages, 
      docUserEmail: doc?.userEmail 
    });
    
    return res.json({ 
      state: doc,
      configuredEmail: finalEmail,
    });
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

export async function getMessageHandler(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const id = String(req.params.id);
    const message = await GmailMessage.findById(id);
    
    if (!message) {
      return res.status(404).json({ message: "Not found" });
    }

    // If bodyHtml is not stored, fetch it from Gmail
    let bodyHtml = message.bodyHtml;
    if (!bodyHtml && message.raw?.payload) {
      bodyHtml = extractHtmlFromPayload(message.raw.payload);
    } else if (!bodyHtml && message.messageId) {
      try {
        const gmail = getGmailClient();
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id: message.messageId,
          format: "full",
        });
        bodyHtml = extractHtmlFromPayload(data.payload);
        // Save it for future use
        if (bodyHtml) {
          await GmailMessage.findByIdAndUpdate(id, { bodyHtml });
        }
      } catch (err) {
        console.error("[getMessage] Failed to fetch body:", err?.message || err);
      }
    }

    const messageObj = message.toObject();
    return res.json({
      _id: String(messageObj._id),
      ...messageObj,
      bodyHtml: bodyHtml || messageObj.bodyHtml || "",
    });
  } catch (err) {
    return next(err);
  }
}

function extractHtmlFromPayload(payload) {
  if (!payload) return "";
  
  // Recursively find HTML part
  function findHtmlPart(part) {
    if (!part) return null;
    
    if (part.mimeType === "text/html" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    
    if (part.parts) {
      for (const p of part.parts) {
        const found = findHtmlPart(p);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  return findHtmlPart(payload) || "";
}

export async function getDailyStatisticsHandler(req, res, next) {
  try {
    const { startDate, endDate, agentEmail } = req.query;
    
    console.log("[getDailyStatistics] Query params:", { startDate, endDate, agentEmail });
    
    // Default to today if no dates provided
    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0);
    
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    
    console.log("[getDailyStatistics] Date range:", { start: start.toISOString(), end: end.toISOString() });
    
    // Build query
    const query = {
      status: "claimed",
      claimedAt: { $gte: start, $lte: end },
    };
    
    if (agentEmail) {
      console.log("[getDailyStatistics] Looking up user with email:", agentEmail.toLowerCase());
      // Find user by email to get their ID
      const user = await User.findOne({ email: agentEmail.toLowerCase() });
      if (user) {
        console.log("[getDailyStatistics] Found user:", { id: user._id, email: user.email, firstName: user.firstName });
        // claimedBy is stored as String (user.id), not ObjectId
        query.claimedBy = user._id.toString();
      } else {
        console.log("[getDailyStatistics] User not found for email:", agentEmail);
        // If user not found, return empty results
        return res.json({
          dailyStats: [],
          totalLeads: 0,
          agentStats: [],
          debug: { message: `No user found with email: ${agentEmail}` },
        });
      }
    }
    
    console.log("[getDailyStatistics] Final query:", JSON.stringify(query, null, 2));
    
    // Get all claimed messages in date range
    // Note: claimedBy is a String, not ObjectId, so we can't use populate
    const messages = await GmailMessage.find(query)
      .sort({ claimedAt: -1 })
      .lean();
    
    console.log("[getDailyStatistics] Found messages:", messages.length);
    if (messages.length > 0) {
      console.log("[getDailyStatistics] Sample message:", {
        _id: messages[0]._id,
        subject: messages[0].subject,
        claimedBy: messages[0].claimedBy,
        claimedAt: messages[0].claimedAt,
      });
    }
    
    // Get all unique user IDs from messages
    const userIds = [...new Set(messages.map(m => m.claimedBy).filter(Boolean))];
    console.log("[getDailyStatistics] Unique user IDs:", userIds);
    
    // Fetch user details for all claimedBy IDs
    const users = await User.find({ _id: { $in: userIds } }).select("firstName lastName email").lean();
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    console.log("[getDailyStatistics] User map size:", userMap.size);
    
    // Group by date and agent
    const dailyMap = new Map();
    const agentMap = new Map();
    
    messages.forEach((msg) => {
      const claimDate = new Date(msg.claimedAt);
      const dateKey = claimDate.toISOString().split("T")[0]; // YYYY-MM-DD
      
      const user = userMap.get(String(msg.claimedBy));
      const agentId = msg.claimedBy || "unknown";
      const agentName = user?.firstName || user?.email || "Unknown";
      const agentEmail = user?.email || "unknown";
      
      // Daily stats
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { date: dateKey, total: 0, agents: new Map() });
      }
      const dayData = dailyMap.get(dateKey);
      dayData.total++;
      
      if (!dayData.agents.has(agentId)) {
        dayData.agents.set(agentId, {
          agentId,
          agentName,
          agentEmail,
          count: 0,
          leads: [],
        });
      }
      const agentData = dayData.agents.get(agentId);
      agentData.count++;
      agentData.leads.push({
        _id: msg._id,
        subject: msg.subject,
        from: msg.from,
        claimedAt: msg.claimedAt,
      });
      
      // Agent stats
      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, {
          agentId,
          agentName,
          agentEmail,
          totalLeads: 0,
          leads: [],
        });
      }
      const agentStat = agentMap.get(agentId);
      agentStat.totalLeads++;
      agentStat.leads.push({
        _id: msg._id,
        subject: msg.subject,
        from: msg.from,
        claimedAt: msg.claimedAt,
        date: dateKey,
      });
    });
    
    // Convert maps to arrays
    const dailyStats = Array.from(dailyMap.values())
      .map((day) => ({
        date: day.date,
        total: day.total,
        agents: Array.from(day.agents.values()).map((a) => ({
          agentId: a.agentId,
          agentName: a.agentName,
          agentEmail: a.agentEmail,
          count: a.count,
          leads: a.leads,
        })),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    
    const agentStats = Array.from(agentMap.values())
      .map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        agentEmail: a.agentEmail,
        totalLeads: a.totalLeads,
        leads: a.leads.sort((x, y) => new Date(y.claimedAt) - new Date(x.claimedAt)),
      }))
      .sort((a, b) => b.totalLeads - a.totalLeads);
    
    return res.json({
      dailyStats,
      totalLeads: messages.length,
      agentStats,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
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

