import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/authRoutes.js"; 
import ordersRoute from './routes/orders.js';
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

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ===================
// ROUTES
// ===================
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
app.use("/", sendPORouter);
app.use("/api/yards", yardsRouter);

// Catch-all /orders router LAST
app.use("/orders", ordersRoute);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (req, res) => {
  res.send("Backend is live!");
});

// ===================
// SOCKET.IO SETUP
// ===================
const server = http.createServer(app); 
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Handle socket connections
io.on("connection", (socket) => {
  console.log("Client connected via WebSocket");

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// ===================
// MongoDB connection
// ===================
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ===================
// Server listen
// ===================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Export io so models or routes can emit events
export { io };
