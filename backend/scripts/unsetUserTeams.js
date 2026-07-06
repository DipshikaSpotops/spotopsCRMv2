/**
 * Remove team field from all users in loggedInUsers collection.
 * Run: node scripts/unsetUserTeams.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/spotops";

async function main() {
  await mongoose.connect(MONGODB_URI);

  const result = await User.updateMany({}, { $unset: { team: "" } });
  console.log("Removed team from all users:", {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
