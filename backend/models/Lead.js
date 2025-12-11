import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    // Gmail message reference
    messageId: { type: String, required: true, unique: true, index: true },
    gmailMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "GmailMessage" },
    
    // Lead information extracted from email (only these fields are saved)
    name: { type: String },
    phone: { type: String },
    year: { type: String },
    make: { type: String },
    model: { type: String },
    partRequired: { type: String },
    
    // Email details (only subject and from)
    subject: { type: String },
    from: { type: String },
    
    // Sales agent who claimed the lead
    salesAgent: { type: String, index: true }, // Sales agent's first name (from localStorage)
    claimedBy: { type: String, required: true, index: true }, // User ID
    claimedAt: { type: Date, default: Date.now, index: true },
    
    // Labels
    labels: { type: [String], default: [] },
    
    // Status
    status: {
      type: String,
      enum: ["claimed", "closed", "converted"],
      default: "claimed",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
leadSchema.index({ claimedBy: 1, claimedAt: -1 });
leadSchema.index({ status: 1, claimedAt: -1 });
leadSchema.index({ salesAgent: 1, status: 1, claimedAt: -1 }); // For querying user's closed leads

const Lead = mongoose.models.Lead || mongoose.model("Lead", leadSchema);

export default Lead;

