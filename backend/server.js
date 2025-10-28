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
import debugRouter from "./routes/debug.js";

dotenv.config();

const app = express();

/* ---------- harden & log early ---------- */
const ALLOWED_ORIGIN = process.env.PUBLIC_ORIGIN || "http://13.233.238.230";
app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server / curl (no origin) and our known origins
    if (!origin) return cb(null, true);
    const allow = new Set([
      ALLOWED_ORIGIN,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
    return cb(null, allow.has(origin));
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Requested-With"]
}));
app.options("*", cors());

// request log BEFORE routes so we see everything
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json());
app.use(cookieParser());

/* ---------- health ---------- */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

/* ---------- routes ---------- */
app.use("/api/auth", authRoutes);

app.use("/orders/placed", placedOrdersRoutes);
app.use("/parts", partsRoute);
app.use("/orders/customerApproved", custApprovedRoutes);
app.use("/orders/monthlyOrders", monthlyOrders);
app.use("/orders/ordersPerPage", AllOrders);
app.use("/orders/yardProcessingOrders", YardProcessingOrders);
app.use("/orders/inTransitOrders", InTransitOrders);
app.use("/orders/cancelledOrders", CancelledOrders);
app.use("/orders/refundedOrders", RefundedOrders);
app.use("/orders/disputedOrders", DisputedOrders);
app.use("/orders/fulfilledOrders", FulfilledOrders);
app.use("/orders/overallEscalationOrders", OverallEscalationOrders);
app.use("/orders/ongoingEscalationOrders", OngoingEscalationOrders);
app.use("/api/users", usersRouter);
app.use("/orders/storeCredits", StoreCredits);
app.use("/emails", emailsRouter);
app.use("/orders", ordersSearchRouter);
app.use("/api/yards", yardsRouter);
app.use("/debug", debugRouter);

// If sendPO defines very broad paths, keep it AFTER /api/* mounts
app.use("/", sendPORouter);

// Catch-all /orders router LAST so it doesn't shadow the specific /orders/* above
app.use("/orders", ordersRoute);

/* ---------- base ---------- */
app.get("/", (_req, res) => {
  res.send("Backend is live!");
});

/* ---------- socket.io ---------- */
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST","PUT","PATCH"] }
});

app.set("io", io);

export function publishOrder(orderNo, payload = {}) {
  io.to(`order.${orderNo}`).emit("order:msg", { orderNo, ...payload });
}
app.locals.publishOrder = publishOrder;

io.on("connection", (socket) => {
  console.log("Client connected", socket.id);
  socket.on("joinOrder", (orderNo) => {
    const room = `order.${orderNo}`;
    socket.join(room);
    socket.emit("order:msg", { type: "JOINED", orderNo });
  });
  socket.on("leaveOrder", (orderNo) => socket.leave(`order.${orderNo}`));
  socket.on("disconnect", () => console.log("Client disconnected", socket.id));
});

/* ---------- mongo ---------- */
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

const mongoUri = process.env.MONGODB_URI;
console.log("Connecting to MongoDB...",mongoUri);
if (!mongoUri) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(() => {
    // `c` was undefined before — use mongoose.connection safely
    const { host, port, name, user } = mongoose.connection;
    console.log("MongoDB connected", JSON.stringify({
      host, port, name, user: user || null
    }));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

/* ---------- start ---------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export { io };
