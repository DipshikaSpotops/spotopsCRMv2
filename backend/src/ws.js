// backend/src/ws.js
import http from "http";
import { WebSocketServer } from "ws";
import url from "url";

export function createWsServer(app) {
  // use a single HTTP server for both Express and WS
  const server = http.createServer(app);

  const wss = new WebSocketServer({ noServer: true });

  // topic -> Set<WebSocket>
  const topics = new Map();

  function subscribe(topic, ws) {
    if (!topics.has(topic)) topics.set(topic, new Set());
    topics.get(topic).add(ws);
    ws.on("close", () => topics.get(topic)?.delete(ws));
  }

  // Upgrade handler (for /ws only)
  server.on("upgrade", (req, socket, head) => {
    const { pathname, query } = url.parse(req.url, true);
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const topic = query.topic; // e.g. "order.50STARSTEST"
      if (topic) subscribe(topic, ws);
      else ws.close(1008, "Missing topic");
    });
  });

  // Helper you can call from routes/controllers
  function publishOrder(orderNo, payload) {
    const topic = `order.${orderNo}`;
    const packet = JSON.stringify({ orderNo, ...payload });
    const set = topics.get(topic);
    if (!set) return;
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(packet);
    }
  }

  return { server, publishOrder };
}
