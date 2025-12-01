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
app.use("/api/orders/inTransitOrders", InTransitOrders);
app.use("/api/orders/cancelledOrders", CancelledOrders);
app.use("/api/orders/refundedOrders", RefundedOrders);
app.use("/api/orders/disputedOrders", DisputedOrders);
app.use("/api/orders/fulfilledOrders", FulfilledOrders);
app.use("/api/orders/overallEscalationOrders", OverallEscalationOrders);
app.use("/api/orders/ongoingEscalationOrders", OngoingEscalationOrders);
app.use("/users", usersRouter);
app.use("/api/users", usersRouter);
app.use("/orders/storeCredits", StoreCredits);
app.use("/emails", emailsRouter);
app.use("/api/emails", emailsRouter);
app.use("/orders", ordersSearchRouter);
app.use("/", sendPORouter);
app.use("/api", sendPORouter);
app.use("/api/yards", yardsRouter);
app.use("/api/utils/zip-lookup", zipLookupRouter);
app.use("/debug", debugRouter);
app.use("/api/gmail", gmailRouter);
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
        const currentUsers = Array.from(activeUsers.get(orderNo).values());
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
    
    // Store user info
    userInfo = {
      firstName: userData?.firstName || "Unknown",
      role: userData?.role || "User",
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
    
    // Send current active users to the new joiner (debounced and deduplicated)
    setTimeout(() => {
      if (activeUsers.has(orderNo)) {
        // Deduplicate by socketId before sending
        const usersMap = new Map();
        activeUsers.get(orderNo).forEach((user, socketId) => {
          if (!usersMap.has(socketId)) {
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

// Export io if we still want it elsewhere
export { io };
