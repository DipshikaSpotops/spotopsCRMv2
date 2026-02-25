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
    vinNo: { type: String, trim: true },
    partNo: { type: String, trim: true },
    warranty: { type: String, trim: true },
    warrantyField: { type: String, trim: true, default: "days" },
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
  },
  {
    timestamps: true,
  }
);

leadForOrdersSchema.index({ brand: 1, salesAgent: 1, createdAt: -1 });
leadForOrdersSchema.index({ brand: 1, createdAt: -1 });

// Use the same connection as orders (ordersDb)
const LeadForOrders = mongoose.models.LeadForOrders || mongoose.model("LeadForOrders", leadForOrdersSchema, "leads");

export default LeadForOrders;
