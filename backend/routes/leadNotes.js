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
// Helper: check if user is allowed to access lead-notes routes
function isLeadNotesAuthorized(req) {
  const role = req.user?.role;
  const email = (req.user?.email || "").toLowerCase();
  if (role === "Sales" || role === "Admin") return true;
  if (email === "50starsauto110@gmail.com") return true;
  return false;
}

router.post(
  "/",
  requireAuth,
  async (req, res) => {
    try {
      if (!isLeadNotesAuthorized(req)) {
        return res
          .status(403)
          .json({ message: "Access denied. Sales/Admin or authorized email required." });
      }
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

      // Validate required fields
      if (!brand || (brand !== "50STARS" && brand !== "PROLANE")) {
        return res.status(400).json({
          message: "Brand is required and must be either '50STARS' or 'PROLANE'",
        });
      }

      if (!salesAgent || salesAgent.trim() === "" || salesAgent === "Unknown") {
        return res.status(400).json({
          message: "Sales Agent is required",
        });
      }

      // Generate a unique messageId for this lead (to avoid duplicate key error on existing index)
      const messageId = `lead-${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${createdBy}`;

      // Save to ordersDb Leads collection (primary storage)
      const leadForOrders = await LeadForOrders.create({
        name: name || "",
        email: email || "",
        year: year || "",
        make: make || "",
        model: model || "",
        partRequired: partRequired || "",
        partDescription: partDescription || "",
        vinNo: vinNo || "",
        partNo: partNo || "",
        warranty: warranty || "",
        warrantyField: warrantyField || "days",
        comments: comments || "",
        brand,
        salesAgent: salesAgent.trim(),
        createdBy,
        messageId, // Add unique messageId to satisfy existing index
      });

      // Optionally save to LeadNote collection (non-critical, continue even if it fails)
      let note = null;
      try {
        note = await LeadNote.create({
          name: name || "",
          email: email || "",
          year: year || "",
          make: make || "",
          model: model || "",
          partRequired: partRequired || "",
          partDescription: partDescription || "",
          vinNo: vinNo || "",
          partNo: partNo || "",
          warranty: warranty || "",
          warrantyField: warrantyField || "days",
          comments: comments || "",
          brand,
          salesAgent: salesAgent.trim(),
        });
      } catch (noteErr) {
        // Log but don't fail - LeadForOrders is the primary storage
        console.warn("Failed to save to LeadNote collection (non-critical):", noteErr.message);
      }

      res.status(201).json({ 
        ...leadForOrders.toObject(),
        _leadNoteId: note?._id || null,
      });
    } catch (err) {
      console.error("POST /api/lead-notes failed:", err);
      res.status(500).json({
        message: `Failed to create lead note: ${err.message}`,
        error: err.message,
      });
    }
  }
);

// Get current user's lead notes (all brands, filtered by createdBy)
router.get(
  "/my",
  requireAuth,
  async (req, res) => {
    try {
      if (!isLeadNotesAuthorized(req)) {
        return res
          .status(403)
          .json({ message: "Access denied. Sales/Admin or authorized email required." });
      }
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
  async (req, res) => {
    try {
      if (!isLeadNotesAuthorized(req)) {
        return res
          .status(403)
          .json({ message: "Access denied. Sales/Admin or authorized email required." });
      }
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

