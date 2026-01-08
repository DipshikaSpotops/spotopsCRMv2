import express from "express";
// import { createWsServer } from "./src/ws.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/authRoutes.js";
import ordersRoute from "./routes/orders.js";
import partsRoute from "./routes/parts.js";
import placedOrdersRoutes from "./routes/placedOrders.js";
import partiallyChargedOrdersRoutes from "./routes/partiallyChargedOrders.js";
import custApprovedRoutes from "./routes/customerApproved.js";
import monthlyOrders from "./routes/monthlyOrders.js";
import AllOrders from "./routes/AllOrders.js";
import YardProcessingOrders from "./routes/yardProcessing.js";
import OwnShippingOrders from "./routes/ownShippingOrders.js";
import InTransitOrders from "./routes/inTransit.js";
import CancelledOrders from "./routes/cancelledOrders.js";
import RefundedOrders from "./routes/refundedOrders.js";
import DisputedOrders from "./routes/disputedOrders.js";
import FulfilledOrders from "./routes/fulfilledOrders.js";
import OverallEscalationOrders from "./routes/overallEscalationOrders.js";
import OngoingEscalationOrders from "./routes/ongoingEscalationOrders.js";
import usersRouter from "./routes/users.js";
import StoreCredits from "./routes/storeCredits.js";
import emailsRouter from "./routes/emails.js";
import ordersSearchRouter from "./routes/ordersSearch.js";
import sendPORouter from "./routes/sendPO.js";
import yardsRouter from "./routes/yards.js";
import zipLookupRouter from "./routes/zipLookup.js";
import debugRouter from "./routes/debug.js";
import gmailRouter from "./routes/gmail.js";


dotenv.config();

const app = express();
app.use(
  cors({
    origin: true,            // Reflects request origin
    credentials: true,       // Allows cookies or tokens
  })
);

app.use(express.json());
app.use(cookieParser());

// ROUTES
app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
}); 

app.use("/api/auth", authRoutes);

app.use("/api/orders/placed", placedOrdersRoutes);
app.use("/api/orders/partially-charged", partiallyChargedOrdersRoutes);
app.use("/parts", partsRoute); // legacy path
app.use("/api/parts", partsRoute);
app.use("/api/orders/customerApproved", custApprovedRoutes);
app.use("/api/orders/monthlyOrders", monthlyOrders);
app.use("/api/orders/ordersPerPage", AllOrders);
app.use("/api/orders/yardProcessingOrders", YardProcessingOrders);
app.use("/api/orders/ownShippingOrders", OwnShippingOrders);
app.use("/api/orders/inTransitOrders", InTransitOrders);
app.use("/api/orders/cancelledOrders", CancelledOrders);
app.use("/api/orders/refundedOrders", RefundedOrders);
app.use("/api/orders/disputedOrders", DisputedOrders);
app.use("/api/orders/fulfilledOrders", FulfilledOrders);
app.use("/api/orders/overallEscalationOrders", OverallEscalationOrders);
app.use("/api/orders/ongoingEscalationOrders", OngoingEscalationOrders);
app.use("/users", usersRouter);
app.use("/api/users", usersRouter);
app.use("/api/orders/storeCredits", StoreCredits);
app.use("/emails", emailsRouter);
app.use("/api/emails", emailsRouter);
app.use("/orders", ordersSearchRouter);
app.use("/", sendPORouter);
app.use("/api", sendPORouter);
app.use("/api/yards", yardsRouter);
app.use("/api/utils/zip-lookup", zipLookupRouter);
app.use("/debug", debugRouter);
app.use("/api/gmail", gmailRouter);

// Add redirect route for OAuth callback (in case credentials.json has wrong redirect URI)
app.get("/oauth2/callback", (req, res) => {
  // Redirect to the correct callback URL
  const queryString = req.url.split("?")[1] || "";
  res.redirect(`/api/gmail/oauth2/callback?${queryString}`);
});
// Catch-all /orders router LAST
app.use("/api/orders", ordersRoute);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (req, res) => {
  res.send("Backend is live!");
});

// SSE: Server-Sent Events for live Gmail updates
const sseClients = new Set();
function sseBroadcast(type, payload = {}) {
  const data = `event: ${type}\n` + `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch (err) {
      // Client disconnected, remove it
      sseClients.delete(res);
    }
  }
}
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(":\n\n");
  sseClients.add(res);
  req.on("close", () => {
    sseClients.delete(res);
  });
});

// Export sseBroadcast for use in controllers
app.locals.sseBroadcast = sseBroadcast;
export function broadcastGmailUpdate(payload) {
  sseBroadcast("gmail", payload);
}

// SOCKET.IO SETUP 
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST","PUT","PATCH"] }
});

// make io and publisher available to routes/controllers
app.set("io", io);

// publish helper (call this from controllers after DB writes)
export function publishOrder(orderNo, payload = {}) {
  io.to(`order.${orderNo}`).emit("order:msg", { orderNo, ...payload });
}
// also expose through app.locals for easy access via req.app.locals
app.locals.publishOrder = publishOrder;

// Track active users per order: orderNo -> Map<socketId, {firstName, role, joinedAt}>
const activeUsers = new Map();

io.on("connection", (socket) => {
  console.log("Client connected", socket.id);
  let currentOrderNo = null;
  let userInfo = null;

  socket.on("joinOrder", (orderNo, userData) => {
    const room = `order.${orderNo}`;
    
    // If already in this room, don't re-add (prevents duplicates on reconnection)
    if (currentOrderNo === orderNo && userInfo) {
      // Just send current presence to this socket
      if (activeUsers.has(orderNo)) {
        const currentUsers = Array.from(activeUsers.get(orderNo).values())
          .filter(u => u.firstName !== "Unknown"); // Filter out Unknown users
        socket.emit("order:msg", {
          type: "PRESENCE_UPDATE",
          orderNo,
          activeUsers: currentUsers,
        });
      }
      return;
    }
    
    // Leave previous room if switching
    if (currentOrderNo && currentOrderNo !== orderNo) {
      socket.leave(`order.${currentOrderNo}`);
      if (activeUsers.has(currentOrderNo)) {
        activeUsers.get(currentOrderNo).delete(socket.id);
        if (activeUsers.get(currentOrderNo).size === 0) {
          activeUsers.delete(currentOrderNo);
        } else {
          io.to(`order.${currentOrderNo}`).emit("order:msg", {
            type: "USER_LEFT",
            orderNo: currentOrderNo,
            socketId: socket.id,
          });
        }
      }
    }
    
    socket.join(room);
    currentOrderNo = orderNo;
    
    // Only track user if we have valid firstName (skip "Unknown" users)
    if (userData && userData.firstName && userData.firstName !== "Unknown") {
      // Store user info
      userInfo = {
        firstName: userData.firstName,
        role: userData.role || undefined, // Don't set "User" as default
        socketId: socket.id,
        joinedAt: new Date().toISOString(),
      };
      
      // Track active user (will overwrite if exists, preventing duplicates)
      if (!activeUsers.has(orderNo)) {
        activeUsers.set(orderNo, new Map());
      }
      activeUsers.get(orderNo).set(socket.id, userInfo);
      
      // Broadcast presence update to others in the room (only once)
      socket.to(room).emit("order:msg", {
        type: "USER_JOINED",
        orderNo,
        user: userInfo,
      });
    } else {
      // No valid user info, don't track in presence
      userInfo = null;
    }
    
    // Send current active users to the new joiner (debounced and deduplicated)
    setTimeout(() => {
      if (activeUsers.has(orderNo)) {
        // Deduplicate by socketId and filter out Unknown users before sending
        const usersMap = new Map();
        activeUsers.get(orderNo).forEach((user, socketId) => {
          if (!usersMap.has(socketId) && user.firstName !== "Unknown") {
            usersMap.set(socketId, user);
          }
        });
        const currentUsers = Array.from(usersMap.values());
        socket.emit("order:msg", {
          type: "PRESENCE_UPDATE",
          orderNo,
          activeUsers: currentUsers,
        });
      }
    }, 100);
  });

  socket.on("leaveOrder", (orderNo) => {
    socket.leave(`order.${orderNo}`);
    
    // Remove from active users
    if (activeUsers.has(orderNo)) {
      activeUsers.get(orderNo).delete(socket.id);
      
      // If no more users, clean up
      if (activeUsers.get(orderNo).size === 0) {
        activeUsers.delete(orderNo);
      } else {
        // Broadcast user left
        io.to(`order.${orderNo}`).emit("order:msg", {
          type: "USER_LEFT",
          orderNo,
          socketId: socket.id,
        });
      }
    }
    
    if (orderNo === currentOrderNo) {
      currentOrderNo = null;
      userInfo = null;
    }
  });

  // Typing indicators
  socket.on("typing:start", (data) => {
    const { orderNo, commentType, yardIndex, user } = data;
    socket.to(`order.${orderNo}`).emit("order:msg", {
      type: "TYPING_START",
      orderNo,
      commentType, // "support" or "yard"
      yardIndex,
      user: user || userInfo,
    });
  });

  socket.on("typing:stop", (data) => {
    const { orderNo, commentType, yardIndex } = data;
    socket.to(`order.${orderNo}`).emit("order:msg", {
      type: "TYPING_STOP",
      orderNo,
      commentType,
      yardIndex,
      socketId: socket.id,
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
    
    // Clean up presence tracking
    if (currentOrderNo && activeUsers.has(currentOrderNo)) {
      activeUsers.get(currentOrderNo).delete(socket.id);
      
      if (activeUsers.get(currentOrderNo).size === 0) {
        activeUsers.delete(currentOrderNo);
      } else {
        // Broadcast user left
        io.to(`order.${currentOrderNo}`).emit("order:msg", {
          type: "USER_LEFT",
          orderNo: currentOrderNo,
          socketId: socket.id,
        });
      }
    }
  });
});

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Background job: Proactively refresh Gmail OAuth tokens before they expire
// This runs every 20 minutes to check and refresh tokens if needed
import { startWatch } from "./services/gmailPubSubService.js";
import GmailSyncState from "./models/GmailSyncState.js";

// Import refresh function
import { getGmailClient, refreshAccessTokenIfNeeded } from "./services/googleAuth.js";

// Refresh token on startup (with graceful error handling)
setTimeout(async () => {
  try {
    console.log("[Token Refresh] Starting initial token check...");
    await refreshAccessTokenIfNeeded();
    console.log("[Token Refresh] Initial token check completed successfully");
  } catch (err) {
    // Don't log errors for missing token.json (expected if not configured)
    if (err.message?.includes("Missing token.json")) {
      console.log("[Token Refresh] No token.json found - Gmail not configured yet");
      return;
    }
    // For invalid_grant, just warn - email will still work from id_token
    if (err.message?.includes("invalid_grant") || err.message?.includes("refresh token") || err.message?.includes("re-authorize")) {
      console.error("[Token Refresh] ⚠️  Refresh token invalid - Gmail API will not work");
      console.error("[Token Refresh] ⚠️  Please re-authorize at /api/gmail/oauth2/url");
      console.error("[Token Refresh] ⚠️  This is likely because:");
      console.error("[Token Refresh] ⚠️  1. App is in 'Testing' mode (refresh tokens expire after 7 days)");
      console.error("[Token Refresh] ⚠️  2. Refresh token was revoked");
      console.error("[Token Refresh] ⚠️  3. OAuth credentials changed");
      return;
    }
    console.error("[Token Refresh] Initial check error:", err.message);
  }
}, 5000); // Wait 5 seconds after server starts

// Periodic refresh job - runs every 20 minutes to proactively refresh tokens
// Google access tokens expire after 1 hour, but refresh tokens can expire if not used
// Checking every 20 minutes ensures we actively use the refresh token, keeping it alive
setInterval(async () => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[Token Refresh Job] [${timestamp}] Running scheduled token refresh...`);
    await refreshAccessTokenIfNeeded();
    console.log(`[Token Refresh Job] [${timestamp}] Token refresh check completed successfully`);
  } catch (err) {
    const timestamp = new Date().toISOString();
    // Don't log errors for missing token.json (expected if not configured)
    if (err.message?.includes("Missing token.json")) {
      return;
    }
    // For invalid_grant, log as error so it's visible
    if (err.message?.includes("invalid_grant") || err.message?.includes("refresh token") || err.message?.includes("re-authorize")) {
      console.error(`[Token Refresh Job] [${timestamp}] ⚠️  Refresh token invalid - Gmail API will not work`);
      console.error(`[Token Refresh Job] [${timestamp}] ⚠️  Please re-authorize at /api/gmail/oauth2/url`);
      console.error(`[Token Refresh Job] [${timestamp}] ⚠️  Error: ${err.message}`);
      return;
    }
    console.error(`[Token Refresh Job] [${timestamp}] Error:`, err.message);
  }
}, 20 * 60 * 1000); // Run every 20 minutes (more frequent to keep refresh token alive)

// Gmail Watch Management: Auto-start and auto-renew watch
async function initializeGmailWatch() {
  // Wait for MongoDB to be connected
  if (mongoose.connection.readyState !== 1) {
    console.log("[Gmail Watch] Waiting for MongoDB connection...");
    return;
  }

  // Check if Gmail Pub/Sub is configured
  if (!process.env.GMAIL_PUBSUB_TOPIC) {
    console.log("[Gmail Watch] GMAIL_PUBSUB_TOPIC not configured, skipping watch initialization");
    return;
  }

  try {
    // Check if we have a valid token
    await getGmailClient();
    
    // Check existing watch state
    const userEmail = (await import("./services/googleAuth.js")).getUserEmail() || process.env.GMAIL_IMPERSONATED_USER;
    if (!userEmail) {
      console.log("[Gmail Watch] No user email found, skipping watch initialization");
      return;
    }

    const state = await GmailSyncState.findOne({ userEmail });
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day from now

    // Check if watch exists and is still valid (not expired or expiring soon)
    if (state?.expiration && new Date(state.expiration) > oneDayFromNow) {
      console.log(`[Gmail Watch] Watch is active until ${state.expiration.toISOString()}, no action needed`);
      return;
    }

    // Start or renew watch
    console.log("[Gmail Watch] Starting/renewing Gmail watch...");
    const result = await startWatch({
      topicName: process.env.GMAIL_PUBSUB_TOPIC,
      labelIds: (process.env.GMAIL_WATCH_LABELS || "INBOX,UNREAD").split(",").map(l => l.trim()).filter(Boolean),
    });
    
    console.log(`[Gmail Watch] ✅ Watch started successfully. Expires: ${result.expiration ? new Date(Number(result.expiration)).toISOString() : "N/A"}`);
  } catch (err) {
    // Don't fail server startup if watch fails
    if (err.message?.includes("Missing token.json")) {
      console.log("[Gmail Watch] Token not configured, skipping watch initialization");
      return;
    }
    if (err.message?.includes("invalid_grant") || err.message?.includes("refresh token")) {
      console.warn("[Gmail Watch] Token invalid, skipping watch initialization. Re-authorize to enable auto-sync.");
      return;
    }
    console.error("[Gmail Watch] Failed to initialize watch:", err.message);
    console.error("[Gmail Watch] You can manually start watch via POST /api/gmail/watch");
  }
}

// Auto-renew watch before expiration (check every 6 hours)
async function checkAndRenewWatch() {
  if (!process.env.GMAIL_PUBSUB_TOPIC) return;
  
  try {
    const userEmail = (await import("./services/googleAuth.js")).getUserEmail() || process.env.GMAIL_IMPERSONATED_USER;
    if (!userEmail) return;

    const state = await GmailSyncState.findOne({ userEmail });
    if (!state?.expiration) {
      // No watch exists, try to start one
      await initializeGmailWatch();
      return;
    }

    const expiration = new Date(state.expiration);
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // If watch expires within 24 hours, renew it
    if (expiration <= oneDayFromNow) {
      console.log(`[Gmail Watch] Watch expires soon (${expiration.toISOString()}), renewing...`);
      await initializeGmailWatch();
    }
  } catch (err) {
    console.error("[Gmail Watch] Error checking watch status:", err.message);
  }
}

// Initialize watch after MongoDB connects and server starts
mongoose.connection.once("open", () => {
  console.log("[Gmail Watch] MongoDB connected, initializing Gmail watch...");
  // Wait a bit for everything to be ready
  setTimeout(initializeGmailWatch, 10000); // 10 seconds after MongoDB connects
});

// Check and renew watch every 6 hours
setInterval(checkAndRenewWatch, 6 * 60 * 60 * 1000); // Every 6 hours

// Export io if we still want it elsewhere
export { io };
