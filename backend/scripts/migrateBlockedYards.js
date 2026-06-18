import mongoose from "mongoose";
import dotenv from "dotenv";
import BlockedYard from "../models/BlockedYard.js";
import { seedBlockedYardsFromFile } from "../services/blockedYardService.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/spotops";

async function dropLegacyIndex() {
  const collection = BlockedYard.collection;
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.name === "yardName_1") {
      await collection.dropIndex("yardName_1");
      console.log("Dropped legacy index: yardName_1");
    }
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const before = await BlockedYard.countDocuments();
  const withCityBefore = await BlockedYard.countDocuments({
    city: { $exists: true, $ne: "" },
  });
  console.log("Before migration:", { total: before, withCity: withCityBefore });

  await dropLegacyIndex();
  await BlockedYard.deleteMany({});
  console.log("Cleared old blocked yard rows");

  await BlockedYard.syncIndexes();
  console.log("Synced indexes");

  const result = await seedBlockedYardsFromFile();
  const total = await BlockedYard.countDocuments({ active: true });
  const withCity = await BlockedYard.countDocuments({
    active: true,
    city: { $exists: true, $ne: "" },
  });
  const sample = await BlockedYard.findOne({ yardName: "Ace Auto Wreckers" })
    .select("yardName city state zipcode street phone locationKey")
    .lean();

  console.log("Seed result:", result);
  console.log("After migration:", { total, withCity });
  console.log("Sample row:", sample);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
