import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "../models/Order.js";
import Yards from "../models/Yards.js";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
console.log("MongoDB connected");

const seen = new Map();
const normalizeName = (name) =>
  (name || "").toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();

const orders = await Order.find({});
for (const order of orders) {
  for (const info of order.additionalInfo || []) {
    const norm = normalizeName(info.yardName);
    if (!norm) continue;

    if (!seen.has(norm)) {
      seen.set(norm, {
        yardName: info.yardName?.trim(),
        yardRating: info.yardRating || "",
        phone: info.phone || "",
        altNo: info.altNo || "",
        email: info.email || "",
        street: info.street || "",
        city: info.city || "",
        state: info.state || "",
        zipcode: info.zipcode || "",
        country: info.country || "US"
      });
    }
  }
}

for (const yard of seen.values()) {
  const res = await Yards.updateOne(
    { yardName: yard.yardName },
    { $set: yard },
    { upsert: true }
  );

  if (res.matchedCount === 0 && res.upsertedCount === 1) {
    console.log(`✅ Inserted new yard: ${yard.yardName}`);
  } else if (res.matchedCount === 1 && res.modifiedCount === 1) {
    console.log(`♻️ Updated yard: ${yard.yardName}`);
  } else {
    console.log(`⚪ No changes for yard: ${yard.yardName}`);
  }
}

console.log("Migration complete");
process.exit();
