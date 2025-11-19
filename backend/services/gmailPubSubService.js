import GmailMessage from "../models/GmailMessage.js";
import GmailSyncState from "../models/GmailSyncState.js";
import { getGmailClient } from "./googleAuth.js";

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

function detectAgent(headers) {
  if (!SALES_AGENT_EMAILS.length) return null;

  const deliveredTo = normalizeEmails(headerValue(headers, "Delivered-To"));
  const toHeader = normalizeEmails(headerValue(headers, "To"));
  const ccHeader = normalizeEmails(headerValue(headers, "Cc"));

  const all = [...deliveredTo, ...toHeader, ...ccHeader];
  return (
    all.find((email) => SALES_AGENT_EMAILS.includes(email.toLowerCase())) || null
  );
}

function buildMessageDoc({ message, agentEmail, userEmail }) {
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

async function persistMessage(doc) {
  return GmailMessage.findOneAndUpdate(
    { messageId: doc.messageId },
    {
      $setOnInsert: {
        ...doc,
        status: "active",
        processedAt: new Date(),
      },
      $set: {
        processedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
}

async function processHistoryEntry({ entry, gmail, userEmail }) {
  if (!entry?.messagesAdded) return [];
  const createdMessages = [];

  for (const added of entry.messagesAdded) {
    const messageId = added?.message?.id;
    if (!messageId) continue;

    const alreadyExists = await GmailMessage.exists({ messageId });
    if (alreadyExists) continue;

    const fullMessage = await fetchMessage(gmail, messageId);
    const agentEmail = detectAgent(fullMessage.payload?.headers || []);
    const doc = buildMessageDoc({
      message: fullMessage,
      agentEmail,
      userEmail,
    });

    const saved = await persistMessage(doc);
    createdMessages.push(saved);
  }

  return createdMessages;
}

export async function syncHistory({ userEmail, startHistoryId }) {
  const gmail = getGmailClient();
  let pageToken;
  let pages = 0;
  let latestHistoryId = startHistoryId;
  const created = [];

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
    for (const entry of historyEntries) {
      latestHistoryId = entry.id || latestHistoryId;
      const docs = await processHistoryEntry({ entry, gmail, userEmail });
      created.push(...docs);
    }
  } while (pageToken && pages < MAX_HISTORY_PAGES);

  await GmailSyncState.findOneAndUpdate(
    { userEmail },
    {
      $set: {
        historyId: latestHistoryId,
        lastSyncedAt: new Date(),
        labelIds: DEFAULT_LABELS,
        lastError: null,
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

  const state =
    (await GmailSyncState.findOne({ userEmail: emailAddress })) || {};
  const startHistoryId = state.historyId || historyId;

  try {
    const result = await syncHistory({
      userEmail: emailAddress,
      startHistoryId,
    });
    return result;
  } catch (err) {
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

  const gmail = getGmailClient();
  const requestBody = {
    topicName,
    labelIds,
    labelFilterAction,
  };

  const { data } = await gmail.users.watch({
    userId: "me",
    requestBody,
  });

  await GmailSyncState.findOneAndUpdate(
    { userEmail: process.env.GMAIL_IMPERSONATED_USER },
    {
      $set: {
        historyId: data.historyId,
        expiration: data.expiration ? new Date(Number(data.expiration)) : null,
        topicName,
        labelIds,
        lastError: null,
      },
    },
    { upsert: true }
  );

  return data;
}

export async function getRecentMessages({ agentEmail, limit = 50, status = "active" }) {
  const query = { status };
  if (agentEmail) {
    query.agentEmail = agentEmail.toLowerCase();
  }

  const messages = await GmailMessage.find(query)
    .sort({ internalDate: -1 })
    .limit(limit);

  return messages;
}

