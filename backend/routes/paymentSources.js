import express from "express";
import {
  createPaymentSource,
  listPaymentSourcesSorted,
} from "../services/paymentSourceService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const sources = await listPaymentSourcesSorted();
    res.json(sources);
  } catch (err) {
    console.error("Error fetching payment sources:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const created = await createPaymentSource({
      name: req.body?.name,
      showCardInfo: req.body?.showCardInfo,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("Error adding payment source:", err);
    if (err?.status) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Payment source already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
