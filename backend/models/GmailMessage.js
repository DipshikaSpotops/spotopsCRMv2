import mongoose from "mongoose";

const headerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    value: { type: String, default: "" },
  },
  { _id: false }
);

const gmailMessageSchema = new mongoose.Schema(
  {
    messageId: { type: String, required: true, unique: true },
    threadId: { type: String },
    historyId: { type: String },
    internalDate: { type: Date },
    snippet: { type: String },
    subject: { type: String },
    from: { type: String },
    to: [{ type: String }],
    deliveredTo: [{ type: String }],
    agentEmail: { type: String, index: true },
    labelIds: [{ type: String }],
    headers: [headerSchema],
    payloadSizeEstimate: { type: Number },
    raw: { type: Object },
    userEmail: { type: String, index: true },
    processedAt: { type: Date },
    status: {
      type: String,
      enum: ["active", "claimed", "closed"],
      default: "active",
      index: true,
    },
    claimedBy: { type: String, default: null, index: true },
    claimedAt: { type: Date, default: null },
    labels: { type: [String], default: [] },
    bodyHtml: { type: String },
  },
  {
    timestamps: true,
  }
);

const GmailMessage =
  mongoose.models.GmailMessage ||
  mongoose.model("GmailMessage", gmailMessageSchema);

export default GmailMessage;

