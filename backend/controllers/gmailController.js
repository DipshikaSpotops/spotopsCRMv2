import GmailSyncState from "../models/GmailSyncState.js";
import GmailMessage from "../models/GmailMessage.js";
import Lead from "../models/Lead.js";
import User from "../models/User.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import moment from "moment-timezone";
import {
  getRecentMessages,
  handlePubSubNotification,
  startWatch,
  syncHistory,
} from "../services/gmailPubSubService.js";
import { detectAgent, buildMessageDoc, persistMessage } from "../services/gmailPubSubService.js";

// Get SALES_AGENT_EMAILS from environment
const SALES_AGENT_EMAILS = (process.env.SALES_AGENT_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// Extract structured fields from email body HTML (name, email, phone, year, make, model, part required)
function extractStructuredFields(html) {
  if (!html) return {};
  
  const fields = {};
  
  // Remove HTML tags for text extraction, decode HTML entities
  let textContent = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // Decode common HTML entities
  textContent = textContent.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  
  // Clean up common patterns that might interfere
  textContent = textContent.replace(/@media[^}]*}/g, ""); // Remove CSS media queries
  
  // Patterns to extract fields - stop at next field label or ending phrase
  const patterns = {
    // Name: stop at Email, Phone, Year, etc.
    name: /(?:Name|Full Name|Customer Name)[\s:]+([^:]*?)(?=\s*(?:Email|Phone|Phone Number|Year|Make|Model|Part|Good Luck|©|50 Stars)|$)/i,
    // Email: extract email address, stop at Phone, Year, etc.
    email: /(?:Email|Email Address)[\s:]+([^\s:<>]+@[^\s:<>]+(?:\.[^\s:<>]+)*)(?=\s*(?:Phone|Phone Number|Year|Make|Model|Part|Good Luck|©|50 Stars)|$)/i,
    // Phone: stop at Year, Make, Model, etc.
    phone: /(?:Phone|Telephone|Phone Number)[\s:]+([+\d\s\-()]+?)(?=\s*(?:Year|Make|Model|Part|Email|Good Luck|©|50 Stars)|$)/i,
    // Year: 4 digits, stop at Make, Model, etc.
    year: /(?:Year)[\s:]+(\d{4})(?=\s*(?:Make|Model|Part|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    // Make & Model: stop at Part Required, Part, etc.
    makeAndModel: /(?:Make\s*[&]?\s*Model|Make and Model)[\s:]+([^:]*?)(?=\s*(?:Part Required|Part|Year|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    // Make: stop at Model, Part, etc.
    make: /(?:^|\s)(?:Make)[\s:]+([^:&]*?)(?=\s*(?:Model|Part|Year|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    // Model: stop at Part, Year, etc.
    model: /(?:^|\s)(?:Model)[\s:]+([^:]*?)(?=\s*(?:Part|Year|Make|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    // Part Required: Find the LAST occurrence (to avoid matching email header), stop at Offer, Good Luck, etc.
    // Use a more specific pattern that looks for the actual part field in the body
    partRequired: /(?:Part Required|Part Needed)[\s:]+([^:]*?)(?=\s*(?:Offer|Offer Selected|Good Luck|©|50 Stars|@media|\n\n|\r\n\r\n)|$)/i,
  };
  
  // Try to extract each field using patterns
  for (const [key, pattern] of Object.entries(patterns)) {
    // For partRequired, find ALL matches and use the LAST one (to avoid email header)
    if (key === "partRequired") {
      const allMatches = [...textContent.matchAll(new RegExp(pattern.source, pattern.flags + "g"))];
      if (allMatches.length > 0) {
        // Use the last match (most likely the actual field in the email body)
        const match = allMatches[allMatches.length - 1];
        if (match && match[1]) {
          let value = match[1].trim();
          // Stop at common ending phrases
          const endPhrases = ["Offer", "Offer Selected", "Good Luck", "©", "50 Stars", "Auto Parts", "@media"];
          for (const phrase of endPhrases) {
            const idx = value.toLowerCase().indexOf(phrase.toLowerCase());
            if (idx > 0) {
              value = value.substring(0, idx).trim();
            }
          }
          // Remove trailing punctuation and extra spaces
          value = value.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
          // Additional cleanup: remove anything that looks like it's part of the email header
          // (e.g., "s 50 Stars Auto Parts - New Lead")
          if (value.toLowerCase().includes("50 stars auto parts") || value.toLowerCase().includes("new lead")) {
            // Try to extract just the part name after the last "Part Required:" in the value itself
            const lastPartRequired = value.toLowerCase().lastIndexOf("part required:");
            if (lastPartRequired > 0) {
              value = value.substring(lastPartRequired + "part required:".length).trim();
            }
            // If it still contains email header text, try to find the actual part
            const actualPartMatch = value.match(/([^:]+?)(?:\s*(?:Email|Phone|Year|Make|Model|Offer|Good Luck|©|50 Stars))/i);
            if (actualPartMatch) {
              value = actualPartMatch[1].trim();
            }
          }
          if (value) {
            fields[key] = value;
          }
        }
      }
    } else {
      // For other fields, use first match as before
      const match = textContent.match(pattern);
      if (match && match[1]) {
        // Clean up the extracted value - remove extra spaces and stop at common ending phrases
        let value = match[1].trim();
        // Stop at common ending phrases
        const endPhrases = ["Offer", "Offer Selected", "Good Luck", "©", "50 Stars", "Auto Parts", "@media"];
        for (const phrase of endPhrases) {
          const idx = value.toLowerCase().indexOf(phrase.toLowerCase());
          if (idx > 0) {
            value = value.substring(0, idx).trim();
          }
        }
        // Remove trailing punctuation and extra spaces
        value = value.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
        if (value) {
          fields[key] = value;
        }
      }
    }
  }
  
  // Handle "Make & Model" - split into make and model if not already extracted separately
  if (fields.makeAndModel && !fields.make && !fields.model) {
    // Try to split "AMC AMX" into make="AMC" and model="AMX"
    const parts = fields.makeAndModel.trim().split(/\s+/);
    if (parts.length >= 2) {
      fields.make = parts[0]; // First word is make
      fields.model = parts.slice(1).join(" "); // Rest is model
    } else {
      // If only one word, use it as make
      fields.make = fields.makeAndModel;
    }
    delete fields.makeAndModel; // Remove the combined field
  }
  
  // Helper function to clean extracted values
  function cleanFieldValue(value) {
    if (!value) return "";
    let cleaned = value.trim();
    // Stop at next field label or ending phrase
    const stopPatterns = [
      /\s*(?:Email|Phone|Phone Number|Year|Make|Model|Part Required|Part|Offer|Offer Selected|Good Luck|©|50 Stars|@media)/i,
      /\s+Email\s*:/i,
      /\s+Phone\s*:/i,
      /\s+Year\s*:/i,
      /\s+Make/i,
      /\s+Model\s*:/i,
      /\s+Part\s+Required\s*:/i,
      /\s+Offer\s*(?:Selected)?\s*:/i,
      /\s+Good\s+Luck/i,
      /\s*©/i,
      /\s*50\s+Stars/i,
      /\s*@media/i,
    ];
    
    for (const pattern of stopPatterns) {
      const match = cleaned.match(pattern);
      if (match && match.index > 0) {
        cleaned = cleaned.substring(0, match.index).trim();
      }
    }
    
    // Remove trailing punctuation, extra spaces, and HTML entities
    cleaned = cleaned.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
    return cleaned;
  }
  
  // Also try to extract from HTML structure (if fields are in labels/strong tags)
  // Look for patterns like <strong>Name:</strong> Dipsikha Pradhan
  const labelValuePattern = /<(?:strong|b|label|td|th)[^>]*>([^<]+)<\/\w+>[\s:]*([^<\n]+)/gi;
  let match;
  while ((match = labelValuePattern.exec(html)) !== null) {
    const label = match[1].toLowerCase().trim();
    let value = cleanFieldValue(match[2]);
    
    if (label.includes("name") && !fields.name && value) fields.name = value;
    if ((label.includes("email") || label.includes("email address")) && !fields.email && value) {
      // Extract just the email address
      const emailMatch = value.match(/([^\s<>]+@[^\s<>]+(?:\.[^\s<>]+)*)/);
      if (emailMatch) fields.email = emailMatch[1];
    }
    if (label.includes("phone") && !fields.phone && value) fields.phone = value;
    if (label.includes("year") && !fields.year && value) fields.year = value;
    if ((label.includes("make") && label.includes("model")) || label.includes("make & model")) {
      if (!fields.makeAndModel && value) fields.makeAndModel = value;
    } else if (label.includes("make") && !label.includes("model") && !fields.make && value) {
      fields.make = value;
    } else if (label.includes("model") && !label.includes("make") && !fields.model && value) {
      fields.model = value;
    }
    if (label.includes("part") && label.includes("required") && !fields.partRequired && value) {
      fields.partRequired = value;
    }
  }
  
  // Also try table structure (td pairs)
  const tableRowPattern = /<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/gi;
  while ((match = tableRowPattern.exec(html)) !== null) {
    const label = match[1].toLowerCase().trim();
    let value = cleanFieldValue(match[2]);
    
    if (label.includes("name") && !fields.name && value) fields.name = value;
    if ((label.includes("email") || label.includes("email address")) && !fields.email && value) {
      // Extract just the email address
      const emailMatch = value.match(/([^\s<>]+@[^\s<>]+(?:\.[^\s<>]+)*)/);
      if (emailMatch) fields.email = emailMatch[1];
    }
    if (label.includes("phone") && !fields.phone && value) fields.phone = value;
    if (label.includes("year") && !fields.year && value) fields.year = value;
    if ((label.includes("make") && label.includes("model")) || label.includes("make & model")) {
      if (!fields.makeAndModel && value) fields.makeAndModel = value;
    } else if (label.includes("make") && !label.includes("model") && !fields.make && value) {
      fields.make = value;
    } else if (label.includes("model") && !label.includes("make") && !fields.model && value) {
      fields.model = value;
    }
    if (label.includes("part") && label.includes("required") && !fields.partRequired && value) {
      fields.partRequired = value;
    }
  }
  
  // Final processing: split makeAndModel if needed
  if (fields.makeAndModel && !fields.make && !fields.model) {
    const parts = fields.makeAndModel.trim().split(/\s+/);
    if (parts.length >= 2) {
      fields.make = parts[0];
      fields.model = parts.slice(1).join(" ");
    } else {
      fields.make = fields.makeAndModel;
    }
    delete fields.makeAndModel;
  }
  
  return fields;
}
import { getGmailClient, getAuthUrl, setTokensFromCode, getUserEmail, clearTokenCache } from "../services/googleAuth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_PATH = path.join(__dirname, "..", "token.json");

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
      getUserEmail() ||
      process.env.GMAIL_IMPERSONATED_USER;
    
    // If no userEmail, try to get from OAuth token
    let finalUserEmail = userEmail;
    if (!finalUserEmail) {
      try {
        finalUserEmail = getUserEmail();
      } catch (err) {
        console.log("[manualSync] Could not get email from OAuth:", err.message);
      }
    }

    if (!finalUserEmail) {
      return res
        .status(400)
        .json({ message: "userEmail required. Set GMAIL_IMPERSONATED_USER or complete OAuth2 setup." });
    }

    const startHistoryId =
      req.body?.startHistoryId ||
      req.query.startHistoryId ||
      (await GmailSyncState.findOne({ userEmail: finalUserEmail }))?.historyId;

    // If no historyId, just establish a baseline (don't save all messages)
    if (!startHistoryId) {
      console.log("[manualSync] No historyId found, establishing baseline...");
      try {
        const gmail = await getGmailClient();
        
        // Get the latest historyId from the profile to establish baseline
        const profile = await gmail.users.getProfile({ userId: "me" });
        const latestHistoryId = profile.data.historyId;

        // Save sync state (this establishes the baseline)
        await GmailSyncState.findOneAndUpdate(
          { userEmail: finalUserEmail },
          {
            $set: {
              historyId: latestHistoryId,
              lastSyncedAt: new Date(),
              userEmail: finalUserEmail,
            },
          },
          { upsert: true }
        );

        console.log(`[manualSync] Baseline established with historyId: ${latestHistoryId}`);
        return res.json({
          message: "Sync baseline established. Messages will be fetched directly from Gmail.",
          latestHistoryId,
          method: "baseline_established",
        });
      } catch (fetchErr) {
        console.error("[manualSync] Failed to fetch recent messages:", fetchErr.message);
        console.error("[manualSync] Error details:", fetchErr);
        
        // Check if it's an invalid_grant error (token issue)
        // Use 400 instead of 401 to avoid triggering login redirect
        if (fetchErr.message?.includes("invalid_grant") || fetchErr.code === "invalid_grant") {
          return res.status(400).json({
            message: "Gmail token is invalid. Please re-authorize via /api/gmail/oauth2/url",
            error: "Invalid token. Re-authorization required.",
            errorCode: "GMAIL_TOKEN_INVALID", // Special code to identify this error
            help: "Visit http://localhost:5000/api/gmail/oauth2/url to re-authorize",
          });
        }
        
        return res.status(500).json({
          message: "Failed to fetch recent messages. Make sure Gmail API is accessible.",
          error: fetchErr.message,
          details: fetchErr.response?.data || fetchErr.message,
        });
      }
    }

    // If we have historyId, use normal sync
    const result = await syncHistory({ userEmail: finalUserEmail, startHistoryId });
    return res.json({ ...result, method: "history_sync" });
  } catch (err) {
    console.error("[manualSync] Error:", err);
    return next(err);
  }
}

export async function listMessagesHandler(req, res, next) {
  try {
    const { agentEmail, limit } = req.query;
    const parsedLimit = limit ? Math.min(Number(limit) || 50, 200) : 50;
    
    // Get logged-in user's firstName to match with salesAgent
    const user = req.user;
    const userFirstName = user?.firstName || "";
    const userEmail = user?.email || agentEmail || "";
    const normalizedEmail = userEmail?.toLowerCase();
    const userRole = user?.role || "Unknown";
    
    console.log(`[listMessages] Fetching messages: agentEmail=${agentEmail}, limit=${parsedLimit}, userFirstName=${userFirstName}, userEmail=${userEmail}, userRole=${userRole}`);
    
    // Fetch messages directly from Gmail API (unread/unclaimed)
    let gmail;
    let gmailUserEmail;
    try {
      gmail = await getGmailClient();
      gmailUserEmail = getUserEmail() || process.env.GMAIL_IMPERSONATED_USER;
    } catch (fetchErr) {
      console.error("[listMessages] Failed to create Gmail client:", fetchErr);
      console.error("[listMessages] Error details:", {
        message: fetchErr.message,
        code: fetchErr.code,
        stack: fetchErr.stack
      });
      
      // Check for RAPT error first (most specific)
      const isRaptError = 
        fetchErr.message?.includes("RAPT required") ||
        fetchErr.message?.includes("invalid_rapt") ||
        fetchErr.message?.includes("rapt_required") ||
        fetchErr.message?.includes("reauth related error");
      
      // Check for any token-related errors that require re-authorization
      const isTokenError = 
        isRaptError ||
        fetchErr.message?.includes("invalid_grant") ||
        fetchErr.message?.includes("re-authorize") ||
        fetchErr.message?.includes("re-authorization") ||
        fetchErr.message?.includes("Missing token.json") ||
        fetchErr.message?.includes("No refresh token") ||
        fetchErr.message?.includes("Refresh token is invalid") ||
        fetchErr.message?.includes("Token refresh failed") ||
        fetchErr.code === "invalid_grant";
      
      if (isTokenError) {
        const helpUrl = process.env.NODE_ENV === "production" 
          ? "https://www.spotops360.com/api/gmail/oauth2/url"
          : "http://localhost:5000/api/gmail/oauth2/url";
        
        // Provide more specific message for RAPT errors
        const message = isRaptError
          ? "Google security policy (RAPT) requires re-authorization. Please delete token.json and re-authorize via /api/gmail/oauth2/url"
          : "Gmail token is invalid. Please re-authorize via /api/gmail/oauth2/url";
        
        return res.status(400).json({
          message,
          error: isRaptError ? "RAPT required - Re-authorization required" : "Invalid token. Re-authorization required.",
          errorCode: isRaptError ? "GMAIL_RAPT_REQUIRED" : "GMAIL_TOKEN_INVALID",
          help: helpUrl,
          requiresTokenDeletion: isRaptError, // Hint to frontend that token.json should be deleted
        });
      }

      // For other errors (like missing credentials.json), return 500
      return res.status(500).json({
        message: "Failed to connect to Gmail. Make sure Gmail API credentials are configured.",
        error: fetchErr.message,
      });
    }
    
    // Build Gmail query - SAME for both Admin and Sales
    // Fetch unread messages from Gmail (same query for all users in All Leads section)
    // Then fetch claimed/closed and unclaimed read messages from database
    // This prevents timeout issues from fetching ALL messages from Gmail
    const gmailQuery = "is:unread in:inbox";
    console.log(`[listMessages] Gmail query: ${gmailQuery}`);
    
    let gmailMessagesData;
    try {
      const response = await gmail.users.messages.list({
        userId: "me",
        q: gmailQuery,
        maxResults: parsedLimit,
      });
      gmailMessagesData = response.data;
    } catch (gmailErr) {
      console.error("[listMessages] Gmail API error:", gmailErr);
      // Check if it's a token/auth error
      if (
        gmailErr.message?.includes("invalid_grant") ||
        gmailErr.code === "invalid_grant" ||
        gmailErr.response?.status === 401 ||
        gmailErr.response?.status === 403
      ) {
        return res.status(400).json({
          message: "Gmail token is invalid. Please re-authorize via /api/gmail/oauth2/url",
          error: "Invalid token. Re-authorization required.",
          errorCode: "GMAIL_TOKEN_INVALID",
          help: process.env.NODE_ENV === "production" 
            ? "https://www.spotops360.com/api/gmail/oauth2/url"
            : "http://localhost:5000/api/gmail/oauth2/url",
        });
      }
      // Other Gmail API errors
      return res.status(400).json({
        message: "Failed to fetch messages from Gmail",
        error: gmailErr.message || "Gmail API error",
        details: gmailErr.response?.data || gmailErr.message,
      });
    }
    
    // Validate that we got valid data from Gmail API
    if (!gmailMessagesData) {
      console.error("[listMessages] Gmail API returned no data");
      return res.status(500).json({
        message: "Gmail API returned invalid response",
        error: "No data received from Gmail API",
      });
    }
    
    const data = gmailMessagesData;
    
    // Fetch leads from database - EXACT SAME logic for both Admin and Sales
    // NO role-based conditionals - both see exactly the same data
    const userLeads = [];
    
    // Fetch ALL claimed and closed leads from BOTH Lead and GmailMessage collections
    // NO limit on claimed/closed leads - fetch ALL of them (same as Admin sees)
    // Unclaimed leads are limited by parsedLimit to avoid performance issues
    const [claimedClosedLeads, claimedClosedGmailMessages] = await Promise.all([
      Lead.find({ status: { $in: ["closed", "claimed"] } })
        .sort({ claimedAt: -1 })
        .lean(), // NO limit - fetch ALL claimed/closed leads
      GmailMessage.find({ status: { $in: ["closed", "claimed"] } })
        .sort({ claimedAt: -1 })
        .lean() // NO limit - fetch ALL claimed/closed messages
    ]);
    
    console.log(`[listMessages] Found ${claimedClosedLeads.length} claimed/closed leads from Lead collection`);
    console.log(`[listMessages] Found ${claimedClosedGmailMessages.length} claimed/closed messages from GmailMessage collection`);
    
    // Fetch unclaimed active messages from GmailMessage (limit to avoid timeout)
    // Only unclaimed messages are limited - claimed/closed are fetched in full above
    const unclaimedGmailMessages = await GmailMessage.find({ 
      status: "active",
      $or: [
        { claimedBy: { $exists: false } },
        { claimedBy: null }
      ]
    })
      .sort({ internalDate: -1 })
      .limit(parsedLimit) // Limit only unclaimed to avoid timeout
      .lean();
    
    console.log(`[listMessages] Found ${unclaimedGmailMessages.length} unclaimed active messages from database`);
    
    // Build lookup maps for efficient data access
    const allMessageIds = [...new Set([
      ...claimedClosedLeads.map(l => l.messageId),
      ...claimedClosedGmailMessages.map(m => m.messageId),
      ...unclaimedGmailMessages.map(m => m.messageId)
    ])];
    
    // Fetch all Lead records in one query
    const leadRecordsMap = new Map();
    if (allMessageIds.length > 0) {
      const leadRecords = await Lead.find({ messageId: { $in: allMessageIds } }).lean();
      leadRecords.forEach(lr => {
        if (lr.messageId) {
          leadRecordsMap.set(lr.messageId, lr);
        }
      });
    }
    
    // Build a map of messageIds to GmailMessage records for faster lookup
    const gmailMsgMap = new Map();
    if (allMessageIds.length > 0) {
      const gmailMsgs = await GmailMessage.find({ messageId: { $in: allMessageIds } }).lean();
      gmailMsgs.forEach(gm => {
        if (gm.messageId) {
          gmailMsgMap.set(gm.messageId, gm);
        }
      });
    }
    
    // Convert claimed/closed leads from Lead collection to message format
    for (const lead of claimedClosedLeads) {
      const gmailMsg = gmailMsgMap.get(lead.messageId);
      
      userLeads.push({
        _id: gmailMsg?._id || lead.gmailMessageId || lead.messageId,
        messageId: lead.messageId,
        subject: lead.subject || gmailMsg?.subject || "",
        from: lead.from || gmailMsg?.from || "",
        snippet: lead.snippet || gmailMsg?.snippet || "",
        status: lead.status,
        claimedBy: lead.claimedBy,
        claimedAt: lead.claimedAt,
        enteredAt: lead.enteredAt || lead.claimedAt || new Date(),
        labels: lead.labels || gmailMsg?.labels || [],
        internalDate: lead.enteredAt || lead.claimedAt || new Date(),
        isFromDatabase: true,
      });
    }
    
    // Convert claimed/closed messages from GmailMessage collection to message format
    // This ensures we get all claimed leads even if they're only in GmailMessage collection
    for (const gmailMsg of claimedClosedGmailMessages) {
      // Skip if already added from Lead collection
      if (!userLeads.find(l => l.messageId === gmailMsg.messageId)) {
        const leadRecord = leadRecordsMap.get(gmailMsg.messageId);
        
        userLeads.push({
          _id: gmailMsg._id,
          messageId: gmailMsg.messageId,
          subject: gmailMsg.subject || leadRecord?.subject || "",
          from: gmailMsg.from || leadRecord?.from || "",
          snippet: gmailMsg.snippet || leadRecord?.snippet || "",
          status: gmailMsg.status, // Keep the status from GmailMessage (claimed/closed)
          claimedBy: gmailMsg.claimedBy,
          claimedAt: gmailMsg.claimedAt,
          enteredAt: leadRecord?.enteredAt || gmailMsg.internalDate || new Date(),
          labels: gmailMsg.labels || leadRecord?.labels || [],
          internalDate: gmailMsg.internalDate || new Date(),
          isFromDatabase: true,
        });
      }
    }
    
    // Convert unclaimed messages to message format
    for (const gmailMsg of unclaimedGmailMessages) {
      // Skip if already added as claimed/closed
      if (!userLeads.find(l => l.messageId === gmailMsg.messageId)) {
        const leadRecord = leadRecordsMap.get(gmailMsg.messageId);
        
        userLeads.push({
          _id: gmailMsg._id,
          messageId: gmailMsg.messageId,
          subject: gmailMsg.subject || "",
          from: gmailMsg.from || "",
          snippet: gmailMsg.snippet || "",
          status: "active",
          claimedBy: null,
          claimedAt: null,
          enteredAt: leadRecord?.enteredAt || gmailMsg.internalDate || new Date(),
          labels: gmailMsg.labels || [],
          internalDate: gmailMsg.internalDate || new Date(),
          labelIds: gmailMsg.labelIds || [],
          isFromDatabase: true,
        });
      }
    }
    
    console.log(`[listMessages] Total leads from database: ${userLeads.length} (claimed/closed: ${claimedClosedLeads.length}, unclaimed active: ${unclaimedGmailMessages.length})`);
    
    const allMessages = [];
    
    // Process Gmail messages (unread/unclaimed)
    if (data.messages && data.messages.length > 0) {
      console.log(`[listMessages] Found ${data.messages.length} messages in Gmail, fetching details...`);
      
      for (const msg of data.messages) {
        try {
          const fullMessage = await gmail.users.messages.get({
            userId: "me",
            id: msg.id,
            format: "full",
          });
          
          // Check if this message is claimed in database
          const dbRecord = await GmailMessage.findOne({ messageId: msg.id }).lean();
          
          // Check if message is actually unread (has UNREAD label)
          const labelIds = fullMessage.data.labelIds || [];
          const isUnread = labelIds.includes("UNREAD");
          
          // SAME logic for ALL users - show unread messages OR messages already in database
          // Unclaimed read messages are fetched separately from database to avoid timeout
          if (!isUnread) {
            if (!dbRecord) {
              // Message is read in Gmail and not in our database - skip it
              // (Unclaimed read messages are fetched separately from database)
              continue;
            }
            // Message is read but exists in database - include it (it's claimed/closed)
          }
          // Message is unread - always include it
          
          // Extract message data
          const headers = fullMessage.data.payload?.headers || [];
          const subject = headers.find(h => h.name === "Subject")?.value || "";
          const from = headers.find(h => h.name === "From")?.value || "";
          const to = headers.find(h => h.name === "To")?.value || "";
          const date = headers.find(h => h.name === "Date")?.value || "";
          const detectedAgent = detectAgent(headers);
          
          // Fetch enteredAt from Lead collection if message is claimed
          let enteredAt = null;
          if (dbRecord && dbRecord.status !== "active") {
            try {
              const leadRecord = await Lead.findOne({ messageId: msg.id }).lean();
              if (leadRecord?.enteredAt) {
                enteredAt = leadRecord.enteredAt;
              }
            } catch (err) {
              // Ignore errors, enteredAt will remain null
            }
          }
          
          // Build message object
          const messageObj = {
            messageId: msg.id,
            threadId: fullMessage.data.threadId,
            subject,
            from,
            to,
            date,
            snippet: fullMessage.data.snippet || "",
            agentEmail: detectedAgent,
            userEmail: gmailUserEmail,
            labelIds: labelIds,
            internalDate: fullMessage.data.internalDate ? new Date(Number(fullMessage.data.internalDate)) : new Date(),
            // Merge with database record if claimed, otherwise use messageId as temporary _id
            ...(dbRecord ? {
              _id: dbRecord._id,
              status: dbRecord.status,
              claimedBy: dbRecord.claimedBy,
              claimedAt: dbRecord.claimedAt,
              enteredAt: enteredAt || (fullMessage.data.internalDate ? new Date(Number(fullMessage.data.internalDate)) : null), // Use enteredAt from Lead, or fallback to internalDate
              labels: dbRecord.labels || [],
            } : {
              _id: msg.id, // Use messageId as temporary _id for unclaimed messages
              status: "active",
              labels: [],
              enteredAt: fullMessage.data.internalDate ? new Date(Number(fullMessage.data.internalDate)) : null, // For unclaimed messages, use internalDate as enteredAt
            }),
          };
          
          allMessages.push(messageObj);
        } catch (msgErr) {
          console.error(`[listMessages] Failed to fetch message ${msg.id}:`, msgErr.message);
        }
      }
    }
    
    // Combine Gmail messages and database leads
    // IMPORTANT: Prioritize database records over Gmail messages
    // Database has the correct status (claimed/closed), while Gmail messages might show as "active" even if claimed
    const messageMap = new Map();
    
    // Add database leads FIRST (they have the correct claimed/closed status)
    userLeads.forEach(lead => {
      messageMap.set(lead.messageId, lead);
    });
    
    // Add Gmail messages, but don't overwrite if database record already exists
    // This ensures claimed/closed leads from database are not overwritten by Gmail's "active" status
    allMessages.forEach(msg => {
      if (!messageMap.has(msg.messageId)) {
        // Only add Gmail message if it's not already in database (as claimed/closed)
        messageMap.set(msg.messageId, msg);
      }
    });
    
    // Final combined messages - NO filtering, same for ALL users
    // Both Admin and Sales see EXACTLY the same leads in "All Leads" section
    const combinedMessages = Array.from(messageMap.values());
    
    console.log(`[listMessages] Returning ${combinedMessages.length} total messages (${allMessages.filter(m => m.status === 'claimed').length} claimed from Gmail, ${userLeads.filter(l => l.status === 'claimed').length} claimed from DB, ${userLeads.filter(l => l.status === 'closed').length} closed)`);
    return res.json({ messages: combinedMessages });
  } catch (err) {
    console.error("[listMessages] Error:", err);
    return next(err);
  }
}

export async function oauth2UrlHandler(req, res, next) {
  try {
    // Detect the correct redirect URI based on request origin
    // Check for proxy headers first (X-Forwarded-Proto is set by reverse proxies like nginx)
    const forwardedProto = req.headers['x-forwarded-proto'] || req.headers['x-forwarded-protocol'];
    let protocol = 'https'; // Default to HTTPS for production
    
    if (forwardedProto) {
      protocol = forwardedProto.split(',')[0].trim(); // Handle multiple values
    } else if (req.secure) {
      protocol = 'https';
    } else if (req.protocol) {
      protocol = req.protocol;
    }
    
    const host = req.get('host') || req.headers.host || 'localhost:5000';
    
    // For localhost, always use HTTP (not HTTPS)
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      protocol = 'http';
    } else if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
      // Force HTTPS for production domains
      protocol = 'https';
    }
    
    const origin = `${protocol}://${host}`;
    
    // Use the exact origin from the request to build redirect URI (preserves www vs non-www)
    let redirectUri;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      redirectUri = 'http://localhost:5000/api/gmail/oauth2/callback';
    } else {
      // Use the exact origin from the request (preserves www, subdomain, etc.)
      redirectUri = `${origin}/api/gmail/oauth2/callback`;
    }
    
    console.log(`[oauth2UrlHandler] Detected origin: ${origin}, using redirect URI: ${redirectUri}`);
    console.log(`[oauth2UrlHandler] Request headers:`, {
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      host: req.headers.host,
      protocol: req.protocol,
      secure: req.secure
    });
    
    // Always force consent when user manually visits OAuth URL to ensure we get a fresh refresh token
    // This prevents refresh token expiration issues
    const forceConsent = req.query.force !== 'false'; // Default to true, unless explicitly false
    const url = getAuthUrl(redirectUri, forceConsent);
    
    // Store popup and redirect params in session/cookie for callback to use
    // (We can't modify the redirect URI as it must match Google's registered URI exactly)
    const popup = req.query.popup;
    const redirect = req.query.redirect;
    if (popup || redirect) {
      // Store in response cookie so callback can read it
      if (popup) res.cookie('oauth_popup', 'true', { maxAge: 600000, httpOnly: true, sameSite: 'lax' }); // 10 min
      if (redirect) res.cookie('oauth_redirect', redirect, { maxAge: 600000, httpOnly: true, sameSite: 'lax' }); // 10 min
    }
    
    // If popup=true, redirect directly to Google OAuth (no intermediate page)
    if (popup === 'true' && req.headers.accept?.includes("text/html")) {
      return res.redirect(url);
    }
    
    // If request wants HTML (browser), show a nice page with the link
    if (req.headers.accept?.includes("text/html")) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail OAuth2 Authorization</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 { color: #1a73e8; }
            .button {
              display: inline-block;
              background: #1a73e8;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 4px;
              margin: 20px 0;
              font-weight: bold;
            }
            .button:hover { background: #1557b0; }
            .info {
              background: #e8f0fe;
              padding: 15px;
              border-radius: 4px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔐 Gmail OAuth2 Authorization</h1>
            <p>Click the button below to authorize Gmail access:</p>
            <a href="${url}" class="button">Authorize Gmail Access</a>
            <div class="info">
              <strong>What this does:</strong>
              <ul>
                <li>Grants access to your Gmail account</li>
                <li>Allows the CRM to fetch leads from Gmail</li>
                <li>Creates/updates the token.json file</li>
              </ul>
            </div>
            <p><small>After authorization, you'll be redirected back and can close this window.</small></p>
          </div>
        </body>
        </html>
      `);
    }
    
    // Otherwise return JSON (for API calls)
    res.json({ url });
  } catch (err) {
    console.error("[gmail] OAuth2 URL error:", err);
    res.status(500).json({ error: "Failed to create auth URL", message: err.message });
  }
}

export async function oauth2CallbackHandler(req, res, next) {
  try {
    const code = req.query.code;
    const error = req.query.error;
    
    // Check for OAuth errors
    if (error) {
      console.error("[gmail] OAuth callback error:", error, req.query);
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #f44336;">❌ OAuth Error</h1>
            <p>Error: <strong>${error}</strong></p>
            <p>${req.query.error_description || "Please try again."}</p>
            <p><a href="/api/gmail/oauth2/url">Try again</a></p>
          </body>
        </html>
      `);
    }
    
    if (!code) {
      console.error("[gmail] OAuth callback missing code. Query params:", req.query);
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #f44336;">❌ Missing Authorization Code</h1>
            <p>The OAuth flow did not complete properly.</p>
            <p>Please <a href="/api/gmail/oauth2/url">try again</a>.</p>
          </body>
        </html>
      `);
    }
    
    // Clear old cached tokens before setting new ones
    clearTokenCache();
    
    // Detect the correct redirect URI based on request origin (must match what was used in auth URL)
    // Check for proxy headers first (X-Forwarded-Proto is set by reverse proxies like nginx)
    const forwardedProto = req.headers['x-forwarded-proto'] || req.headers['x-forwarded-protocol'];
    let protocol = 'https'; // Default to HTTPS for production
    
    if (forwardedProto) {
      protocol = forwardedProto.split(',')[0].trim(); // Handle multiple values
    } else if (req.secure) {
      protocol = 'https';
    } else if (req.protocol) {
      protocol = req.protocol;
    }
    
    const host = req.get('host') || req.headers.host || 'localhost:5000';
    
    // For localhost, always use HTTP (not HTTPS)
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      protocol = 'http';
    } else if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
      // Force HTTPS for production domains
      protocol = 'https';
    }
    
    const origin = `${protocol}://${host}`;
    
    // Use the exact origin from the request to build redirect URI (preserves www vs non-www)
    let redirectUri;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      redirectUri = 'http://localhost:5000/api/gmail/oauth2/callback';
    } else {
      // Use the exact origin from the request (preserves www, subdomain, etc.)
      redirectUri = `${origin}/api/gmail/oauth2/callback`;
    }
    
    console.log(`[oauth2CallbackHandler] Using redirect URI: ${redirectUri}`);
    console.log(`[oauth2CallbackHandler] Request details:`, {
      query: req.query,
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      host: req.headers.host,
      protocol: req.protocol,
      secure: req.secure
    });
    
    await setTokensFromCode(code, redirectUri);
    const userEmail = getUserEmail();
    
    // Check if this was opened in a popup (has opener) or if there's a redirect param from cookie
    const redirectUrl = req.cookies?.oauth_redirect || req.query.redirect || '/leads';
    const isPopup = req.cookies?.oauth_popup === 'true' || req.query.popup === 'true';
    
    // Clear cookies after reading
    if (req.cookies?.oauth_popup) res.clearCookie('oauth_popup');
    if (req.cookies?.oauth_redirect) res.clearCookie('oauth_redirect');
    
    if (isPopup) {
      // If opened in popup, close it and refresh the parent window
      res.send(`
        <html>
          <head>
            <title>Gmail Connected Successfully</title>
          </head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #4CAF50;">✅ Gmail Connected Successfully!</h1>
            <p>Email: <strong>${userEmail || "N/A"}</strong></p>
            <p style="color: #4CAF50; margin-top: 20px;">✅ Token saved and active. You can now use Gmail features.</p>
            <p>Closing window and refreshing...</p>
            <script>
              if (window.opener) {
                // Refresh the parent window (Leads page)
                window.opener.location.reload();
                window.close();
              } else {
                // Fallback: redirect to Leads page
                setTimeout(() => {
                  window.location.href = '${redirectUrl}';
                }, 2000);
              }
            </script>
          </body>
        </html>
      `);
    } else {
      // Regular redirect
      res.send(`
        <html>
          <head>
            <title>Gmail Connected Successfully</title>
          </head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #4CAF50;">✅ Gmail Connected Successfully!</h1>
            <p>Email: <strong>${userEmail || "N/A"}</strong></p>
            <p style="color: #4CAF50; margin-top: 20px;">✅ Token saved and active. You can now use Gmail features.</p>
            <p>Redirecting to Leads page...</p>
            <script>
              setTimeout(() => {
                window.location.href = '${redirectUrl}';
              }, 2000);
            </script>
            <p><a href="${redirectUrl}">Click here if you are not redirected</a></p>
          </body>
        </html>
      `);
    }
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

export async function checkTokenHandler(req, res, next) {
  try {
    const tokenInfo = {
      exists: false,
      email: null,
      hasAccessToken: false,
      hasRefreshToken: false,
      expiryDate: null,
      minutesUntilExpiry: null,
      isExpired: false,
      refreshTokenPreview: null,
      lastModified: null,
      error: null,
      warning: null,
    };

    if (fs.existsSync(TOKEN_PATH)) {
      tokenInfo.exists = true;
      try {
        const stats = fs.statSync(TOKEN_PATH);
        tokenInfo.lastModified = stats.mtime.toISOString();
        
        const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
        tokenInfo.hasAccessToken = !!tokens.access_token;
        tokenInfo.hasRefreshToken = !!tokens.refresh_token;
        tokenInfo.refreshTokenPreview = tokens.refresh_token ? `${tokens.refresh_token.substring(0, 20)}...` : null;
        
        if (tokens.expiry_date) {
          tokenInfo.expiryDate = new Date(tokens.expiry_date).toISOString();
          const now = Date.now();
          const minutesUntilExpiry = Math.round((tokens.expiry_date - now) / 60000);
          tokenInfo.minutesUntilExpiry = minutesUntilExpiry;
          tokenInfo.isExpired = tokens.expiry_date <= now;
          
          if (tokenInfo.isExpired) {
            tokenInfo.warning = "Access token is expired. Refresh should happen automatically.";
          } else if (minutesUntilExpiry < 15) {
            tokenInfo.warning = `Access token expires in ${minutesUntilExpiry} minutes. Refresh should happen soon.`;
          }
        }
        
        // Try to extract email from id_token
        if (tokens.id_token) {
          try {
            const base64Url = tokens.id_token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
            const decoded = JSON.parse(jsonPayload);
            tokenInfo.email = decoded.email || null;
          } catch (err) {
            tokenInfo.error = `Failed to decode id_token: ${err.message}`;
          }
        }
        
        // Also try getUserEmail() which might have cached it
        if (!tokenInfo.email) {
          tokenInfo.email = getUserEmail();
        }
        
        // Add warning if no refresh token
        if (!tokenInfo.hasRefreshToken) {
          tokenInfo.warning = "⚠️ NO REFRESH TOKEN - This token will not work once it expires. Please re-authorize.";
        }
      } catch (err) {
        tokenInfo.error = `Failed to read token.json: ${err.message}`;
      }
    } else {
      tokenInfo.error = "token.json file does not exist";
    }

    return res.json(tokenInfo);
  } catch (err) {
    return next(err);
  }
}

export async function deleteTokenHandler(req, res, next) {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
      clearTokenCache(); // Clear cached tokens
      console.log("[gmail] token.json deleted successfully");
      return res.json({ 
        success: true, 
        message: "token.json deleted successfully. You can now re-authorize." 
      });
    } else {
      return res.json({ 
        success: true, 
        message: "token.json does not exist. You can proceed with authorization." 
      });
    }
  } catch (err) {
    console.error("[gmail] Failed to delete token.json:", err);
    return res.status(500).json({ 
      success: false, 
      error: "Failed to delete token.json", 
      message: err.message 
    });
  }
}

export async function syncStateHandler(req, res, next) {
  try {
    // Try to get email from OAuth2 first
    let oauthEmail = null;
    try {
      // If token.json exists, try to get Gmail client to extract email
      if (fs.existsSync(TOKEN_PATH)) {
        try {
          const gmail = await getGmailClient();
          // getGmailClient() will populate cachedUserEmail if token is valid
          oauthEmail = getUserEmail();
        } catch (gmailErr) {
          console.log("[syncState] Could not get Gmail client:", gmailErr.message);
        }
      }
      // Fallback to direct getUserEmail() call
      if (!oauthEmail) {
        oauthEmail = getUserEmail();
      }
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
        // Check if token.json exists before trying to get Gmail client
        if (fs.existsSync(TOKEN_PATH)) {
          const gmail = getGmailClient();
          const profile = await gmail.users.getProfile({ userId: "me" });
          if (profile?.data?.emailAddress) {
            emailFromGmailApi = profile.data.emailAddress;
            console.log("[syncState] Got email from Gmail API profile:", emailFromGmailApi);
          }
        } else {
          console.log("[syncState] token.json not found, skipping Gmail API profile lookup");
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
      userEmail: finalEmail, // Also include as userEmail for compatibility
      email: finalEmail, // Additional alias for easier access
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
    
    // Owner name is automatically added as a label
    // Users can add more labels after claiming via the labels update endpoint
    const finalLabels = ownerName ? [ownerName] : [];
    
    // Check if id is a MongoDB _id or Gmail messageId
    let messageId;
    let message;
    
    // Try to find by _id first (for already claimed messages)
    if (id.length === 24) {
      // Looks like MongoDB ObjectId
      message = await GmailMessage.findById(id);
      if (message) {
        messageId = message.messageId;
      }
    }
    
    // If not found by _id, treat as messageId
    if (!message) {
      messageId = id;
      message = await GmailMessage.findOne({ messageId });
    }
    
    // If already claimed, return error
    if (message && message.claimedBy) {
      return res.status(409).json({
        message: "Already claimed",
        claimedBy: message.claimedBy,
        claimedAt: message.claimedAt,
      });
    }
    
    // Fetch full message from Gmail
    const gmail = await getGmailClient();
    const userEmail = getUserEmail() || process.env.GMAIL_IMPERSONATED_USER;
    
    let fullMessage;
    try {
      fullMessage = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });
    } catch (err) {
      return res.status(404).json({ message: "Message not found in Gmail" });
    }
    
    const agentEmail = detectAgent(fullMessage.data.payload?.headers || []);
    
    // Extract bodyHtml from the message
    const bodyHtml = extractHtmlFromPayload(fullMessage.data.payload);
    
    // Extract structured fields from email body (name, email, phone, year, make, model, part required)
    const parsedFields = extractStructuredFields(bodyHtml);
    
    // Build message document with selected fields
    const doc = buildMessageDoc({
      message: fullMessage.data,
      agentEmail,
      userEmail,
    });
    
    // Get current time in Dallas timezone (America/Chicago)
    const dallasNow = moment.tz("America/Chicago").toDate();
    
    // Save to GmailMessage collection with claim info (only when claimed)
    // Include bodyHtml so it's saved and associated with the sales agent
    const savedMessage = await GmailMessage.findOneAndUpdate(
      { messageId },
      {
        $set: {
          ...doc,
          bodyHtml: bodyHtml, // Save email body HTML
          status: "claimed",
          claimedBy: user.id,
          claimedAt: dallasNow, // Use Dallas timezone
          labels: finalLabels,
        },
      },
      { upsert: true, new: true }
    );
    
    // Get the original email received time (internalDate from Gmail)
    const enteredAt = fullMessage.data.internalDate 
      ? new Date(Number(fullMessage.data.internalDate))
      : new Date();
    
    // Also save to Lead collection - only save the specified fields
    const leadData = {
      messageId: messageId,
      gmailMessageId: savedMessage._id,
      // Only save these specific fields from the email body
      name: parsedFields.name || "",
      phone: parsedFields.phone || "",
      year: parsedFields.year || "",
      make: parsedFields.make || "",
      model: parsedFields.model || "",
      partRequired: parsedFields.partRequired || "",
      // Email details (only subject and from)
      subject: doc.subject || "",
      from: doc.from || "",
      // Sales agent and claim info
      salesAgent: ownerName, // Sales agent's firstName from localStorage
      claimedBy: user.id,
      claimedAt: dallasNow, // Use Dallas timezone
      enteredAt: enteredAt, // When the email originally arrived
      // Labels and status
      labels: finalLabels,
      status: "claimed",
    };
    
    try {
      const savedLead = await Lead.findOneAndUpdate(
        { messageId },
        { $set: leadData },
        { upsert: true, new: true }
      );
      console.log(`[claim] ✅ Saved lead to Lead collection: ${messageId}, claimed by: ${ownerName}, _id: ${savedLead._id}`);
    } catch (leadErr) {
      console.error(`[claim] ❌ Failed to save lead to Lead collection: ${messageId}`, leadErr);
      // Don't fail the entire request, but log the error
    }

    // Sync labels to Gmail
    try {
      // Get all Gmail labels
      const { data: labelsData } = await gmail.users.labels.list({ userId: "me" });
      const gmailLabels = labelsData.labels || [];
      const labelMap = new Map(gmailLabels.map(l => [l.name.toLowerCase(), l.id]));
      
      // Find or create labels in Gmail
      const labelIdsToAdd = [];
      for (const labelName of finalLabels) {
        const labelKey = labelName.toLowerCase();
        if (labelMap.has(labelKey)) {
          labelIdsToAdd.push(labelMap.get(labelKey));
        } else {
          // Create new label in Gmail
          try {
            const { data: newLabel } = await gmail.users.labels.create({
              userId: "me",
              requestBody: {
                name: labelName,
                labelListVisibility: "labelShow",
                messageListVisibility: "show",
              },
            });
            labelIdsToAdd.push(newLabel.id);
            console.log(`[claim] Created Gmail label: ${labelName} (${newLabel.id})`);
          } catch (labelErr) {
            console.error(`[claim] Failed to create Gmail label ${labelName}:`, labelErr.message);
          }
        }
      }
      
      // Get current Gmail labels for this message
      const { data: msgData } = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "metadata",
        metadataHeaders: [],
      });
      const currentGmailLabelIds = msgData.labelIds || [];
      
      // Add new labels to Gmail (avoid duplicates)
      const labelsToAdd = labelIdsToAdd.filter(id => !currentGmailLabelIds.includes(id));
      
      // Mark as read and add labels
      const modifyRequest = {
        removeLabelIds: ["UNREAD"],
      };
      
      if (labelsToAdd.length > 0) {
        modifyRequest.addLabelIds = labelsToAdd;
      }
      
      await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: modifyRequest,
      });
      
      console.log(`[claim] Added ${labelsToAdd.length} labels to Gmail message: ${finalLabels.join(", ")}`);
    } catch (err) {
      console.error("[claim] Gmail modify failed:", err?.message || err);
    }
    
    const messageObj = savedMessage.toObject();
    
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
      bodyHtml: messageObj.bodyHtml || bodyHtml, // Include bodyHtml in response
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
    
    // Try to find by _id first, then by messageId
    let message = await GmailMessage.findById(id);
    if (!message && id.length !== 24) {
      // Try as messageId
      message = await GmailMessage.findOne({ messageId: id });
    }
    
    if (!message) {
      return res.status(404).json({ message: "Message not found. Please claim the lead first." });
    }
    
            // Only allow viewing if message is claimed or closed (closed leads can be viewed in statistics)
            if (message.status !== "claimed" && message.status !== "closed") {
              return res.status(403).json({ 
                message: "You must claim this lead before viewing details.",
                status: message.status 
              });
            }

    // If bodyHtml is not stored, fetch it from Gmail
    let bodyHtml = message.bodyHtml;
    if (!bodyHtml && message.raw?.payload) {
      bodyHtml = extractHtmlFromPayload(message.raw.payload);
    } else if (!bodyHtml && message.messageId) {
      try {
        const gmail = await getGmailClient();
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id: message.messageId,
          format: "full",
        });
        bodyHtml = extractHtmlFromPayload(data.payload);
        // Save it for future use
        if (bodyHtml) {
          await GmailMessage.findByIdAndUpdate(message._id, { bodyHtml });
        }
      } catch (err) {
        console.error("[getMessage] Failed to fetch body:", err?.message || err);
      }
    }

    const messageObj = message.toObject();
    
    // Fetch lead data from Lead collection if available (includes enteredAt and structured fields)
    let leadData = null;
    try {
      // Try finding by messageId first (most common case)
      let lead = await Lead.findOne({ messageId: messageObj.messageId }).lean();
      // If not found, try finding by gmailMessageId
      if (!lead && messageObj._id) {
        lead = await Lead.findOne({ gmailMessageId: messageObj._id }).lean();
      }
      if (lead) {
        leadData = {
          enteredAt: lead.enteredAt || (messageObj.internalDate ? new Date(Number(messageObj.internalDate)) : null),
          name: lead.name || "",
          email: lead.email || "",
          phone: lead.phone || "",
          year: lead.year || "",
          make: lead.make || "",
          model: lead.model || "",
          partRequired: lead.partRequired || "",
        };
      }
    } catch (err) {
      console.error("[getMessage] Failed to fetch lead data:", err?.message || err);
    }
    
    // Fallback to internalDate if enteredAt not available
    const enteredAt = leadData?.enteredAt || (messageObj.internalDate ? new Date(Number(messageObj.internalDate)) : null);
    
    return res.json({
      _id: String(messageObj._id),
      ...messageObj,
      bodyHtml: bodyHtml || messageObj.bodyHtml || "",
      enteredAt: enteredAt,
      // Include structured lead fields from Lead collection
      name: leadData?.name || "",
      email: leadData?.email || "",
      phone: leadData?.phone || "",
      year: leadData?.year || "",
      make: leadData?.make || "",
      model: leadData?.model || "",
      partRequired: leadData?.partRequired || "",
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

// Re-parse existing leads to fix incorrectly extracted fields
export async function reparseLeadsHandler(req, res, next) {
  try {
    const user = req.user;
    if (!user || user.role !== "Admin") {
      return res.status(403).json({ message: "Only Admin users can re-parse leads" });
    }

    const { dryRun = false, limit = 100, all = false } = req.query;
    const isDryRun = dryRun === "true" || dryRun === true;
    const parseLimit = Number(limit) || 100;
    const parseAll = all === "true" || all === true;

    console.log(`[reparseLeads] Starting re-parse (dryRun: ${isDryRun}, limit: ${parseLimit}, all: ${parseAll})`);

    // Get Gmail client to fetch bodyHtml for leads
    const gmail = await getGmailClient();
    
    // Find leads that need re-parsing
    let leads;
    if (parseAll) {
      // Re-parse ALL leads (useful for initial migration)
      leads = await Lead.find({})
        .sort({ claimedAt: -1 })
        .limit(parseLimit)
        .lean();
      console.log(`[reparseLeads] Re-parsing ALL leads (limit: ${parseLimit})`);
    } else {
      // Only re-parse leads with incorrectly formatted fields
      leads = await Lead.find({
        $or: [
          { name: { $regex: /Email|Phone|Year|Make|Model|Part Required/i } },
          { partRequired: { $regex: /Offer|Good Luck|©|50 Stars|@media|Email|Phone|Year|Make|Model/i } },
          { email: { $exists: true, $regex: /Phone|Year|Make|Model|Part/i } },
          // Also include leads that might not have email field yet (for schema update)
          { email: { $exists: false }, name: { $exists: true, $ne: "" } },
        ]
      })
      .limit(parseLimit)
      .lean();
      console.log(`[reparseLeads] Found ${leads.length} leads with incorrectly formatted fields`);
    }

    console.log(`[reparseLeads] Found ${leads.length} leads to re-parse`);

    const results = {
      total: leads.length,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    for (const lead of leads) {
      try {
        // Get bodyHtml from GmailMessage
        const gmailMsg = await GmailMessage.findOne({ messageId: lead.messageId }).lean();
        if (!gmailMsg?.bodyHtml) {
          // Try to fetch from Gmail API
          try {
            const fullMessage = await gmail.users.messages.get({
              userId: "me",
              id: lead.messageId,
              format: "full",
            });
            const bodyHtml = extractHtmlFromPayload(fullMessage.data.payload);
            if (!bodyHtml) {
              results.skipped++;
              results.details.push({
                messageId: lead.messageId,
                status: "skipped",
                reason: "No bodyHtml found",
              });
              continue;
            }
            
            // Re-parse the fields
            const parsedFields = extractStructuredFields(bodyHtml);
            
            // Update the lead
            const updateData = {
              name: parsedFields.name || lead.name || "",
              email: parsedFields.email || lead.email || "",
              phone: parsedFields.phone || lead.phone || "",
              year: parsedFields.year || lead.year || "",
              make: parsedFields.make || lead.make || "",
              model: parsedFields.model || lead.model || "",
              partRequired: parsedFields.partRequired || lead.partRequired || "",
            };

            if (!isDryRun) {
              await Lead.findOneAndUpdate(
                { _id: lead._id },
                { $set: updateData },
                { new: true }
              );
            }

            results.updated++;
            results.details.push({
              messageId: lead.messageId,
              status: isDryRun ? "would_update" : "updated",
              old: {
                name: lead.name,
                partRequired: lead.partRequired,
              },
              new: {
                name: updateData.name,
                partRequired: updateData.partRequired,
              },
            });
          } catch (gmailErr) {
            console.error(`[reparseLeads] Failed to fetch message ${lead.messageId}:`, gmailErr.message);
            results.errors++;
            results.details.push({
              messageId: lead.messageId,
              status: "error",
              reason: gmailErr.message,
            });
          }
        } else {
          // Re-parse using existing bodyHtml
          const parsedFields = extractStructuredFields(gmailMsg.bodyHtml);
          
          const updateData = {
            name: parsedFields.name || lead.name || "",
            email: parsedFields.email || lead.email || "",
            phone: parsedFields.phone || lead.phone || "",
            year: parsedFields.year || lead.year || "",
            make: parsedFields.make || lead.make || "",
            model: parsedFields.model || lead.model || "",
            partRequired: parsedFields.partRequired || lead.partRequired || "",
          };

          if (!isDryRun) {
            await Lead.findOneAndUpdate(
              { _id: lead._id },
              { $set: updateData },
              { new: true }
            );
          }

          results.updated++;
          results.details.push({
            messageId: lead.messageId,
            status: isDryRun ? "would_update" : "updated",
            old: {
              name: lead.name,
              partRequired: lead.partRequired,
            },
            new: {
              name: updateData.name,
              partRequired: updateData.partRequired,
            },
          });
        }
      } catch (err) {
        console.error(`[reparseLeads] Error processing lead ${lead.messageId}:`, err);
        results.errors++;
        results.details.push({
          messageId: lead.messageId,
          status: "error",
          reason: err.message,
        });
      }
    }

    return res.json({
      message: isDryRun 
        ? `Dry run complete. Would update ${results.updated} leads.` 
        : `Re-parse complete. Updated ${results.updated} leads.`,
      dryRun: isDryRun,
      results,
    });
  } catch (err) {
    console.error("[reparseLeads] Error:", err);
    return next(err);
  }
}

export async function getDailyStatisticsHandler(req, res, next) {
  try {
    const { startDate, endDate, agentEmail } = req.query;
    const user = req.user;
    const userRole = user?.role || "Unknown";
    const userEmail = user?.email || "";
    
    console.log("[getDailyStatistics] Query params:", { startDate, endDate, agentEmail, userRole, userEmail });
    
    // Parse dates in Dallas timezone (America/Chicago)
    let start, end;
    if (startDate) {
      // Parse the date string and interpret it in Dallas timezone
      start = moment.tz(startDate, "America/Chicago").startOf("day").toDate();
    } else {
      start = moment.tz("America/Chicago").startOf("day").toDate();
    }
    
    if (endDate) {
      // Parse the date string and interpret it in Dallas timezone
      end = moment.tz(endDate, "America/Chicago").endOf("day").toDate();
    } else {
      end = moment.tz("America/Chicago").endOf("day").toDate();
    }
    
    console.log("[getDailyStatistics] Date range:", { start: start.toISOString(), end: end.toISOString() });
    
    // Build query - Query directly from Lead collection
    // Include both "claimed" and "closed" leads
    // Filter by enteredAt (when lead came in) if available, otherwise use claimedAt
    const query = {
      status: { $in: ["claimed", "closed"] },
      $or: [
        { enteredAt: { $gte: start, $lte: end } },
        { enteredAt: { $exists: false }, claimedAt: { $gte: start, $lte: end } }, // Fallback for old leads without enteredAt
      ],
    };
    
    // For Sales users: ALWAYS filter to their own statistics (even if no agentEmail provided)
    // For Admin: only filter if agentEmail is explicitly provided (from dropdown)
    let emailToFilter = null;
    if (userRole === "Sales") {
      // Sales users see only their own statistics
      emailToFilter = userEmail;
      console.log(`[getDailyStatistics] Sales user detected - filtering to own statistics: ${emailToFilter}`);
    } else if (agentEmail) {
      // Admin can filter by specific agent email (from dropdown)
      emailToFilter = agentEmail;
      console.log(`[getDailyStatistics] Admin filtering by agent email: ${emailToFilter}`);
    }
    
    if (emailToFilter) {
      console.log("[getDailyStatistics] Looking up user with email:", emailToFilter.toLowerCase());
      // Find user by email to get their ID
      const targetUser = await User.findOne({ email: emailToFilter.toLowerCase() });
      if (targetUser) {
        console.log("[getDailyStatistics] Found user:", { id: targetUser._id, email: targetUser.email, firstName: targetUser.firstName });
        // claimedBy is stored as String (user.id), not ObjectId
        query.claimedBy = targetUser._id.toString();
      } else {
        console.log("[getDailyStatistics] User not found for email:", emailToFilter);
        // If user not found, return empty results
        return res.json({
          dailyStats: [],
          totalLeads: 0,
          agentStats: [],
          debug: { message: `No user found with email: ${emailToFilter}` },
        });
      }
    } else {
      console.log("[getDailyStatistics] No email filter - Admin viewing all statistics");
    }
    
    console.log("[getDailyStatistics] Final query:", JSON.stringify(query, null, 2));
    
    // Query directly from Lead collection instead of GmailMessage
    const leads = await Lead.find(query)
      .sort({ claimedAt: -1 })
      .lean();
    
    console.log("[getDailyStatistics] Found leads:", leads.length);
    
    // Get all unique user IDs from leads
    const userIds = [...new Set(leads.map(l => l.claimedBy).filter(Boolean))];
    console.log("[getDailyStatistics] Unique user IDs:", userIds);
    
    // Fetch user details for all claimedBy IDs
    const users = await User.find({ _id: { $in: userIds } }).select("firstName lastName email").lean();
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    console.log("[getDailyStatistics] User map size:", userMap.size);
    
    // Group by date and agent
    const dailyMap = new Map();
    const agentMap = new Map();
    
    leads.forEach((lead) => {
      // Use enteredAt (when lead came in) if available, otherwise fallback to claimedAt
      const leadDate = lead.enteredAt || lead.claimedAt || lead.createdAt;
      const dateKey = moment(leadDate).tz("America/Chicago").format("YYYY-MM-DD"); // Use Dallas timezone
      
      const user = userMap.get(String(lead.claimedBy));
      const agentId = lead.claimedBy || "unknown";
      const agentName = user?.firstName || lead.salesAgent || user?.email || "Unknown";
      const agentEmail = user?.email || "unknown";
      
      // Calculate time to claim (response time) in minutes
      let timeToClaimMinutes = null;
      let timeToClaimFormatted = null;
      if (lead.enteredAt && lead.claimedAt) {
        const entered = moment(lead.enteredAt);
        const claimed = moment(lead.claimedAt);
        const diffSeconds = claimed.diff(entered, 'seconds', true); // Get seconds with decimals
        timeToClaimMinutes = diffSeconds / 60; // Convert to minutes for calculations
        
        // Format the time difference nicely (include seconds when less than 1 minute)
        if (diffSeconds < 60) {
          // Show seconds with up to 1 decimal place
          timeToClaimFormatted = `${diffSeconds.toFixed(1)} sec`;
        } else if (timeToClaimMinutes < 60) {
          // Show minutes and seconds if less than 60 minutes
          const mins = Math.floor(timeToClaimMinutes);
          const secs = Math.round((timeToClaimMinutes - mins) * 60);
          timeToClaimFormatted = secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
        } else if (timeToClaimMinutes < 1440) {
          const hours = Math.floor(timeToClaimMinutes / 60);
          const mins = Math.round(timeToClaimMinutes % 60);
          timeToClaimFormatted = `${hours}h ${mins}m`;
        } else {
          const days = Math.floor(timeToClaimMinutes / 1440);
          const hours = Math.floor((timeToClaimMinutes % 1440) / 60);
          timeToClaimFormatted = `${days}d ${hours}h`;
        }
      }
      
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
          totalTimeToClaim: 0, // Sum of all response times in minutes
          leadsWithResponseTime: 0, // Count of leads with response time data
        });
      }
      const agentData = dayData.agents.get(agentId);
      agentData.count++;
      
      // Track response time for average calculation
      if (timeToClaimMinutes !== null) {
        agentData.totalTimeToClaim += timeToClaimMinutes;
        agentData.leadsWithResponseTime++;
      }
      
      // Use lead data directly from Lead collection
      agentData.leads.push({
        _id: String(lead._id),
        messageId: lead.messageId,
        subject: lead.subject || "",
        from: lead.from || "",
        enteredAt: lead.enteredAt, // When lead came in
        claimedAt: lead.claimedAt, // When lead was claimed
        timeToClaimMinutes: timeToClaimMinutes, // Response time in minutes
        timeToClaimFormatted: timeToClaimFormatted, // Formatted response time (e.g., "5 min", "2h 30m")
        // Include all saved lead details from Lead collection
        name: lead.name || "",
        email: lead.email || "", // Customer email
        phone: lead.phone || "",
        year: lead.year || "",
        make: lead.make || "",
        model: lead.model || "",
        partRequired: lead.partRequired || "",
        salesAgent: lead.salesAgent || "",
        labels: lead.labels || [],
        status: lead.status || "claimed",
      });
      
      // Agent stats
      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, {
          agentId,
          agentName,
          agentEmail,
          totalLeads: 0,
          leads: [],
          totalTimeToClaim: 0, // Sum of all response times in minutes
          leadsWithResponseTime: 0, // Count of leads with response time data
        });
      }
      const agentStat = agentMap.get(agentId);
      agentStat.totalLeads++;
      
      // Track response time for average calculation
      if (timeToClaimMinutes !== null) {
        agentStat.totalTimeToClaim += timeToClaimMinutes;
        agentStat.leadsWithResponseTime++;
      }
      
      // Use lead data directly from Lead collection
      agentStat.leads.push({
        _id: String(lead._id),
        messageId: lead.messageId,
        subject: lead.subject || "",
        from: lead.from || "",
        enteredAt: lead.enteredAt, // When lead came in
        claimedAt: lead.claimedAt, // When lead was claimed
        timeToClaimMinutes: timeToClaimMinutes, // Response time in minutes
        timeToClaimFormatted: timeToClaimFormatted, // Formatted response time (e.g., "5 min", "2h 30m")
        date: dateKey,
        // Include all saved lead details from Lead collection
        name: lead.name || "",
        email: lead.email || "", // Customer email
        phone: lead.phone || "",
        year: lead.year || "",
        make: lead.make || "",
        model: lead.model || "",
        partRequired: lead.partRequired || "",
        salesAgent: lead.salesAgent || "",
        labels: lead.labels || [],
        status: lead.status || "claimed",
      });
    });
    
    // Convert maps to arrays
    const dailyStats = Array.from(dailyMap.values())
      .map((day) => ({
        date: day.date,
        total: day.total,
        agents: Array.from(day.agents.values()).map((a) => {
          // Calculate average response time for this agent on this day
          let avgResponseTimeMinutes = null;
          let avgResponseTimeFormatted = null;
          if (a.leadsWithResponseTime > 0 && a.totalTimeToClaim > 0) {
            avgResponseTimeMinutes = a.totalTimeToClaim / a.leadsWithResponseTime;
            
            // Format average response time nicely (include seconds when less than 1 minute)
            const avgResponseTimeSeconds = avgResponseTimeMinutes * 60;
            if (avgResponseTimeSeconds < 60) {
              avgResponseTimeFormatted = `${avgResponseTimeSeconds.toFixed(1)} sec`;
            } else if (avgResponseTimeMinutes < 60) {
              const mins = Math.floor(avgResponseTimeMinutes);
              const secs = Math.round((avgResponseTimeMinutes - mins) * 60);
              avgResponseTimeFormatted = secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
            } else if (avgResponseTimeMinutes < 1440) {
              const hours = Math.floor(avgResponseTimeMinutes / 60);
              const mins = Math.round(avgResponseTimeMinutes % 60);
              avgResponseTimeFormatted = `${hours}h ${mins}m`;
            } else {
              const days = Math.floor(avgResponseTimeMinutes / 1440);
              const hours = Math.floor((avgResponseTimeMinutes % 1440) / 60);
              avgResponseTimeFormatted = `${days}d ${hours}h`;
            }
          }
          
          return {
            agentId: a.agentId,
            agentName: a.agentName,
            agentEmail: a.agentEmail,
            count: a.count,
            avgResponseTimeMinutes: avgResponseTimeMinutes,
            avgResponseTimeFormatted: avgResponseTimeFormatted,
            leads: a.leads,
          };
        }),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    
    const agentStats = Array.from(agentMap.values())
      .map((a) => {
        // Calculate average response time
        let avgResponseTimeMinutes = null;
        let avgResponseTimeFormatted = null;
        if (a.leadsWithResponseTime > 0 && a.totalTimeToClaim > 0) {
          avgResponseTimeMinutes = a.totalTimeToClaim / a.leadsWithResponseTime;
          
          // Format average response time nicely (include seconds when less than 1 minute)
          const avgResponseTimeSeconds = avgResponseTimeMinutes * 60;
          if (avgResponseTimeSeconds < 60) {
            avgResponseTimeFormatted = `${avgResponseTimeSeconds.toFixed(1)} sec`;
          } else if (avgResponseTimeMinutes < 60) {
            const mins = Math.floor(avgResponseTimeMinutes);
            const secs = Math.round((avgResponseTimeMinutes - mins) * 60);
            avgResponseTimeFormatted = secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
          } else if (avgResponseTimeMinutes < 1440) {
            const hours = Math.floor(avgResponseTimeMinutes / 60);
            const mins = Math.round(avgResponseTimeMinutes % 60);
            avgResponseTimeFormatted = `${hours}h ${mins}m`;
          } else {
            const days = Math.floor(avgResponseTimeMinutes / 1440);
            const hours = Math.floor((avgResponseTimeMinutes % 1440) / 60);
            avgResponseTimeFormatted = `${days}d ${hours}h`;
          }
        }
        
        return {
          agentId: a.agentId,
          agentName: a.agentName,
          agentEmail: a.agentEmail,
          totalLeads: a.totalLeads,
          avgResponseTimeMinutes: avgResponseTimeMinutes,
          avgResponseTimeFormatted: avgResponseTimeFormatted,
          leads: a.leads.sort((x, y) => {
            // Sort by claimedAt, but if same, sort by enteredAt
            const xClaimed = new Date(x.claimedAt || 0);
            const yClaimed = new Date(y.claimedAt || 0);
            if (xClaimed.getTime() !== yClaimed.getTime()) {
              return yClaimed - xClaimed;
            }
            const xEntered = new Date(x.enteredAt || 0);
            const yEntered = new Date(y.enteredAt || 0);
            return yEntered - xEntered;
          }),
        };
      })
      .sort((a, b) => b.totalLeads - a.totalLeads);
    
    return res.json({
      dailyStats,
      totalLeads: leads.length,
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

export async function closeLeadHandler(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const id = String(req.params.id);

    // Find message by _id or messageId
    let message = await GmailMessage.findById(id);
    if (!message && id.length !== 24) {
      // Try as messageId
      message = await GmailMessage.findOne({ messageId: id });
    }
    if (!message) {
      return res.status(404).json({ message: "Lead not found" });
    }

    // Only allow closing if message is claimed
    if (message.status !== "claimed") {
      return res.status(400).json({ 
        message: "Only claimed leads can be closed.",
        currentStatus: message.status 
      });
    }

    // Update GmailMessage status to closed
    message.status = "closed";
    await message.save();

    // Also update the Lead collection
    if (message.messageId) {
      try {
        await Lead.findOneAndUpdate(
          { messageId: message.messageId },
          { $set: { status: "closed" } },
          { upsert: false }
        );
        console.log(`[closeLead] Closed lead in Lead collection: ${message.messageId}`);
      } catch (leadErr) {
        console.error("[closeLead] Failed to update Lead collection:", leadErr.message);
        // Don't fail the request, just log the error
      }
    }

    const messageObj = message.toObject();
    
    // Broadcast SSE event for live updates
    if (req.app?.locals?.sseBroadcast) {
      req.app.locals.sseBroadcast("gmail", { reason: "lead_closed", messageId: messageObj._id });
    }
    
    return res.json({
      _id: String(messageObj._id),
      ...messageObj,
      status: "closed",
    });
  } catch (err) {
    return next(err);
  }
}

export async function reopenLeadHandler(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const id = String(req.params.id);

    // Find message by _id or messageId
    let message = await GmailMessage.findById(id);
    if (!message && id.length !== 24) {
      // Try as messageId
      message = await GmailMessage.findOne({ messageId: id });
    }
    if (!message) {
      return res.status(404).json({ message: "Lead not found" });
    }

    // Only allow reopening if message is closed
    if (message.status !== "closed") {
      return res.status(400).json({ 
        message: "Only closed leads can be reopened.",
        currentStatus: message.status 
      });
    }

    // Update GmailMessage status to claimed
    message.status = "claimed";
    await message.save();

    // Also update the Lead collection
    if (message.messageId) {
      try {
        await Lead.findOneAndUpdate(
          { messageId: message.messageId },
          { $set: { status: "claimed" } },
          { upsert: false }
        );
        console.log(`[reopenLead] Reopened lead in Lead collection: ${message.messageId}`);
      } catch (leadErr) {
        console.error("[reopenLead] Failed to update Lead collection:", leadErr.message);
        // Don't fail the request, just log the error
      }
    }

    const messageObj = message.toObject();
    
    // Broadcast SSE event for live updates
    if (req.app?.locals?.sseBroadcast) {
      req.app.locals.sseBroadcast("gmail", { reason: "lead_reopened", messageId: messageObj._id });
    }

    return res.json({
      _id: String(messageObj._id),
      ...messageObj,
      status: "claimed",
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

    // Find message by _id or messageId
    let message = await GmailMessage.findById(id);
    if (!message && id.length !== 24) {
      // Try as messageId
      message = await GmailMessage.findOne({ messageId: id });
    }
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

    // Also update the Lead collection if this message is claimed or closed
    if ((message.status === "claimed" || message.status === "closed") && message.messageId) {
      try {
        await Lead.findOneAndUpdate(
          { messageId: message.messageId },
          { $set: { labels: [...set] } },
          { upsert: false } // Only update if exists, don't create new
        );
        console.log(`[updateLabels] Updated Lead collection labels for messageId: ${message.messageId}`);
      } catch (leadErr) {
        console.error("[updateLabels] Failed to update Lead collection:", leadErr.message);
        // Don't fail the request, just log the error
      }
    }

    // Sync labels back to Gmail (both add and remove)
    try {
      const gmail = await getGmailClient();
      
      // Get all Gmail labels
      const { data: labelsData } = await gmail.users.labels.list({ userId: "me" });
      const gmailLabels = labelsData.labels || [];
      const labelMap = new Map(gmailLabels.map(l => [l.name.toLowerCase(), l.id]));
      
      // System labels that should never be removed (INBOX, UNREAD, etc.)
      const systemLabels = new Set(["INBOX", "UNREAD", "IMPORTANT", "STARRED", "SENT", "DRAFT", "SPAM", "TRASH"]);
      
      // Find or create labels in Gmail for the labels we want to keep
      const labelIdsToKeep = [];
      for (const labelName of message.labels) {
        const labelKey = labelName.toLowerCase();
        if (labelMap.has(labelKey)) {
          labelIdsToKeep.push(labelMap.get(labelKey));
        } else {
          // Create new label in Gmail
          try {
            const { data: newLabel } = await gmail.users.labels.create({
              userId: "me",
              requestBody: {
                name: labelName,
                labelListVisibility: "labelShow",
                messageListVisibility: "show",
              },
            });
            labelIdsToKeep.push(newLabel.id);
            labelMap.set(labelKey, newLabel.id); // Update map for later use
            console.log(`[updateLabels] Created Gmail label: ${labelName} (${newLabel.id})`);
          } catch (labelErr) {
            console.error(`[updateLabels] Failed to create Gmail label ${labelName}:`, labelErr.message);
          }
        }
      }
      
      // Get current Gmail labels for this message
      const { data: msgData } = await gmail.users.messages.get({
        userId: "me",
        id: message.messageId,
        format: "metadata",
        metadataHeaders: [],
      });
      const currentGmailLabelIds = msgData.labelIds || [];
      
      // Determine which labels to add and which to remove
      const labelsToAdd = labelIdsToKeep.filter(id => !currentGmailLabelIds.includes(id));
      
      // Remove labels that are not in our keep list (but preserve system labels)
      // We need to check all current Gmail labels and see which ones should be removed
      const labelsToRemove = [];
      for (const currentLabelId of currentGmailLabelIds) {
        const currentLabel = gmailLabels.find(l => l.id === currentLabelId);
        if (!currentLabel) continue;
        
        const currentLabelName = currentLabel.name;
        
        // Don't remove system labels
        if (systemLabels.has(currentLabelName)) {
          continue;
        }
        
        // Check if this label is in our keep list (by comparing label IDs)
        if (!labelIdsToKeep.includes(currentLabelId)) {
          // Also check if the label name matches any of our keep labels (case-insensitive)
          const shouldKeep = message.labels.some(labelName => 
            labelName.toLowerCase() === currentLabelName.toLowerCase()
          );
          
          if (!shouldKeep) {
            labelsToRemove.push(currentLabelId);
            console.log(`[updateLabels] Will remove label: ${currentLabelName} (${currentLabelId})`);
          }
        }
      }
      
      // Apply changes to Gmail
      if (labelsToAdd.length > 0 || labelsToRemove.length > 0) {
        const modifyBody = {};
        if (labelsToAdd.length > 0) {
          modifyBody.addLabelIds = labelsToAdd;
        }
        if (labelsToRemove.length > 0) {
          modifyBody.removeLabelIds = labelsToRemove;
        }
        
        await gmail.users.messages.modify({
          userId: "me",
          id: message.messageId,
          requestBody: modifyBody,
        });
        
        if (labelsToAdd.length > 0) {
          console.log(`[updateLabels] ✅ Added labels to Gmail: ${labelsToAdd.map(id => {
            const label = gmailLabels.find(l => l.id === id);
            return label?.name || id;
          }).join(", ")}`);
        }
        if (labelsToRemove.length > 0) {
          console.log(`[updateLabels] ✅ Removed labels from Gmail: ${labelsToRemove.map(id => {
            const label = gmailLabels.find(l => l.id === id);
            return label?.name || id;
          }).join(", ")}`);
        }
      } else {
        console.log(`[updateLabels] No label changes needed for message ${message.messageId}`);
      }
    } catch (gmailErr) {
      console.error("[updateLabels] Failed to sync labels to Gmail:", gmailErr.message);
      // Don't fail the request, just log the error
    }

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

export async function addCommentHandler(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const id = String(req.params.id);
    const commentText = String(req.body?.comment || "").trim();

    if (!commentText) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    // Find message by _id or messageId
    let message = await GmailMessage.findById(id);
    if (!message && id.length !== 24) {
      // Try as messageId
      message = await GmailMessage.findOne({ messageId: id });
    }
    if (!message) {
      return res.status(404).json({ message: "Lead not found" });
    }

    // Get user's firstName for the comment author
    const userDoc = await User.findById(user.id).select("firstName email");
    const authorName = userDoc?.firstName || userDoc?.email || "Unknown";

    // Add comment to the array
    if (!message.comments) {
      message.comments = [];
    }
    message.comments.push({
      text: commentText,
      author: authorName,
      createdAt: new Date(),
    });

    await message.save();

    const messageObj = message.toObject();

    // Broadcast SSE event for live updates
    if (req.app?.locals?.sseBroadcast) {
      req.app.locals.sseBroadcast("gmail", { reason: "comment_added", messageId: messageObj._id });
    }

    return res.json({
      _id: String(messageObj._id),
      ...messageObj,
    });
  } catch (err) {
    return next(err);
  }
}

