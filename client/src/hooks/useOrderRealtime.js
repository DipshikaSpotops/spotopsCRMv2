// src/hooks/useOrderRealtime.js
import { useEffect, useRef } from "react";
import { io as ioClient } from "socket.io-client";
import { getActorId } from "../utils/actorId";

const myActorId = getActorId(); // stable per-browser id

export default function useOrderRealtime(
  orderNo,
  {
    onEvent,
    enabled = true,
    url = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000",
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
