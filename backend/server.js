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
app.use("/parts", partsRoute);
app.use("/api/orders/customerApproved", custApprovedRoutes);
app.use("/api/orders/monthlyOrders", monthlyOrders);
app.use("/orders/ordersPerPage", AllOrders);
app.use("/api/orders/yardProcessingOrders", YardProcessingOrders);
app.use("/api/orders/inTransitOrders", InTransitOrders);
app.use("/api/orders/cancelledOrders", CancelledOrders);
app.use("/orders/refundedOrders", RefundedOrders);
app.use("/orders/disputedOrders", DisputedOrders);
app.use("/orders/fulfilledOrders", FulfilledOrders);
app.use("/api/orders/overallEscalationOrders", OverallEscalationOrders);
app.use("/api/orders/ongoingEscalationOrders", OngoingEscalationOrders);
app.use("/users", usersRouter);
app.use("/orders/storeCredits", StoreCredits);
app.use("/emails", emailsRouter);
app.use("/orders", ordersSearchRouter);
app.use("/", sendPORouter);
app.use("/api/yards", yardsRouter);
app.use("/debug", debugRouter);
// Catch-all /orders router LAST
app.use("/api/orders", ordersRoute);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (req, res) => {
  res.send("Backend is live!");
});


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

io.on("connection", (socket) => {
  console.log("Client connected", socket.id);

  socket.on("joinOrder", (orderNo) => {
    const room = `order.${orderNo}`;
    socket.join(room);
    // optional: ack
    socket.emit("order:msg", { type: "JOINED", orderNo });
  });

  socket.on("leaveOrder", (orderNo) => {
    socket.leave(`order.${orderNo}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
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
