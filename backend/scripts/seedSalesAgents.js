// Script to seed initial sales agents data for both brands
// Run with: node scripts/seedSalesAgents.js (from backend directory)
// Or: node backend/scripts/seedSalesAgents.js (from project root)

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import SalesAgent from "../models/SalesAgent.js";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory (parent of scripts directory)
dotenv.config({ path: join(__dirname, "..", ".env") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI not found in environment variables");
  process.exit(1);
}

const agents50STARS = [
  { firstName: "Dipsikha", fullName: "Dipsikha Pradhan" },
  { firstName: "David", fullName: "David William" },
  { firstName: "Richard", fullName: "Richard Parker" },
  { firstName: "Mark", fullName: "Mark Becker" },
  { firstName: "Michael", fullName: "Michael Turner" },
  { firstName: "Nik", fullName: "Nik Louis" },
  { firstName: "John", fullName: "John Christopher" },
  { firstName: "Tristan", fullName: "Tristan Brown" },
  { firstName: "Tony", fullName: "Tony" },
];

const agentsPROLANE = [
  { firstName: "Charlie", fullName: "Charlie Miller" },
  { firstName: "Sam", fullName: "Sam Murphy" },
  { firstName: "Steve", fullName: "Steve Burnette" },
  { firstName: "Victor", fullName: "Victor Collins" },
  { firstName: "Dipsikha", fullName: "Dipsikha Pradhan" },
];

async function seedSalesAgents() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    console.log("Seeding 50STARS sales agents...");
    for (const agent of agents50STARS) {
      await SalesAgent.findOneAndUpdate(
        { firstName: agent.firstName, brand: "50STARS" },
        {
          firstName: agent.firstName,
          fullName: agent.fullName,
          brand: "50STARS",
        },
        { upsert: true, new: true }
      );
      console.log(`  ✓ ${agent.firstName} -> ${agent.fullName}`);
    }

    console.log("Seeding PROLANE sales agents...");
    for (const agent of agentsPROLANE) {
      await SalesAgent.findOneAndUpdate(
        { firstName: agent.firstName, brand: "PROLANE" },
        {
          firstName: agent.firstName,
          fullName: agent.fullName,
          brand: "PROLANE",
        },
        { upsert: true, new: true }
      );
      console.log(`  ✓ ${agent.firstName} -> ${agent.fullName}`);
    }

    console.log("\n✅ Sales agents seeded successfully!");
    console.log(`   - 50STARS: ${agents50STARS.length} agents`);
    console.log(`   - PROLANE: ${agentsPROLANE.length} agents`);

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding sales agents:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedSalesAgents();
