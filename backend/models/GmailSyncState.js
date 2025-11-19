import mongoose from "mongoose";

const gmailSyncStateSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true, unique: true },
    historyId: { type: String },
    expiration: { type: Date },
    topicName: { type: String },
    labelIds: [{ type: String }],
    lastSyncedAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true }
);

const GmailSyncState =
  mongoose.models.GmailSyncState ||
  mongoose.model("GmailSyncState", gmailSyncStateSchema);

export default GmailSyncState;

