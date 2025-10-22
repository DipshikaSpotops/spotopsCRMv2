import express from "express";
import PartName from "../models/PartName.js";   
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const parts = await PartName.find().sort({ name: 1 }); 
    res.json(parts);
  } catch (err) {
    console.error("Error fetching parts:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Part name is required" });

    // Check if part already exists
    const existing = await PartName.findOne({ name });
    if (existing) return res.status(409).json({ error: "Part already exists" });

    const newPart = new PartName({ name });
    await newPart.save();
    res.status(201).json(newPart);
  } catch (err) {
    console.error("Error adding part:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
