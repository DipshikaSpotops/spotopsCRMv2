import express from "express";
import LeadNote from "../models/LeadNote.js";
import LeadForOrders from "../models/LeadForOrders.js";
import { requireAuth, allow } from "../middleware/auth.js";

const router = express.Router();

// Normalize brand from request
const getBrand = (req) =>
  req.brand === "PROLANE" ? "PROLANE" : "50STARS";

// Mapping from 50STARS agent firstName to PROLANE agent firstName
const AGENT_BRAND_MAPPING = {
  "Richard": "Victor",
  "Mark": "Sam",
  "David": "Steve",
  "Michael": "Charlie",
  "Dipsikha": "Dipsikha", // Same for both brands
};

// Create a new lead note for the logged-in Sales/Admin user
router.post(
  "/",
  requireAuth,
  allow("Sales", "Admin"),
  async (req, res) => {
    try {
      const {
        name,
        email,
        year,
        make,
        model,
        partRequired,
        partDescription,
        vinNo,
        partNo,
        warranty,
        warrantyField,
        comments,
        brand: selectedBrand,
        salesAgent: selectedSalesAgent,
      } = req.body || {};

      // Use selected brand from form, or fallback to request brand
      const brand = selectedBrand || getBrand(req);
      const salesAgent = selectedSalesAgent || req.user?.firstName || "Unknown";
      const createdBy = req.user?.id || "Unknown";

      // Save to both collections for now (can remove LeadNote later if needed)
      const note = await LeadNote.create({
        name,
        email,
        year,
        make,
        model,
        partRequired,
        partDescription,
        vinNo,
        partNo,
        warranty,
        warrantyField: warrantyField || "days",
        comments,
        brand,
        salesAgent,
      });

      // Also save to ordersDb Leads collection
      const leadForOrders = await LeadForOrders.create({
        name,
        email,
        year,
        make,
        model,
        partRequired,
        partDescription,
        vinNo,
        partNo,
        warranty,
        warrantyField: warrantyField || "days",
        comments,
        brand,
        salesAgent,
        createdBy,
      });

      res.status(201).json({ ...note.toObject(), _ordersDbId: leadForOrders._id });
    } catch (err) {
      console.error("POST /api/lead-notes failed:", err);
      res
        .status(500)
        .json({ message: "Failed to create lead note", error: err.message });
    }
  }
);

// Get current user's lead notes (all brands, filtered by createdBy)
router.get(
  "/my",
  requireAuth,
  allow("Sales", "Admin"),
  async (req, res) => {
    try {
      const createdBy = req.user?.id || "Unknown";

      // Build query - show all leads created by this user (across all brands)
      const query = { createdBy };
      
      // Handle date filtering (start/end are UTC ISO strings from UnifiedDatePicker)
      if (req.query.start && req.query.end) {
        query.createdAt = {
          $gte: new Date(req.query.start),
          $lte: new Date(req.query.end),
        };
      }

      // Fetch from ordersDb Leads collection
      const notes = await LeadForOrders.find(query)
        .sort({ createdAt: -1 })
        .lean();

      res.json(notes);
    } catch (err) {
      console.error("GET /api/lead-notes/my failed:", err);
      res
        .status(500)
        .json({ message: "Failed to fetch lead notes", error: err.message });
    }
  }
);

// GET /api/lead-notes/sales-agents - Get sales agents for dropdown (both brands, filtered by mapping)
router.get(
  "/sales-agents",
  requireAuth,
  allow("Sales", "Admin"),
  async (req, res) => {
    try {
      const userFirstName = req.user?.firstName || "";
      const SalesAgent = (await import("../models/SalesAgent.js")).default;

      // Fetch agents from both brands
      const [agents50STARS, agentsPROLANE] = await Promise.all([
        SalesAgent.find({ brand: "50STARS" }).sort({ firstName: 1 }).lean(),
        SalesAgent.find({ brand: "PROLANE" }).sort({ firstName: 1 }).lean(),
      ]);

      // If user has a mapping, only show their mapped agents
      let filteredAgents = [];
      
      if (userFirstName && AGENT_BRAND_MAPPING[userFirstName]) {
        // User is mapped (e.g., Richard -> Victor)
        // Show only: user's 50STARS agent + mapped PROLANE agent
        const mappedAgent = AGENT_BRAND_MAPPING[userFirstName];
        const user50STARS = agents50STARS.find(a => a.firstName === userFirstName);
        const mappedPROLANE = agentsPROLANE.find(a => a.firstName === mappedAgent);
        
        if (user50STARS) filteredAgents.push({ ...user50STARS, brand: "50STARS" });
        if (mappedPROLANE) filteredAgents.push({ ...mappedPROLANE, brand: "PROLANE" });
      } else {
        // No mapping or user not in mapping - show all agents from both brands
        filteredAgents = [
          ...agents50STARS.map(a => ({ ...a, brand: "50STARS" })),
          ...agentsPROLANE.map(a => ({ ...a, brand: "PROLANE" })),
        ];
      }

      res.json(filteredAgents);
    } catch (err) {
      console.error("GET /api/lead-notes/sales-agents failed:", err);
      res
        .status(500)
        .json({ message: "Failed to fetch sales agents", error: err.message });
    }
  }
);

export default router;

