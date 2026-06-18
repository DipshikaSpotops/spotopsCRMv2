import mongoose from "mongoose";
import BlockedYard from "../models/BlockedYard.js";
import { seedBlockedYardsFromFile } from "../services/blockedYardService.js";

const MONGODB_URI =
  process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/spotops";

async function main() {
  await mongoose.connect(MONGODB_URI);
  const result = await seedBlockedYardsFromFile();
  const total = await BlockedYard.countDocuments({ active: true });
  console.log("Blocked yards seed complete:", result);
  console.log("Active blocked yards in DB:", total);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
