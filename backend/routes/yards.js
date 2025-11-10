// routes/yards.js
import express from "express";
import Yard from "../models/Yards.js"; // your Yard model

const router = express.Router();

function normaliseWarrantyUnit(unit) {
  const clean = String(unit || "").toLowerCase().trim();
  if (clean === "months" || clean === "month") return "months";
  if (clean === "years" || clean === "year") return "years";
  return "days";
}

// Get all yards (for dropdown)
router.get("/", async (req, res) => {
  try {
    const yards = await Yard.find(
      {},
      "yardName yardRating phone altNo email street city state zipcode country warranty yardWarrantyField"
    );
    res.json(yards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch yards" });
  }
});
//Checking if yard exists by name (used in frontend)
router.get("/search", async (req, res) => {
  try {
    const name = req.query.name?.toLowerCase().replace(/&/g, "and").replace(/\s+/g, "").trim();
    if (!name) return res.json([]);

    const results = await Yard.find({
      $expr: {
        $eq: [
          {
            $replaceAll: {
              input: {
                $replaceAll: { input: "$yardName", find: "&", replacement: "and" },
              },
              find: " ",
              replacement: "",
            },
          },
          name,
        ],
      },
    });

    res.json(results);
  } catch (err) {
    console.error("GET /api/yards/search failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// Get a single yard by id (optional)
router.get("/:id", async (req, res) => {
  try {
    const yard = await Yard.findById(req.params.id);
    res.json(yard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch yard" });
  }
});
// 🔹 POST /api/yards → add if not exists, update if exists (unique yardName)
router.post("/", async (req, res) => {
  try {
    const {
      yardName,
      yardRating,
      phone,
      altNo,
      email,
      street,
      city,
      state,
      zipcode,
      country = "US",
      yardWarrantyField,
      warranty,
    } = req.body;

    if (!yardName || !yardName.trim()) {
      return res.status(400).json({ message: "yardName is required" });
    }

    // Normalize name for consistent matching like “G & T” vs “G&T”
    const normalize = (name) =>
      name.toLowerCase().replace(/&/g, "and").replace(/\s+/g, "").trim();
    const normName = normalize(yardName);

    // Check for an existing yard by normalized comparison
    const existing = await Yard.findOne({
      $expr: {
        $eq: [
          {
            $replaceAll: {
              input: {
                $replaceAll: {
                  input: { $toLower: "$yardName" },
                  find: "&",
                  replacement: "and",
                },
              },
              find: " ",
              replacement: "",
            },
          },
          normName,
        ],
      },
    });

    if (existing) {
      // Update the existing yard instead of throwing duplicate error
      const updated = await Yard.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            yardRating,
            phone,
            altNo,
            email,
            street,
            city,
            state,
            zipcode,
            country,
          yardWarrantyField: normaliseWarrantyUnit(yardWarrantyField),
          warranty,
          },
        },
        { new: true }
      );
      return res.json({ message: "Yard updated (existing reused)", yard: updated });
    }

    // Otherwise create new yard
    const newYard = new Yard({
      yardName: yardName.trim(),
      yardRating,
      phone,
      altNo,
      email,
      street,
      city,
      state,
      zipcode,
      country,
      yardWarrantyField: normaliseWarrantyUnit(yardWarrantyField),
      warranty,
    });

    await newYard.save();
    res.status(201).json({ message: "New yard added", yard: newYard });
  } catch (err) {
    if (err.code === 11000) {
      // catch duplicate key gracefully
      return res.status(200).json({ message: "Yard already exists" });
    }
    console.error("POST /api/yards failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

export default router;
