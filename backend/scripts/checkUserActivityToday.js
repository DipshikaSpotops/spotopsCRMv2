import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "../models/Order.js";
import moment from "moment-timezone";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
console.log("MongoDB connected\n");

// Get today's date in the format used in the system (D MMM, YYYY)
const today = moment().tz("America/Chicago");
const todayDateStr = today.format("D MMM"); // e.g., "7 Jan"
const todayDateStrAlt = today.format("MMM D"); // e.g., "Jan 7"
const todayYear = today.format("YYYY"); // e.g., "2026"

const users = ["Hazel", "Ginny"];

// Function to check if a string contains today's date
const containsToday = (str) => {
  if (!str) return false;
  const lower = str.toLowerCase();
  // Check for "D MMM" or "MMM D" format, and also check if it contains the current year
  return (lower.includes(todayDateStr.toLowerCase()) || 
          lower.includes(todayDateStrAlt.toLowerCase())) &&
         lower.includes(todayYear);
};

// Function to check if a string contains any of the target users
const containsUser = (str) => {
  if (!str) return false;
  const lower = str.toLowerCase();
  return users.some(user => lower.includes(user.toLowerCase()));
};

// Function to extract relevant entries from arrays
const filterRelevantEntries = (arr, source) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((entry, idx) => {
      const entryStr = typeof entry === 'string' ? entry : JSON.stringify(entry);
      if (containsUser(entryStr) && containsToday(entryStr)) {
        return { index: idx, content: entryStr, source };
      }
      return null;
    })
    .filter(Boolean);
};

console.log(`Searching for activities by ${users.join(" and ")} on ${today.format("D MMM, YYYY")}...\n`);
console.log("=".repeat(80));

const allOrders = await Order.find({}).lean();
let foundCount = 0;

for (const order of allOrders) {
  const relevantEntries = [];
  
  // Check orderHistory
  if (order.orderHistory && Array.isArray(order.orderHistory)) {
    const historyEntries = filterRelevantEntries(order.orderHistory, "orderHistory");
    if (historyEntries.length > 0) {
      relevantEntries.push(...historyEntries);
    }
  }
  
  // Check additionalInfo[].notes
  if (order.additionalInfo && Array.isArray(order.additionalInfo)) {
    order.additionalInfo.forEach((info, idx) => {
      if (info.notes && Array.isArray(info.notes)) {
        const notesEntries = filterRelevantEntries(
          info.notes, 
          `additionalInfo[${idx}].notes`
        );
        if (notesEntries.length > 0) {
          relevantEntries.push(...notesEntries);
        }
      }
    });
  }
  
  // Check supportNotes
  if (order.supportNotes && Array.isArray(order.supportNotes)) {
    const supportEntries = filterRelevantEntries(order.supportNotes, "supportNotes");
    if (supportEntries.length > 0) {
      relevantEntries.push(...supportEntries);
    }
  }
  
  // If we found relevant entries, display them
  if (relevantEntries.length > 0) {
    foundCount++;
    console.log(`\n📦 Order: ${order.orderNo}`);
    console.log(`   Customer: ${order.customerName || `${order.fName || ''} ${order.lName || ''}`.trim() || 'N/A'}`);
    console.log(`   Sales Agent: ${order.salesAgent || 'N/A'}`);
    console.log(`   Order Date: ${order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A'}`);
    console.log(`   Status: ${order.orderStatus || 'N/A'}`);
    console.log(`   ─`.repeat(40));
    
    relevantEntries.forEach((entry, idx) => {
      console.log(`\n   [${entry.source}] Entry #${entry.index + 1}:`);
      console.log(`   ${entry.content}`);
    });
    
    console.log("\n" + "=".repeat(80));
  }
}

console.log(`\n✅ Search complete! Found ${foundCount} order(s) with relevant activity.\n`);

await mongoose.disconnect();
process.exit(0);

