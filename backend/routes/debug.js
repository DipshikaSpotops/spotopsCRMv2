import express from "express";
const router = express.Router();

router.post("/ping/:orderNo", (req, res) => {
  const { orderNo } = req.params;
  const io = req.app.get("io");
  // emit a message to everyone in that order room
  io.to(`order:${orderNo}`).emit("order:msg", {
    type: "STATUS_CHANGED",       // one of the types your hook already handles
    orderNo,
    ts: Date.now(),
    note: "debug ping",
  });
  res.json({ ok: true, sentTo: `order:${orderNo}` });
});

export default router;
