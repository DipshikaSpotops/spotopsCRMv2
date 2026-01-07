import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "../models/Order.js";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
console.log("MongoDB connected\n");

// Function to split customerName into fName and lName
// fName = first word, lName = rest of the words
const splitCustomerName = (customerName) => {
  if (!customerName || typeof customerName !== 'string') {
    return { fName: '', lName: '' };
  }
  
  const trimmed = customerName.trim();
  if (!trimmed) {
    return { fName: '', lName: '' };
  }
  
  // Split by first space
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    // No space found, entire name goes to fName
    return { fName: trimmed, lName: '' };
  }
  
  const fName = trimmed.substring(0, spaceIndex).trim();
  const lName = trimmed.substring(spaceIndex + 1).trim();
  
  return { fName, lName };
};

console.log("Migrating customerName to fName and lName...\n");
console.log("=".repeat(80));

// Find all orders that have customerName but need fName/lName populated
// We'll update orders where:
// 1. customerName exists and is not empty
// 2. Either fName or lName is missing/empty, OR we want to update based on customerName
const query = {
  customerName: { $exists: true, $ne: '', $ne: null }
};

const orders = await Order.find(query).lean();
let updatedCount = 0;
let skippedCount = 0;

for (const order of orders) {
  const customerName = order.customerName;
  const currentFName = order.fName || '';
  const currentLName = order.lName || '';
  
  // Split customerName
  const { fName, lName } = splitCustomerName(customerName);
  
  // Only update if we have something to set and it's different from current
  if (fName || lName) {
    const updateData = {};
    let needsUpdate = false;
    
    // Update fName if it's different
    if (fName && fName !== currentFName) {
      updateData.fName = fName;
      needsUpdate = true;
    }
    
    // Update lName if it's different
    if (lName && lName !== currentLName) {
      updateData.lName = lName;
      needsUpdate = true;
    }
    
    // Also update if current values are empty but we have new values
    if ((!currentFName && fName) || (!currentLName && lName)) {
      if (!updateData.fName && fName) updateData.fName = fName;
      if (!updateData.lName && lName) updateData.lName = lName;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await Order.updateOne(
        { _id: order._id },
        { $set: updateData }
      );
      
      updatedCount++;
      console.log(`✅ Order ${order.orderNo}:`);
      console.log(`   customerName: "${customerName}"`);
      console.log(`   → fName: "${updateData.fName || currentFName}"`);
      console.log(`   → lName: "${updateData.lName || currentLName}"`);
      console.log();
    } else {
      skippedCount++;
    }
  } else {
    skippedCount++;
  }
}

console.log("=".repeat(80));
console.log(`\n✅ Migration complete!`);
console.log(`   Updated: ${updatedCount} orders`);
console.log(`   Skipped: ${skippedCount} orders (already correct or no changes needed)\n`);

await mongoose.disconnect();
process.exit(0);

