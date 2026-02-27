import mongoose from 'mongoose';

// Lead schema for ordersDb (same database as orders)
const leadForOrdersSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    year: { type: String, trim: true },
    make: { type: String, trim: true },
    model: { type: String, trim: true },
    partRequired: { type: String, trim: true },
    partDescription: { type: String, trim: true },
    phoneNo: { type: String, trim: true },
    vinNo: { type: String, trim: true },
    partNo: { type: String, trim: true },
    warranty: { type: String, trim: true },
    warrantyField: { type: String, trim: true, default: "days" },
    leadDate: { type: Date }, // Dallas datetime when lead was created
    leadDateDisplay: { type: String, trim: true }, // Formatted Dallas datetime (for reference)
    leadNo: { type: String, trim: true },
    leadOrigin: { type: String, trim: true },
    leadStatus: { type: String, trim: true },
    comments: { type: String, trim: true },
    brand: {
      type: String,
      enum: ["50STARS", "PROLANE"],
      required: true,
      index: true,
    },
    salesAgent: {
      type: String,
      required: true,
      index: true, // firstName of sales agent
    },
    createdBy: {
      type: String,
      required: true,
      index: true, // User ID who created the lead
    },
    messageId: {
      type: String,
      sparse: true, // Sparse index - only index documents that have this field
      unique: true, // Unique when present, but allows multiple nulls
    },
  },
  {
    timestamps: true,
  }
);

leadForOrdersSchema.index({ brand: 1, salesAgent: 1, createdAt: -1 });
leadForOrdersSchema.index({ brand: 1, createdAt: -1 });
// Sparse unique index on messageId - allows multiple nulls but enforces uniqueness when present
leadForOrdersSchema.index({ messageId: 1 }, { sparse: true, unique: true });

// Use the same connection as orders (ordersDb)
const LeadForOrders = mongoose.models.LeadForOrders || mongoose.model("LeadForOrders", leadForOrdersSchema, "leads");

export default LeadForOrders;
