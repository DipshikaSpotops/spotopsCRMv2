import GmailMessage from "../models/GmailMessage.js";
import GmailSyncState from "../models/GmailSyncState.js";
import { getGmailClient, getUserEmail } from "./googleAuth.js";

const DEFAULT_LABELS = (process.env.GMAIL_WATCH_LABELS || "INBOX,UNREAD")
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);

const SALES_AGENT_EMAILS = (process.env.SALES_AGENT_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const MAX_HISTORY_PAGES = Number(process.env.GMAIL_HISTORY_PAGE_LIMIT || 5);

function normalizeEmails(value = "") {
  const matches = value.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+)/g);
  return matches ? matches.map((m) => m.toLowerCase()) : [];
}

function headerValue(headers = [], name) {
  return (
    headers.find(
      (header) => header.name?.toLowerCase() === name.toLowerCase()
    )?.value || ""
  );
}

export function detectAgent(headers) {
  if (!SALES_AGENT_EMAILS.length) return null;

  const deliveredTo = normalizeEmails(headerValue(headers, "Delivered-To"));
  const toHeader = normalizeEmails(headerValue(headers, "To"));
  const ccHeader = normalizeEmails(headerValue(headers, "Cc"));

  const all = [...deliveredTo, ...toHeader, ...ccHeader];
  return (
    all.find((email) => SALES_AGENT_EMAILS.includes(email.toLowerCase())) || null
  );
}

export function buildMessageDoc({ message, agentEmail, userEmail }) {
  const headers = message.payload?.headers ?? [];
  const doc = {
    messageId: message.id,
    threadId: message.threadId,
    historyId: message.historyId,
    internalDate: message.internalDate
      ? new Date(Number(message.internalDate))
      : undefined,
    snippet: message.snippet,
    subject: headerValue(headers, "Subject"),
    from: headerValue(headers, "From"),
    to: normalizeEmails(headerValue(headers, "To")),
    deliveredTo: normalizeEmails(headerValue(headers, "Delivered-To")),
    labelIds: message.labelIds || [],
    headers,
    payloadSizeEstimate: message.payload?.body?.size,
    raw: {
      sizeEstimate: message.sizeEstimate,
      payload: message.payload,
    },
    agentEmail,
    userEmail,
  };
  return doc;
}

async function fetchMessage(gmail, messageId) {
  const { data } = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["From", "To", "Delivered-To", "Subject", "Date", "Cc"],
  });
  return data;
}

export async function persistMessage(doc) {
  // Reduced logging for performance - only log errors
  const result = await GmailMessage.findOneAndUpdate(
    { messageId: doc.messageId },
    {
      $setOnInsert: {
        ...doc,
        status: "active",
        // Don't set processedAt here to avoid conflict with $set
      },
      $set: {
        // Always update processedAt (works for both insert and update)
        processedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
  return result;
}

async function processHistoryEntry({ entry, gmail, userEmail }) {
  if (!entry?.messagesAdded) return [];
  const createdMessages = [];
  
  // Batch check which messages already exist
  const messageIds = entry.messagesAdded
    .map(added => added?.message?.id)
    .filter(Boolean);
  
  if (messageIds.length === 0) return [];
  
  // Check all messageIds at once
  const existingMessages = await GmailMessage.find({ 
    messageId: { $in: messageIds } 
  }).select("messageId").lean();
  const existingIds = new Set(existingMessages.map(m => m.messageId));
  
  // Filter out existing messages
  const newMessageIds = messageIds.filter(id => !existingIds.has(id));
  
  if (newMessageIds.length === 0) return [];
  
  // Process new messages in parallel (limit to 3 concurrent for faster sync)
  const BATCH_SIZE = 3;
  for (let i = 0; i < newMessageIds.length; i += BATCH_SIZE) {
    const batch = newMessageIds.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (messageId) => {
      try {
        const fullMessage = await fetchMessage(gmail, messageId);
        const agentEmail = detectAgent(fullMessage.payload?.headers || []);
        const doc = buildMessageDoc({
          message: fullMessage,
          agentEmail,
          userEmail,
        });
        const saved = await persistMessage(doc);
        return saved;
      } catch (err) {
        console.error(`[processHistoryEntry] Error processing message ${messageId}:`, err.message);
        return null;
      }
    });
    
    const results = await Promise.all(batchPromises);
    createdMessages.push(...results.filter(Boolean));
  }

  return createdMessages;
}

export async function syncHistory({ userEmail, startHistoryId }) {
  const gmail = await getGmailClient();
  
  // Use OAuth2 email if userEmail not provided
  const finalUserEmail = userEmail || getUserEmail() || process.env.GMAIL_IMPERSONATED_USER;
  
  let pageToken;
  let pages = 0;
  let latestHistoryId = startHistoryId;
  const created = [];
  
  // Limit pages for Pub/Sub notifications to speed up sync (only process first page)
  // For manual sync, use MAX_HISTORY_PAGES; for Pub/Sub auto-sync, use 1 page for speed
  const maxPages = startHistoryId ? 1 : MAX_HISTORY_PAGES;

  do {
    pages += 1;
    const listParams = {
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
      pageToken,
    };

    if (DEFAULT_LABELS.length === 1) {
      listParams.labelId = DEFAULT_LABELS[0];
    }

    const { data } = await gmail.users.history.list(listParams);

    pageToken = data.nextPageToken;
    latestHistoryId = data.historyId || latestHistoryId;

    const historyEntries = data.history || [];
    
    // Process entries in parallel (limit to 2 concurrent for faster response)
    const ENTRY_BATCH_SIZE = 2;
    for (let i = 0; i < historyEntries.length; i += ENTRY_BATCH_SIZE) {
      const entryBatch = historyEntries.slice(i, i + ENTRY_BATCH_SIZE);
      const entryPromises = entryBatch.map(async (entry) => {
        latestHistoryId = entry.id || latestHistoryId;
        return await processHistoryEntry({ entry, gmail, userEmail: finalUserEmail });
      });
      
      const results = await Promise.all(entryPromises);
      created.push(...results.flat());
    }
  } while (pageToken && pages < maxPages);

  await GmailSyncState.findOneAndUpdate(
    { userEmail: finalUserEmail },
    {
      $set: {
        historyId: latestHistoryId,
        lastSyncedAt: new Date(),
        labelIds: DEFAULT_LABELS,
        lastError: null,
        userEmail: finalUserEmail, // Ensure userEmail is stored
      },
    },
    { upsert: true }
  );

  return { createdCount: created.length, latestHistoryId };
}

export async function handlePubSubNotification(notification) {
  const { emailAddress, historyId } = notification || {};
  if (!emailAddress || !historyId) {
    throw new Error("Invalid Gmail notification payload");
  }

  const startTime = Date.now();
  const state =
    (await GmailSyncState.findOne({ userEmail: emailAddress })) || {};
  const startHistoryId = state.historyId || historyId;

  try {
    console.log(`[PubSub] Processing notification for ${emailAddress}, historyId: ${historyId}, startHistoryId: ${startHistoryId}`);
    const result = await syncHistory({
      userEmail: emailAddress,
      startHistoryId,
    });
    const duration = Date.now() - startTime;
    console.log(`[PubSub] ✅ Synced ${result.createdCount} new messages in ${duration}ms`);
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[PubSub] ❌ Error syncing history (${duration}ms):`, err.message);
    await GmailSyncState.findOneAndUpdate(
      { userEmail: emailAddress },
      {
        $set: {
          lastError: err.message,
          lastSyncedAt: new Date(),
        },
      },
      { upsert: true }
    );
    throw err;
  }
}

export async function startWatch({
  topicName = process.env.GMAIL_PUBSUB_TOPIC,
  labelIds = DEFAULT_LABELS,
  labelFilterAction = "include",
}) {
  if (!topicName) {
    throw new Error("GMAIL_PUBSUB_TOPIC is required to start a watch");
  }

  const gmail = await getGmailClient();
  const requestBody = {
    topicName,
    labelIds,
    labelFilterAction,
  };

  const { data } = await gmail.users.watch({
    userId: "me",
    requestBody,
  });

  // Get user email from OAuth2 or env var
  const userEmail = getUserEmail() || process.env.GMAIL_IMPERSONATED_USER;
  
  await GmailSyncState.findOneAndUpdate(
    { userEmail: userEmail },
    {
      $set: {
        historyId: data.historyId,
        expiration: data.expiration ? new Date(Number(data.expiration)) : null,
        topicName,
        labelIds,
        lastError: null,
        userEmail: userEmail, // Ensure userEmail is stored
      },
    },
    { upsert: true }
  );

  return data;
}

export async function getRecentMessages({ agentEmail, limit = 50, status = "active" }) {
  const query = { status };
  if (agentEmail) {
    // If agentEmail is provided, show messages that:
    // 1. Are assigned to this agent, OR
    // 2. Are unassigned (agentEmail is null or doesn't exist)
    query.$or = [
      { agentEmail: agentEmail.toLowerCase() },
      { agentEmail: null },
      { agentEmail: { $exists: false } }
    ];
  }
  // If no agentEmail provided, show all messages (admin view)

  console.log(`[getRecentMessages] Query:`, JSON.stringify(query, null, 2));
  
  // Also check total count without filters for debugging
  const totalCount = await GmailMessage.countDocuments({});
  console.log(`[getRecentMessages] Total messages in database: ${totalCount}`);
  
  const messages = await GmailMessage.find(query)
    .sort({ internalDate: -1 })
    .limit(limit);
  
  console.log(`[getRecentMessages] Found ${messages.length} messages matching query`);
  
  // If no messages found but there are messages in DB, show what's there
  if (messages.length === 0 && totalCount > 0) {
    const sampleMessages = await GmailMessage.find({}).limit(3).lean();
    console.log(`[getRecentMessages] Sample messages in DB (not matching query):`, 
      sampleMessages.map(m => ({
        _id: m._id,
        messageId: m.messageId,
        subject: m.subject,
        agentEmail: m.agentEmail,
        status: m.status,
        userEmail: m.userEmail,
      }))
    );
  } else if (messages.length > 0) {
    console.log(`[getRecentMessages] Sample message:`, {
      _id: messages[0]._id,
      messageId: messages[0].messageId,
      subject: messages[0].subject,
      agentEmail: messages[0].agentEmail,
      status: messages[0].status,
      userEmail: messages[0].userEmail,
    });
  }

  return messages;
}

