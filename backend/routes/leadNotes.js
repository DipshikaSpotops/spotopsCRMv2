import express from "express";
import moment from "moment-timezone";
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

// Dallas (America/Chicago) day range helper
function getDallasDayRange() {
  const now = moment.tz("America/Chicago");
  const start = now.clone().startOf("day").toDate();
  const end = now.clone().endOf("day").toDate();
  return { now, start, end };
}

// Generate next lead number for a given user, brand, and Dallas day
async function generateLeadNo(req, brand) {
  const createdBy = req.user?.id || "Unknown";
  const { now, start, end } = getDallasDayRange();

  // Use LeadNote (leadnotes collection) as the primary source for numbering
  const count = await LeadNote.countDocuments({
    createdBy,
    brand,
    createdAt: { $gte: start, $lte: end },
  });

  const index = (count || 0) + 1;
  const dateLabel = now.format("Do MMM"); // e.g. "27th Feb"
  const indexStr = String(index).padStart(2, "0"); // 01, 02, ...
  const brandCode = brand === "PROLANE" ? "PAP" : "50SAP";
  return `${dateLabel}, ${brandCode} - ${indexStr}`;
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
        phoneNo,
        year,
        make,
        model,
        partRequired,
        partDescription,
        vinNo,
        partNo,
        warranty,
        warrantyField,
        leadNo,
        leadStatus,
        comments,
        brand: selectedBrand,
        salesAgent: selectedSalesAgent,
        leadOrigin,
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

      if (!leadOrigin || !String(leadOrigin).trim()) {
        return res.status(400).json({
          message: "Lead Origin is required",
        });
      }

      // Determine / generate Lead No for today (per user, brand, Dallas date)
      let finalLeadNo = (leadNo || "").trim();
      if (!finalLeadNo) {
        finalLeadNo = await generateLeadNo(req, brand);
      }

      // Dallas datetime for lead (same timezone idea as AddOrder)
      const central = moment.tz("America/Chicago");
      const leadDate = central.toDate();
      const leadDateDisplay = central.format("D MMM, YYYY HH:mm");

      // Generate a unique messageId for this lead (to avoid duplicate key error on existing index)
      const messageId = `lead-${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${createdBy}`;

      // Save to ordersDb Leads collection (primary storage)
      const leadForOrders = await LeadForOrders.create({
        name: name || "",
        email: email || "",
        phoneNo: phoneNo || "",
        year: year || "",
        make: make || "",
        model: model || "",
        partRequired: partRequired || "",
        partDescription: partDescription || "",
        vinNo: vinNo || "",
        partNo: partNo || "",
        warranty: warranty || "",
        warrantyField: warrantyField || "days",
        leadDate,
        leadDateDisplay,
        leadNo: finalLeadNo,
        leadOrigin: leadOrigin || "",
        leadStatus: leadStatus || "",
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
          phoneNo: phoneNo || "",
          year: year || "",
          make: make || "",
          model: model || "",
          partRequired: partRequired || "",
          partDescription: partDescription || "",
          vinNo: vinNo || "",
          partNo: partNo || "",
          warranty: warranty || "",
          warrantyField: warrantyField || "days",
          leadDate,
          leadDateDisplay,
          leadNo: finalLeadNo,
          leadOrigin: leadOrigin || "",
          leadStatus: leadStatus || "",
          comments: comments || "",
          brand,
          salesAgent: salesAgent.trim(),
          createdBy,
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

// Update an existing lead (only creator can edit)
router.put(
  "/:id",
  requireAuth,
  async (req, res) => {
    try {
      if (!isLeadNotesAuthorized(req)) {
        return res
          .status(403)
          .json({ message: "Access denied. Sales/Admin or authorized email required." });
      }

      const leadId = req.params.id;
      const userId = req.user?.id || "Unknown";

      const lead = await LeadForOrders.findById(leadId);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      if (String(lead.createdBy) !== String(userId)) {
        return res.status(403).json({ message: "You can edit only leads you created" });
      }

      const updatableFields = [
        "name",
        "email",
        "phoneNo",
        "year",
        "make",
        "model",
        "partRequired",
        "partDescription",
        "vinNo",
        "partNo",
        "warranty",
        "warrantyField",
        "leadNo",
        "leadOrigin",
        "leadStatus",
        "comments",
        "brand",
        "salesAgent",
      ];

      updatableFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) {
          lead[field] = req.body[field] ?? "";
        }
      });

      if (!lead.leadOrigin || !String(lead.leadOrigin).trim()) {
        return res.status(400).json({ message: "Lead Origin is required" });
      }

      await lead.save();

      // Best-effort sync to LeadNote collection so leadStatus (and other edits) are reflected there too.
      // We don't have a direct reference to the LeadNote _id, so we match by leadNo + brand + salesAgent.
      try {
        await LeadNote.findOneAndUpdate(
          {
            leadNo: lead.leadNo || "",
            brand: lead.brand,
            salesAgent: lead.salesAgent,
          },
          {
            name: lead.name,
            email: lead.email,
            year: lead.year,
            make: lead.make,
            model: lead.model,
            partRequired: lead.partRequired,
            partDescription: lead.partDescription,
            vinNo: lead.vinNo,
            partNo: lead.partNo,
            warranty: lead.warranty,
            warrantyField: lead.warrantyField,
            leadDate: lead.leadDate,
            leadDateDisplay: lead.leadDateDisplay,
            leadNo: lead.leadNo,
            leadOrigin: lead.leadOrigin,
            leadStatus: lead.leadStatus,
            comments: lead.comments,
            brand: lead.brand,
            salesAgent: lead.salesAgent,
          },
          { new: true }
        );
      } catch (syncErr) {
        console.warn("[leadNotes] Failed to sync LeadNote on update:", syncErr.message);
      }

      res.json(lead.toObject());
    } catch (err) {
      console.error("PUT /api/lead-notes/:id failed:", err);
      res.status(500).json({
        message: "Failed to update lead note",
        error: err.message,
      });
    }
  }
);

// Get next Lead No for the logged-in user for today and brand
router.get(
  "/next-number",
  requireAuth,
  async (req, res) => {
    try {
      if (!isLeadNotesAuthorized(req)) {
        return res
          .status(403)
          .json({ message: "Access denied. Sales/Admin or authorized email required." });
      }

      const requestedBrand = (req.query.brand || "").trim().toUpperCase();
      const brand = requestedBrand === "PROLANE" || requestedBrand === "50STARS"
        ? requestedBrand
        : getBrand(req);

      const leadNo = await generateLeadNo(req, brand);
      res.json({ leadNo, brand });
    } catch (err) {
      console.error("GET /api/lead-notes/next-number failed:", err);
      res.status(500).json({
        message: "Failed to get next lead number",
        error: err.message,
      });
    }
  }
);

// Get current user's lead notes (filtered by salesAgent mapping)
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

      // Get logged-in user's firstName
      const userFirstName = (req.user?.firstName || "").trim();
      
      console.log(`[leadNotes/my] User firstName: "${userFirstName}"`);
      
      if (!userFirstName) {
        // If no firstName, return empty array
        console.log(`[leadNotes/my] No firstName found, returning empty array`);
        return res.json([]);
      }
      
      // Build query - filter by salesAgent (user's firstName and mapped agent if exists)
      // Use case-insensitive regex pattern like in monthlyOrders.js
      const salesAgentPatterns = [];
      
      // Pattern for user's firstName (matches exact or full name starting with firstName)
      const escapedFirstName = userFirstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern1 = `^${escapedFirstName}(?:\\s.*|$)`;
      salesAgentPatterns.push(new RegExp(pattern1, 'i'));
      
      // If user has a mapping, include the mapped agent's leads too
      if (AGENT_BRAND_MAPPING[userFirstName]) {
        const mappedAgent = AGENT_BRAND_MAPPING[userFirstName];
        const escapedMappedName = mappedAgent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern2 = `^${escapedMappedName}(?:\\s.*|$)`;
        salesAgentPatterns.push(new RegExp(pattern2, 'i'));
        console.log(`[leadNotes/my] User "${userFirstName}" mapped to "${mappedAgent}", patterns: ["${pattern1}", "${pattern2}"]`);
      } else {
        console.log(`[leadNotes/my] User "${userFirstName}" has no mapping, pattern: ["${pattern1}"]`);
      }
      
      const query = {
        salesAgent: { $in: salesAgentPatterns }
      };
      
      // Handle date filtering (start/end are UTC ISO strings from UnifiedDatePicker)
      if (req.query.start && req.query.end) {
        query.createdAt = {
          $gte: new Date(req.query.start),
          $lte: new Date(req.query.end),
        };
        console.log(`[leadNotes/my] Date filter: ${req.query.start} to ${req.query.end}`);
      } else {
        console.log(`[leadNotes/my] No date filter applied`);
      }

      console.log(`[leadNotes/my] Query:`, JSON.stringify(query, null, 2));

      // Fetch from ordersDb Leads collection
      const notes = await LeadForOrders.find(query)
        .sort({ createdAt: -1 })
        .lean();

      console.log(`[leadNotes/my] Found ${notes.length} leads`);

      res.json(notes);
    } catch (err) {
      console.error("GET /api/lead-notes/my failed:", err);
      res
        .status(500)
        .json({ message: "Failed to fetch lead notes", error: err.message });
    }
  }
);

// Get all lead notes (all users, filtered by date range only)
router.get(
  "/all",
  requireAuth,
  async (req, res) => {
    try {
      if (!isLeadNotesAuthorized(req)) {
        return res
          .status(403)
          .json({ message: "Access denied. Sales/Admin or authorized email required." });
      }

      // Build query - show all leads (not filtered by createdBy)
      const query = {};
      
      // Handle date filtering (start/end are UTC ISO strings from UnifiedDatePicker)
      if (req.query.start && req.query.end) {
        query.createdAt = {
          $gte: new Date(req.query.start),
          $lte: new Date(req.query.end),
        };
        console.log(`[leadNotes/all] Date filter: ${req.query.start} to ${req.query.end}`);
      } else {
        console.log(`[leadNotes/all] No date filter applied`);
      }

      console.log(`[leadNotes/all] Query:`, JSON.stringify(query, null, 2));

      // Fetch from ordersDb Leads collection
      const notes = await LeadForOrders.find(query)
        .sort({ createdAt: -1 })
        .lean();

      console.log(`[leadNotes/all] Found ${notes.length} leads`);

      res.json(notes);
    } catch (err) {
      console.error("GET /api/lead-notes/all failed:", err);
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

