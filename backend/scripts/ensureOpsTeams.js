/**
 * Create ops teams, remove Sales from teams, assign Support roster.
 * Never deletes existing Team documents.
 *
 * Run: node scripts/ensureOpsTeams.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { ensureOpsTeams } from "../services/ensureOpsTeams.js";
import { ensureCommonTeam } from "../routes/teams.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/spotops";

async function main() {
  await mongoose.connect(MONGODB_URI);
  await ensureCommonTeam();
  const result = await ensureOpsTeams();
  console.log("[OpsTeams] Done:", JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
