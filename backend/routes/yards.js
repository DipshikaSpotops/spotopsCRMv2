// routes/yards.js
import express from "express";
import Yard from "../models/Yards.js"; // your Yard model
import moment from "moment-timezone";

const router = express.Router();

// Get all yards (for dropdown)
router.get("/", async (req, res) => {
  try {
    const yards = await Yard.find(
      {},
      "yardName yardRating phone altNo email street city state zipcode country warranty"
    );
    res.json(yards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch yards" });
  }
});
// GET /api/yards/today - Get yards added today (Dallas time)
router.get("/today", async (req, res) => {
  try {
    const ZONE = "America/Chicago";
    
    // Get today's date range in Dallas timezone
    const todayDallas = moment.tz(ZONE);
    const startOfDay = todayDallas.clone().startOf("day").utc().toDate();
    const endOfDay = todayDallas.clone().endOf("day").utc().toDate();

    // Find yards created today (using createdAt field from timestamps)
    const yards = await Yard.find({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .select("yardName")
      .sort({ createdAt: -1 });

    res.json({
      yards: yards.map((y) => y.yardName),
      count: yards.length,
    });
  } catch (err) {
    console.error("GET /api/yards/today failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
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

// GET /api/yards/today - Get yards added today (Dallas time)
router.get("/today", async (req, res) => {
  try {
    const moment = (await import("moment-timezone")).default;
    const ZONE = "America/Chicago";
    
    // Get today's date range in Dallas timezone
    const todayDallas = moment.tz(ZONE);
    const startOfDay = todayDallas.clone().startOf("day").utc().toDate();
    const endOfDay = todayDallas.clone().endOf("day").utc().toDate();

    // Find yards created today (using createdAt field)
    const yards = await Yard.find({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .select("yardName")
      .sort({ createdAt: -1 });

    res.json({
      yards: yards.map((y) => y.yardName),
      count: yards.length,
    });
  } catch (err) {
    console.error("GET /api/yards/today failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// GET /api/yards/list - Get yards with pagination and search (must be before /:id route)
router.get("/list", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "25", 10);
    const searchTerm = req.query.searchTerm || "";
    const sortBy = req.query.sortBy || "updatedAt";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
    const skip = (page - 1) * limit;

    // Build search query
    let query = {};
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, "i");
      query = {
        $or: [
          { yardName: searchRegex },
          { street: searchRegex },
          { city: searchRegex },
          { state: searchRegex },
          { zipcode: searchRegex },
          { country: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { altNo: searchRegex },
          { yardRating: searchRegex },
        ],
      };
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder;

    // Get total count of all yards (unfiltered)
    const totalCountAll = await Yard.countDocuments({});
    
    // Get filtered count (matching search if any)
    const filteredCount = await Yard.countDocuments(query);
    
    const yards = await Yard.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .select("yardName yardRating phone altNo email street city state zipcode country updatedAt");

    const totalPages = Math.ceil(filteredCount / limit);

    res.json({
      yards,
      currentPage: page,
      totalPages,
      totalCount: filteredCount, // Count matching current search/filter
      totalCountAll, // Total count of all yards regardless of search
    });
  } catch (err) {
    console.error("GET /api/yards/list failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get a single yard by id (optional) - must be after specific routes like /list
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

// PUT /api/yards/:id - Update a yard
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
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
      country,
      warranty,
    } = req.body;

    const yard = await Yard.findByIdAndUpdate(
      id,
      {
        $set: {
          yardName: yardName?.trim(),
          yardRating,
          phone,
          altNo,
          email,
          street,
          city,
          state,
          zipcode,
          country,
          warranty,
        },
      },
      { new: true, runValidators: true }
    );

    if (!yard) {
      return res.status(404).json({ message: "Yard not found" });
    }

    res.json({ message: "Yard updated successfully", yard });
  } catch (err) {
    console.error("PUT /api/yards/:id failed:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Validation error", error: err.message });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// DELETE /api/yards/:id - Delete a yard
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const yard = await Yard.findByIdAndDelete(id);

    if (!yard) {
      return res.status(404).json({ message: "Yard not found" });
    }

    res.json({ message: "Yard deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/yards/:id failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

export default router;
