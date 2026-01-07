import mongoose from "mongoose";
import dotenv from "dotenv";
import Lead from "../models/Lead.js";
import GmailMessage from "../models/GmailMessage.js";
import { getGmailClient } from "../services/googleAuth.js";

dotenv.config();

// Extract HTML from Gmail API payload
function extractHtmlFromPayload(payload) {
  if (!payload) return "";
  
  // Recursively find HTML part
  function findHtmlPart(part) {
    if (!part) return null;
    
    if (part.mimeType === "text/html" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    
    if (part.parts) {
      for (const p of part.parts) {
        const found = findHtmlPart(p);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  return findHtmlPart(payload) || "";
}

// Extract structured fields from email body HTML (name, email, phone, year, make, model, part required)
function extractStructuredFields(html) {
  if (!html) return {};
  
  const fields = {};
  
  // Remove HTML tags for text extraction, decode HTML entities
  let textContent = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // Decode common HTML entities
  textContent = textContent.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  
  // Clean up common patterns that might interfere
  textContent = textContent.replace(/@media[^}]*}/g, ""); // Remove CSS media queries
  
  // Patterns to extract fields - stop at next field label or ending phrase
  const patterns = {
    // Name: stop at Email, Phone, Year, etc.
    name: /(?:Name|Full Name|Customer Name)[\s:]+([^:]*?)(?=\s*(?:Email|Phone|Phone Number|Year|Make|Model|Part|Good Luck|©|50 Stars)|$)/i,
    // Email: extract email address, stop at Phone, Year, etc.
    email: /(?:Email|Email Address)[\s:]+([^\s:<>]+@[^\s:<>]+(?:\.[^\s:<>]+)*)(?=\s*(?:Phone|Phone Number|Year|Make|Model|Part|Good Luck|©|50 Stars)|$)/i,
    // Phone: stop at Year, Make, Model, etc.
    phone: /(?:Phone|Telephone|Phone Number)[\s:]+([+\d\s\-()]+?)(?=\s*(?:Year|Make|Model|Part|Email|Good Luck|©|50 Stars)|$)/i,
    // Year: 4 digits, stop at Make, Model, etc.
    year: /(?:Year)[\s:]+(\d{4})(?=\s*(?:Make|Model|Part|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    // Make & Model: stop at Part Required, Part, etc.
    makeAndModel: /(?:Make\s*[&]?\s*Model|Make and Model)[\s:]+([^:]*?)(?=\s*(?:Part Required|Part|Year|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    // Make: stop at Model, Part, etc.
    make: /(?:^|\s)(?:Make)[\s:]+([^:&]*?)(?=\s*(?:Model|Part|Year|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    // Model: stop at Part, Year, etc.
    model: /(?:^|\s)(?:Model)[\s:]+([^:]*?)(?=\s*(?:Part|Year|Make|Email|Phone|Good Luck|©|50 Stars)|$)/i,
    // Part Required: stop at Offer, Good Luck, ©, 50 Stars
    partRequired: /(?:Part Required|Part Needed)[\s:]+([^:]*?)(?=\s*(?:Offer|Offer Selected|Good Luck|©|50 Stars|@media)|$)/i,
  };
  
  // Try to extract each field using patterns
  for (const [key, pattern] of Object.entries(patterns)) {
    // For partRequired, find ALL matches and use the LAST one (to avoid email header)
    if (key === "partRequired") {
      const allMatches = [...textContent.matchAll(new RegExp(pattern.source, pattern.flags + "g"))];
      if (allMatches.length > 0) {
        // Use the last match (most likely the actual field in the email body)
        const match = allMatches[allMatches.length - 1];
        if (match && match[1]) {
          let value = match[1].trim();
          // Stop at common ending phrases
          const endPhrases = ["Offer", "Offer Selected", "Good Luck", "©", "50 Stars", "Auto Parts", "@media"];
          for (const phrase of endPhrases) {
            const idx = value.toLowerCase().indexOf(phrase.toLowerCase());
            if (idx > 0) {
              value = value.substring(0, idx).trim();
            }
          }
          // Remove trailing punctuation and extra spaces
          value = value.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
          // Additional cleanup: remove anything that looks like it's part of the email header
          // (e.g., "s 50 Stars Auto Parts - New Lead")
          if (value.toLowerCase().includes("50 stars auto parts") || value.toLowerCase().includes("new lead")) {
            // Try to extract just the part name after the last "Part Required:" in the value itself
            const lastPartRequired = value.toLowerCase().lastIndexOf("part required:");
            if (lastPartRequired > 0) {
              value = value.substring(lastPartRequired + "part required:".length).trim();
            }
            // If it still contains email header text, try to find the actual part
            const actualPartMatch = value.match(/([^:]+?)(?:\s*(?:Email|Phone|Year|Make|Model|Offer|Good Luck|©|50 Stars))/i);
            if (actualPartMatch) {
              value = actualPartMatch[1].trim();
            }
          }
          if (value) {
            fields[key] = value;
          }
        }
      }
    } else {
      // For other fields, use first match as before
      const match = textContent.match(pattern);
      if (match && match[1]) {
        // Clean up the extracted value - remove extra spaces and stop at common ending phrases
        let value = match[1].trim();
        // Stop at common ending phrases
        const endPhrases = ["Offer", "Offer Selected", "Good Luck", "©", "50 Stars", "Auto Parts", "@media"];
        for (const phrase of endPhrases) {
          const idx = value.toLowerCase().indexOf(phrase.toLowerCase());
          if (idx > 0) {
            value = value.substring(0, idx).trim();
          }
        }
        // Remove trailing punctuation and extra spaces
        value = value.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
        if (value) {
          fields[key] = value;
        }
      }
    }
  }
  
  // Handle "Make & Model" - split into make and model if not already extracted separately
  if (fields.makeAndModel && !fields.make && !fields.model) {
    // Try to split "AMC AMX" into make="AMC" and model="AMX"
    const parts = fields.makeAndModel.trim().split(/\s+/);
    if (parts.length >= 2) {
      fields.make = parts[0]; // First word is make
      fields.model = parts.slice(1).join(" "); // Rest is model
    } else {
      // If only one word, use it as make
      fields.make = fields.makeAndModel;
    }
    delete fields.makeAndModel; // Remove the combined field
  }
  
  // Helper function to clean extracted values
  function cleanFieldValue(value) {
    if (!value) return "";
    let cleaned = value.trim();
    // Decode HTML entities
    cleaned = cleaned.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    // Stop at common ending phrases
    const endPhrases = ["Offer", "Offer Selected", "Good Luck", "©", "50 Stars", "Auto Parts", "@media", "Email", "Phone", "Year", "Make", "Model", "Part Required", "Part"];
    for (const phrase of endPhrases) {
      const idx = cleaned.toLowerCase().indexOf(phrase.toLowerCase());
      if (idx > 0) {
        cleaned = cleaned.substring(0, idx).trim();
      }
    }
    // Remove trailing punctuation and extra spaces
    cleaned = cleaned.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
    return cleaned;
  }
  
  // Clean all extracted fields
  for (const key in fields) {
    if (fields[key]) {
      fields[key] = cleanFieldValue(fields[key]);
    }
  }
  
  return fields;
}

// Main script
async function reparseLeads() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run") || args.includes("-d");
    const all = args.includes("--all") || args.includes("-a");
    const limitArg = args.find(arg => arg.startsWith("--limit=") || arg.startsWith("-l="));
    const limit = limitArg ? parseInt(limitArg.split("=")[1]) || 100 : 100;
    
    console.log("=".repeat(80));
    console.log("Lead Re-parsing Script");
    console.log("=".repeat(80));
    console.log(`Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE (will update database)"}`);
    console.log(`Scope: ${all ? "ALL leads" : "Only leads with incorrectly formatted fields"}`);
    console.log(`Limit: ${limit} leads`);
    console.log("=".repeat(80));
    console.log();
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected\n");
    
    // Get Gmail client (will be needed if we need to fetch missing bodyHtml)
    let gmail = null;
    try {
      gmail = await getGmailClient();
      console.log("✅ Gmail client initialized\n");
    } catch (gmailErr) {
      console.log("⚠️  Warning: Could not initialize Gmail client. Will only use cached bodyHtml.\n");
    }
    
    // Find leads that need re-parsing
    let leads;
    if (all) {
      // Re-parse ALL leads
      leads = await Lead.find({})
        .sort({ claimedAt: -1 })
        .limit(limit)
        .lean();
      console.log(`📋 Found ${leads.length} leads to process (processing all)\n`);
    } else {
      // Only re-parse leads with incorrectly formatted fields
      leads = await Lead.find({
        $or: [
          { name: { $regex: /Email|Phone|Year|Make|Model|Part Required/i } },
          { partRequired: { $regex: /Good Luck|©|50 Stars|@media/i } },
          { email: { $exists: true, $regex: /Phone|Year|Make|Model|Part/i } },
          // Also include leads that might not have email field yet (for schema update)
          { email: { $exists: false }, name: { $exists: true, $ne: "" } },
        ]
      })
      .limit(limit)
      .lean();
      console.log(`📋 Found ${leads.length} leads with incorrectly formatted fields\n`);
    }
    
    if (leads.length === 0) {
      console.log("✅ No leads need re-parsing!\n");
      await mongoose.disconnect();
      process.exit(0);
    }
    
    const results = {
      total: leads.length,
      updated: 0,
      skipped: 0,
      errors: 0,
    };
    
    console.log("Processing leads...\n");
    console.log("=".repeat(80));
    
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const progress = `[${i + 1}/${leads.length}]`;
      
      try {
        // Get bodyHtml from GmailMessage
        let bodyHtml = null;
        const gmailMsg = await GmailMessage.findOne({ messageId: lead.messageId }).lean();
        
        if (gmailMsg?.bodyHtml) {
          bodyHtml = gmailMsg.bodyHtml;
        } else if (gmail) {
          // Try to fetch from Gmail API if not in GmailMessage
          try {
            const fullMessage = await gmail.users.messages.get({
              userId: "me",
              id: lead.messageId,
              format: "full",
            });
            bodyHtml = extractHtmlFromPayload(fullMessage.data.payload);
            // Optionally save bodyHtml to GmailMessage for future use
            if (bodyHtml && gmailMsg) {
              await GmailMessage.findByIdAndUpdate(gmailMsg._id, { bodyHtml });
            }
          } catch (fetchErr) {
            console.log(`${progress} ❌ ${lead.messageId}: Failed to fetch bodyHtml - ${fetchErr.message}`);
            results.skipped++;
            continue;
          }
        } else {
          console.log(`${progress} ⏭️  ${lead.messageId}: No bodyHtml found and Gmail client unavailable`);
          results.skipped++;
          continue;
        }
        
        if (!bodyHtml) {
          console.log(`${progress} ⏭️  ${lead.messageId}: No bodyHtml available`);
          results.skipped++;
          continue;
        }
        
        // Re-parse the fields
        const parsedFields = extractStructuredFields(bodyHtml);
        
        // Update the lead
        const updateData = {
          name: parsedFields.name || lead.name || "",
          email: parsedFields.email || lead.email || "",
          phone: parsedFields.phone || lead.phone || "",
          year: parsedFields.year || lead.year || "",
          make: parsedFields.make || lead.make || "",
          model: parsedFields.model || lead.model || "",
          partRequired: parsedFields.partRequired || lead.partRequired || "",
        };
        
        // Check if any fields actually changed
        const changed = Object.keys(updateData).some(key => {
          const oldVal = (lead[key] || "").trim();
          const newVal = (updateData[key] || "").trim();
          return oldVal !== newVal;
        });
        
        if (changed) {
          if (!dryRun) {
            await Lead.findOneAndUpdate(
              { _id: lead._id },
              { $set: updateData },
              { new: true }
            );
          }
          
          results.updated++;
          console.log(`${progress} ${dryRun ? "🔍 [DRY RUN]" : "✅"} ${lead.messageId}:`);
          
          // Show key changes
          const changes = [];
          if ((lead.name || "").trim() !== (updateData.name || "").trim()) {
            changes.push(`name: "${lead.name}" → "${updateData.name}"`);
          }
          if ((lead.email || "").trim() !== (updateData.email || "").trim()) {
            changes.push(`email: "${lead.email}" → "${updateData.email}"`);
          }
          if ((lead.partRequired || "").trim() !== (updateData.partRequired || "").trim()) {
            const oldPart = (lead.partRequired || "").substring(0, 50);
            const newPart = (updateData.partRequired || "").substring(0, 50);
            changes.push(`partRequired: "${oldPart}..." → "${newPart}..."`);
          }
          
          if (changes.length > 0) {
            changes.forEach(change => console.log(`   ${change}`));
          }
          console.log();
        } else {
          results.skipped++;
          console.log(`${progress} ⏭️  ${lead.messageId}: No changes needed\n`);
        }
      } catch (err) {
        console.error(`${progress} ❌ ${lead.messageId}: Error - ${err.message}\n`);
        results.errors++;
      }
    }
    
    console.log("=".repeat(80));
    console.log();
    console.log("📊 Summary:");
    console.log(`   Total processed: ${results.total}`);
    console.log(`   ${dryRun ? "Would update" : "Updated"}: ${results.updated}`);
    console.log(`   Skipped: ${results.skipped}`);
    console.log(`   Errors: ${results.errors}`);
    console.log();
    
    if (dryRun) {
      console.log("⚠️  This was a DRY RUN. No changes were made to the database.");
      console.log("   Run without --dry-run to apply changes.\n");
    } else {
      console.log("✅ Re-parsing complete!\n");
    }
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (err) {
    console.error("\n❌ Fatal error:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
reparseLeads();

