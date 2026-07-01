/**
 * Clear all Gmail/lead data stored for the Leads page.
 * Run: node scripts/clearLeadsCollections.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import GmailMessage from "../models/GmailMessage.js";
import Lead from "../models/Lead.js";
import LeadForOrders from "../models/LeadForOrders.js";
import LeadNote from "../models/LeadNote.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/spotops";

async function main() {
  await mongoose.connect(MONGODB_URI);

  const [gmailMessages, leadsModel, leadForOrders, leadNotes] = await Promise.all([
    GmailMessage.deleteMany({}),
    Lead.deleteMany({}),
    LeadForOrders.deleteMany({}),
    LeadNote.deleteMany({}),
  ]);

  console.log("Cleared lead-related collections:", {
    gmailMessages: gmailMessages.deletedCount,
    leadsClaimed: leadsModel.deletedCount,
    leadsCollection: leadForOrders.deletedCount,
    leadNotes: leadNotes.deletedCount,
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
