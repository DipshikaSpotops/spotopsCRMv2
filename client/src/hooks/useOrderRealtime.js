// src/hooks/useOrderRealtime.js
import { useEffect, useRef } from "react";
import { io as ioClient } from "socket.io-client";
import { getActorId } from "../utils/actorId";

const myActorId = getActorId(); // stable per-browser id

// Derive Socket.IO URL from API base URL if VITE_SOCKET_URL is not set
function getSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  // If VITE_API_BASE_URL is set, use it (remove /api if present)
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase) {
    // Remove trailing /api if present, and any trailing slashes
    return apiBase.replace(/\/api\/?$/, "").replace(/\/$/, "");
  }
  // Fallback to localhost for development
  return "http://localhost:5000";
}

export default function useOrderRealtime(
  orderNo,
  {
    onEvent,
    enabled = true,
    url = getSocketUrl(),
  } = {}
) {
  const socketRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !orderNo) return;
    if (startedRef.current) return;
    startedRef.current = true;

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
      console.log("[io] connected", socket.id);
      // keep join format the same (server expects a string),
      // but also optionally identify this tab for the server (safe if ignored).
      socket.emit("joinOrder", orderNo);
      socket.emit("identify", { actorId: myActorId });
    });

    socket.on("order:msg", (msg) => {
      // msg should contain actorId from the server-side publish()
      const isSelf = !!msg?.actorId && msg.actorId === myActorId;
      console.log("[io] order:event", msg, "(isSelf:", isSelf, ")");
      if (typeof onEvent === "function") onEvent(msg, { isSelf, myActorId });
    });

    socket.on("connect_error", (err) => {
      console.warn("[io] connect_error", err?.message || err);
    });

    socket.on("disconnect", (reason) => {
      console.log("[io] disconnected:", reason);
    });

    return () => {
      try {
        socket.emit("leaveOrder", orderNo);
        socket.disconnect();
      } catch {}
      socketRef.current = null;
      startedRef.current = false;
    };
  }, [enabled, orderNo, url, onEvent]);
}
