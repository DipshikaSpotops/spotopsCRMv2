import { useEffect, useRef } from "react";
import { io as ioClient } from "socket.io-client";

// Derive Socket.IO URL from API base URL if VITE_SOCKET_URL is not set
function getSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase) {
    return apiBase.replace(/\/api\/?$/, "").replace(/\/$/, "");
  }
  return "http://localhost:5000";
}

/**
 * Global realtime hook for order list pages (Placed, All, In Transit, etc.).
 *
 * It listens for:
 *  - "orderCreated"  (new order inserted)
 *  - "orderUpdated"  (any meaningful update / status change)
 *
 * Then calls your callbacks so you can refetch with current filters,
 * or patch local state.
 */
export default function useOrdersRealtime({
  enabled = true,
  onOrderCreated,
  onOrderUpdated,
  url = getSocketUrl(),
} = {}) {
  const socketRef = useRef(null);
  const createdRef = useRef(onOrderCreated);
  const updatedRef = useRef(onOrderUpdated);

  // keep latest callbacks in refs so the socket handlers don't go stale
  useEffect(() => {
    createdRef.current = onOrderCreated;
  }, [onOrderCreated]);

  useEffect(() => {
    updatedRef.current = onOrderUpdated;
  }, [onOrderUpdated]);

  useEffect(() => {
    if (!enabled) return;
    if (socketRef.current) return;

    const socket = ioClient(url, {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      withCredentials: false,
      path: "/socket.io",
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[ordersRealtime] connected", socket.id);
    });

    socket.on("orderCreated", (order) => {
      if (typeof createdRef.current === "function") {
        createdRef.current(order);
      }
    });

    socket.on("orderUpdated", (order) => {
      if (typeof updatedRef.current === "function") {
        updatedRef.current(order);
      }
    });

    socket.on("connect_error", (err) => {
      console.warn("[ordersRealtime] connect_error", err?.message || err);
    });

    socket.on("disconnect", (reason) => {
      console.log("[ordersRealtime] disconnected:", reason);
    });

    return () => {
      try {
        socket.disconnect();
      } catch {}
      socketRef.current = null;
    };
  }, [enabled, url]);

  return socketRef.current;
}


