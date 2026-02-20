import express from "express";
import SalesAgent from "../models/SalesAgent.js";
import { brandMiddleware } from "../middleware/brand.js";

const router = express.Router();

// Apply brand middleware to all routes
router.use(brandMiddleware);

// GET /api/salesAgents - Get sales agents for current brand
router.get("/", async (req, res) => {
  try {
    const brand = req.brand || "50STARS";
    const agents = await SalesAgent.find({ brand }).sort({ firstName: 1 });
    res.json(agents);
  } catch (error) {
    console.error("Error fetching sales agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST /api/salesAgents - Create or update sales agents (bulk)
router.post("/", async (req, res) => {
  try {
    const brand = req.brand || "50STARS";
    const { agents } = req.body; // Array of { firstName, fullName }

    if (!Array.isArray(agents)) {
      return res.status(400).json({ message: "agents must be an array" });
    }

    const results = [];
    for (const agent of agents) {
      if (!agent.firstName || !agent.fullName) {
        continue; // Skip invalid entries
      }

      const result = await SalesAgent.findOneAndUpdate(
        { firstName: agent.firstName.trim(), brand },
        {
          firstName: agent.firstName.trim(),
          fullName: agent.fullName.trim(),
          brand,
        },
        { upsert: true, new: true }
      );
      results.push(result);
    }

    res.json({
      message: `Successfully saved ${results.length} sales agents for ${brand}`,
      agents: results,
    });
  } catch (error) {
    console.error("Error saving sales agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST /api/salesAgents/seed - Seed initial sales agents for both brands
router.post("/seed", async (req, res) => {
  try {
    const agents50STARS = [
      { firstName: "Dipsikha", fullName: "Dipsikha Pradhan" },
      { firstName: "David", fullName: "David William" },
      { firstName: "Richard", fullName: "Richard Parker" },
      { firstName: "Mark", fullName: "Mark Becker" },
      { firstName: "Michael", fullName: "Michael Turner" },
      { firstName: "Nik", fullName: "Nik Louis" },
      { firstName: "John", fullName: "John Christopher" },
      { firstName: "Tristan", fullName: "Tristan Brown" },
      { firstName: "Tony", fullName: "Tony" },
    ];

    const agentsPROLANE = [
      { firstName: "Charlie", fullName: "Charlie Miller" },
      { firstName: "Sam", fullName: "Sam Murphy" },
      { firstName: "Steve", fullName: "Steve Burnette" },
      { firstName: "Victor", fullName: "Victor Collins" },
      { firstName: "Dipsikha", fullName: "Dipsikha Pradhan" },
    ];

    const results = { "50STARS": [], PROLANE: [] };

    // Seed 50STARS agents
    for (const agent of agents50STARS) {
      const result = await SalesAgent.findOneAndUpdate(
        { firstName: agent.firstName, brand: "50STARS" },
        {
          firstName: agent.firstName,
          fullName: agent.fullName,
          brand: "50STARS",
        },
        { upsert: true, new: true }
      );
      results["50STARS"].push(result);
    }

    // Seed PROLANE agents
    for (const agent of agentsPROLANE) {
      const result = await SalesAgent.findOneAndUpdate(
        { firstName: agent.firstName, brand: "PROLANE" },
        {
          firstName: agent.firstName,
          fullName: agent.fullName,
          brand: "PROLANE",
        },
        { upsert: true, new: true }
      );
      results.PROLANE.push(result);
    }

    res.json({
      message: "Sales agents seeded successfully",
      results,
    });
  } catch (error) {
    console.error("Error seeding sales agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// DELETE /api/salesAgents/:id - Delete a sales agent
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await SalesAgent.findByIdAndDelete(id);
    if (!agent) {
      return res.status(404).json({ message: "Sales agent not found" });
    }
    res.json({ message: "Sales agent deleted successfully", agent });
  } catch (error) {
    console.error("Error deleting sales agent:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;
