// login/signup/logout routes.
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import moment from "moment-timezone";
import { google } from "googleapis";
import User from "../models/User.js";
import LoggedInUser from "../models/LoggedInUser.js";
import { validateSignup } from "../middleware/validateSignup.js";
import { validateLogin } from "../middleware/validateLogin.js";
// Note: We create JWT auth directly for Sheets API (doesn't need GMAIL_IMPERSONATED_USER)

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
const TZ = "America/Chicago";

const allowedEmails = [
  "dipsikha.spotopsdigital@gmail.com",
  "contact@50starsautoparts.com"
];

// Helper function to get IP address from request
function getIpAddress(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "Unknown"
  );
}

// Helper function to get location from IP address
async function getLocationFromIP(ipAddress) {
  if (!ipAddress || ipAddress === "Unknown" || ipAddress === "::1" || ipAddress === "127.0.0.1") {
    // For localhost, try to get actual location from a public IP service
    try {
      const response = await fetch(`http://ip-api.com/json/?fields=status,message,country,regionName,city`);
      const data = await response.json();
      
      if (data.status === "success") {
        const parts = [];
        if (data.city) parts.push(data.city);
        if (data.regionName) parts.push(data.regionName);
        if (data.country) parts.push(data.country);
        
        return parts.length > 0 ? parts.join(", ") : "Local Development";
      }
    } catch (error) {
      // Fall through to return "Local Development"
    }
    return "Local Development";
  }

  try {
    // Using ip-api.com (free, no API key required for basic usage)
    const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,country,regionName,city`);
    const data = await response.json();
    
    if (data.status === "success") {
      const parts = [];
      if (data.city) parts.push(data.city);
      if (data.regionName) parts.push(data.regionName);
      if (data.country) parts.push(data.country);
      
      return parts.length > 0 ? parts.join(", ") : "Unknown";
    }
    
    return "Unknown";
  } catch (error) {
    console.warn(`[auth] Failed to get location for IP ${ipAddress}:`, error.message);
    return "Unknown";
  }
}

// Helper function to append login data to Google Sheet
async function appendLoginToGoogleSheet(user, ipAddress, userAgent) {
  console.log("[auth] ========== appendLoginToGoogleSheet START ==========");
  console.log("[auth] Called for user:", user?.email);
  console.log("[auth] IP Address:", ipAddress);
  console.log("[auth] User Agent:", userAgent);
  
  try {
    const spreadsheetId = process.env.LOGIN_TRACKING_SHEET_ID;
    
    if (!spreadsheetId) {
      console.error("[auth] ERROR: LOGIN_TRACKING_SHEET_ID not configured, skipping Google Sheet append");
      return;
    }
    
    console.log("[auth] Spreadsheet ID:", spreadsheetId);

    const loginTimeFormatted = moment().tz(TZ).format("MMMM DD, YYYY [at] hh:mm A [Dallas Time]");
    const userFullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
    
    // Get location from IP address
    const location = await getLocationFromIP(ipAddress);
    
    // Get current month and year in "Month YYYY" format based on Dallas timezone (e.g., "March 2026")
    // Always uses Dallas datetime (America/Chicago timezone)
    const now = moment().tz(TZ); // TZ = "America/Chicago" (Dallas timezone)
    const sheetName = now.format("MMMM YYYY");
    
    // Prepare row data (logout columns will be empty initially)
    const rowData = [
      userFullName,
      user.email,
      user.role || "N/A",
      user.team || "N/A",
      location, // Location instead of IP Address
      loginTimeFormatted,
      "", // Logout Time (Dallas) - empty on login
      1, // Times Logged In - starts at 1
      0, // Times Logged Out - starts at 0
    ];

    // Get Google Sheets API client using service account
    const sheetsScopes = ["https://www.googleapis.com/auth/spreadsheets"];
    let auth;
    
    console.log("[auth] Attempting to get Google auth client for Sheets...");
    console.log("[auth] GCP_CLIENT_EMAIL exists:", !!process.env.GCP_CLIENT_EMAIL);
    console.log("[auth] GCP_PRIVATE_KEY exists:", !!process.env.GCP_PRIVATE_KEY);
    
    const clientEmail = process.env.GCP_CLIENT_EMAIL;
    const privateKey = process.env.GCP_PRIVATE_KEY;
    
    if (!clientEmail || !privateKey) {
      console.error("[auth] Missing required environment variables:");
      console.error("[auth]   GCP_CLIENT_EMAIL:", clientEmail ? "✓ Set" : "✗ Missing");
      console.error("[auth]   GCP_PRIVATE_KEY:", privateKey ? "✓ Set" : "✗ Missing");
      console.error("[auth] Please add these to your .env file and restart the server");
      return;
    }
    
    try {
      // Create JWT auth for Sheets (doesn't need GMAIL_IMPERSONATED_USER)
      auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey.replace(/\\n/g, "\n"),
        scopes: sheetsScopes,
      });
      
      console.log("[auth] Google auth client created successfully");
    } catch (err) {
      console.error("[auth] Failed to create Google auth client:", err.message);
      console.error("[auth] Error stack:", err.stack);
      return;
    }
    const sheets = google.sheets({ version: "v4", auth });
    console.log("[auth] Google Sheets API client created");

    // Check if the monthly sheet exists, if not create it
    let sheetExists = false;
    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties",
      });

      sheetExists = spreadsheet.data.sheets?.some(
        (sheet) => sheet.properties?.title === sheetName
      ) || false;
    } catch (err) {
      console.error("[auth] Error checking for existing sheets:", err.message);
    }

    // Helper function to format header with dark blue background and ensure data rows have black text
    const formatHeader = async (sheetId) => {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId: sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 9, // A to I (9 columns) - Header row only
                  },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: {
                        red: 0.0,
                        green: 0.2,
                        blue: 0.4, // Dark blue
                      },
                      textFormat: {
                        bold: true,
                        foregroundColor: {
                          red: 1.0,
                          green: 1.0,
                          blue: 1.0, // White text for header
                        },
                      },
                    },
                  },
                  fields: "userEnteredFormat(backgroundColor,textFormat)",
                },
              },
              {
                repeatCell: {
                  range: {
                    sheetId: sheetId,
                    startRowIndex: 1,
                    endRowIndex: 1000, // Data rows - ensure black text, no background
                    startColumnIndex: 0,
                    endColumnIndex: 9,
                  },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: {
                        red: 1.0,
                        green: 1.0,
                        blue: 1.0, // White background (default)
                      },
                      textFormat: {
                        foregroundColor: {
                          red: 0.0,
                          green: 0.0,
                          blue: 0.0, // Black text for data rows
                        },
                      },
                    },
                  },
                  fields: "userEnteredFormat(backgroundColor,textFormat)",
                },
              },
            ],
          },
        });
        console.log(`[auth] Formatted header (dark blue) and data rows (black text)`);
      } catch (err) {
        console.warn(`[auth] Failed to format header/data rows:`, err.message);
      }
    };

    // Get sheet ID for formatting
    let sheetId = null;
    let needsHeaderFormat = false;

    // Create the sheet if it doesn't exist
    if (!sheetExists) {
      try {
        const createResponse = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                  },
                },
              },
            ],
          },
        });
        sheetId = createResponse.data.replies[0].addSheet.properties.sheetId;
        console.log(`[auth] Created new sheet: ${sheetName}`);
        
        // Add headers to the new sheet
        const headers = [
          "Name",
          "Email",
          "Role",
          "Team",
          "Location",
          "Login Time (Dallas)",
          "Logout Time (Dallas)",
          "Times Logged In",
          "Times Logged Out",
        ];
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1:I1`,
          valueInputOption: "USER_ENTERED",
          resource: {
            values: [headers],
          },
        });
        needsHeaderFormat = true;
        console.log(`[auth] Added headers to new sheet: ${sheetName}`);
        
        // Format header immediately after creating sheet
        if (sheetId !== null) {
          await formatHeader(sheetId);
        }
      } catch (createErr) {
        console.error(`[auth] Failed to create sheet ${sheetName}:`, createErr.message);
        return;
      }
    } else {
      // Get sheet ID for existing sheet
      try {
        const spreadsheet = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: "sheets.properties",
        });
        const sheet = spreadsheet.data.sheets?.find(
          (s) => s.properties?.title === sheetName
        );
        if (sheet) {
          sheetId = sheet.properties.sheetId;
        }
      } catch (err) {
        console.warn(`[auth] Could not get sheet ID:`, err.message);
      }

      // Check if headers exist in existing sheet
      try {
        const headerCheck = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A1:I1`,
        });

        // Always ensure headers exist and are properly formatted
        const headers = [
          "Name",
          "Email",
          "Role",
          "Team",
          "Location",
          "Login Time (Dallas)",
          "Logout Time (Dallas)",
          "Times Logged In",
          "Times Logged Out",
        ];
        
        // If no headers exist or headers are empty, add them
        if (!headerCheck.data.values || headerCheck.data.values.length === 0 || !headerCheck.data.values[0] || headerCheck.data.values[0].length === 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1:I1`,
            valueInputOption: "USER_ENTERED",
            resource: {
              values: [headers],
            },
          });
          console.log(`[auth] Added headers to existing sheet: ${sheetName}`);
        } else {
          // Headers exist, but ensure they're correct (update if needed)
          const existingHeaders = headerCheck.data.values[0] || [];
          if (existingHeaders.length !== headers.length || existingHeaders[0] !== headers[0]) {
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${sheetName}!A1:I1`,
              valueInputOption: "USER_ENTERED",
              resource: {
                values: [headers],
              },
            });
            console.log(`[auth] Updated headers in existing sheet: ${sheetName}`);
          }
        }
        needsHeaderFormat = true;
      } catch (headerErr) {
        console.warn(`[auth] Could not check/add headers for ${sheetName}:`, headerErr.message);
        needsHeaderFormat = true; // Try to format anyway
      }
    }

    // Format header with dark blue background (always format if we have sheetId)
    if (sheetId !== null && needsHeaderFormat) {
      await formatHeader(sheetId);
    }

    // Check if user already has a row for today - if yes, update it instead of appending
    // ONE USER = ONE ROW PER DAY - CRITICAL: Must find existing row to prevent duplicates
    let existingRowIndex = -1;
    const currentDate = loginTimeFormatted.split(" at ")[0].trim() || ""; // Format: "March 06, 2026"
    const searchEmail = user.email.trim().toLowerCase();
    
    // Normalize date for comparison (remove extra spaces, ensure consistent format)
    const normalizeDate = (dateStr) => {
      if (!dateStr) return "";
      return dateStr.trim().replace(/\s+/g, " "); // Normalize whitespace
    };
    const normalizedCurrentDate = normalizeDate(currentDate);
    
    console.log(`[auth] 🔍 DUPLICATE CHECK: Looking for user "${user.email}" on date "${currentDate}" (normalized: "${normalizedCurrentDate}")`);
    
    try {
      // Fetch ALL data to check for duplicates
      const allDataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:I`,
      });
      const allData = allDataResponse.data.values || [];
      
      console.log(`[auth] 📊 Total rows in sheet: ${allData.length} (including header)`);
      
      if (allData.length > 1) {
        // Check for existing row for this user on this date
        // Search ALL rows to find ANY row for this user on this date
        // ONE USER = ONE ROW PER DAY - if we find ANY row, we MUST update it
        let foundRowByEmail = -1; // Fallback: if date comparison fails, use email match
        
        for (let i = 1; i < allData.length; i++) {
          const row = allData[i];
          const rowEmail = (row[1] || "").trim().toLowerCase(); // Column B (index 1) is Email
          
          // Check email first (faster)
          if (rowEmail !== searchEmail) {
            continue; // Skip if email doesn't match
          }
          
          // If email matches, save this as a potential match (fallback)
          if (foundRowByEmail === -1) {
            foundRowByEmail = i + 1;
          }
          
          // Extract date from login time (handle multiple login times separated by commas)
          const rowLoginTime = (row[5] || "").trim(); // Column F (index 5) is Login Time (Dallas)
          let rowDate = "";
          
          if (rowLoginTime) {
            // If login time has multiple values (comma-separated), extract date from first one
            const firstLoginTime = rowLoginTime.split(",")[0].trim();
            rowDate = firstLoginTime.split(" at ")[0].trim() || "";
          }
          
          // Normalize dates for comparison
          const normalizedRowDate = normalizeDate(rowDate);
          
          console.log(`[auth] 🔎 Row ${i}: email="${rowEmail}" ${rowEmail === searchEmail ? "✅ MATCH" : "❌"}, date="${rowDate}" (normalized: "${normalizedRowDate}") ${normalizedRowDate === normalizedCurrentDate ? "✅ MATCH" : "❌"}`);
          
          // If same user and same date, update this row (ONE USER = ONE ROW PER DAY)
          if (rowEmail === searchEmail && normalizedRowDate === normalizedCurrentDate) {
            existingRowIndex = i + 1; // +1 because Sheets is 1-indexed
            console.log(`[auth] ✅✅✅ FOUND EXISTING ROW at index ${existingRowIndex} (sheet row ${i + 1}) for user ${user.email} on ${currentDate} - WILL UPDATE instead of creating duplicate`);
            break; // Found it, stop searching
          }
        }
        
        // Fallback: If date comparison failed but we found a row with matching email
        // Try to parse dates using moment to compare (more robust)
        if (existingRowIndex === -1 && foundRowByEmail > 0) {
          const fallbackRow = allData[foundRowByEmail - 1];
          const fallbackLoginTime = (fallbackRow[5] || "").trim();
          let fallbackDate = "";
          
          if (fallbackLoginTime) {
            const firstLoginTime = fallbackLoginTime.split(",")[0].trim();
            fallbackDate = firstLoginTime.split(" at ")[0].trim() || "";
          }
          
          try {
            const currentMoment = moment.tz(currentDate, "MMMM DD, YYYY", TZ);
            const fallbackMoment = moment.tz(fallbackDate, "MMMM DD, YYYY", TZ);
            
            if (currentMoment.isValid() && fallbackMoment.isValid() && currentMoment.isSame(fallbackMoment, "day")) {
              existingRowIndex = foundRowByEmail;
              console.log(`[auth] ✅✅✅ FOUND EXISTING ROW (via moment fallback) at index ${existingRowIndex} for user ${user.email} - dates match when parsed: "${currentDate}" === "${fallbackDate}"`);
            }
          } catch (parseErr) {
            console.warn(`[auth] Could not parse dates for comparison:`, parseErr.message);
          }
        }
        
        if (existingRowIndex === -1) {
          console.log(`[auth] ❌❌❌ NO EXISTING ROW FOUND for user ${user.email} on ${currentDate} - WILL CREATE NEW ROW`);
          if (foundRowByEmail > 0) {
            console.log(`[auth] ⚠️  WARNING: Found row with matching email at index ${foundRowByEmail} but date comparison failed!`);
          }
        }
      } else {
        console.log(`[auth] Only header row exists - will CREATE new row for user ${user.email}`);
      }
    } catch (err) {
      console.error(`[auth] ❌ ERROR checking for existing row:`, err.message);
      console.error(`[auth] Error stack:`, err.stack);
      // If check fails, proceed to create new row (but log the error)
    }

    // If user already has a row for today, append login times with comma and update count
    if (existingRowIndex > 0) {
      try {
        // Re-fetch the row data to ensure we have the latest values (in case it was updated)
        const rowDataResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!F${existingRowIndex}:H${existingRowIndex}`,
        });
        const rowValues = rowDataResponse.data.values?.[0] || [];
        
        // Get existing login times and count from the row
        const existingLoginTimeDallas = (rowValues[0] || "").trim(); // Column F (index 0 in this range)
        const existingLoginCount = parseInt(rowValues[2] || "0") || 0; // Column H (index 2 in this range)
        
        console.log(`[auth] Current row data - LoginTime: "${existingLoginTimeDallas}", Count: ${existingLoginCount}`);
        
        // Append new login time with comma separator (for multiple logins on same day)
        // Example: "March 06, 2026 at 09:00 AM Dallas Time, March 06, 2026 at 02:00 PM Dallas Time"
        const updatedLoginTimeDallas = existingLoginTimeDallas 
          ? `${existingLoginTimeDallas}, ${loginTimeFormatted}`
          : loginTimeFormatted;
        
        // Increment login count
        const updatedLoginCount = existingLoginCount + 1;
        
        console.log(`[auth] 📝 Appending login time. Existing: "${existingLoginTimeDallas}", New: "${loginTimeFormatted}", Updated: "${updatedLoginTimeDallas}"`);
        console.log(`[auth] 📊 Count: ${existingLoginCount} → ${updatedLoginCount}`);
        
        // Update login time and count columns (F and H, indices 5 and 7) using batchUpdate
        const updateResult = await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          resource: {
            valueInputOption: "USER_ENTERED",
            data: [
              {
                range: `${sheetName}!F${existingRowIndex}`,
                values: [[updatedLoginTimeDallas]],
              },
              {
                range: `${sheetName}!H${existingRowIndex}`,
                values: [[updatedLoginCount]],
              },
            ],
          },
        });
        
        console.log(`[auth] ✅ Successfully updated row ${existingRowIndex}`);
        console.log(`[auth] ✅ Appended login time to existing row ${existingRowIndex} for user: ${user.email}, count: ${updatedLoginCount}`);
        return; // Don't append new row, we've updated existing one
      } catch (err) {
        console.error(`[auth] ❌ Failed to update existing row ${existingRowIndex}:`, err.message);
        console.error(`[auth] Error stack:`, err.stack);
        if (err.response) {
          console.error(`[auth] Error response:`, JSON.stringify(err.response.data, null, 2));
        }
        // Fall through to append logic (but this shouldn't happen)
        console.warn(`[auth] Will attempt to append new row instead`);
      }
    }

    // Only append if no existing row was found
    if (existingRowIndex === -1) {
      console.log(`[auth] No existing row found, appending new row for user: ${user.email}`);

      // Before appending the login row, check if this date already exists in any row.
      // If it's the first time this date appears in the sheet, add a blue separator row
      // with the date in column A to visually separate days.
      let dateExists = false;
      try {
        if (allData && allData.length > 1) {
          for (let i = 1; i < allData.length; i++) {
            const row = allData[i];
            const rowLoginTime = (row[5] || "").trim(); // Column F (index 5) is Login Time (Dallas)
            let rowDate = "";
            if (rowLoginTime) {
              const firstLoginTime = rowLoginTime.split(",")[0].trim();
              rowDate = firstLoginTime.split(" at ")[0].trim() || "";
            }
            const normalizedRowDate = normalizeDate(rowDate);
            if (normalizedRowDate === normalizedCurrentDate) {
              dateExists = true;
              break;
            }
          }
        }
      } catch (dateCheckErr) {
        console.warn("[auth] Failed to check for existing date rows:", dateCheckErr.message);
      }

      // If this is the first row for the date, insert a blue date separator row
      if (!dateExists) {
        try {
          const separatorValues = [[currentDate, "", "", "", "", "", "", "", ""]];
          // Append separator row
          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetName}!A:I`,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            resource: { values: separatorValues },
          });

          // If we know the sheetId, color the separator row dark blue with white text
          if (sheetId !== null) {
            const separatorRowIndex = allData.length + 1; // 1-based index of newly appended separator
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              resource: {
                requests: [
                  {
                    repeatCell: {
                      range: {
                        sheetId,
                        startRowIndex: separatorRowIndex - 1,
                        endRowIndex: separatorRowIndex,
                        startColumnIndex: 0,
                        endColumnIndex: 9,
                      },
                      cell: {
                        userEnteredFormat: {
                          backgroundColor: { red: 0.0, green: 0.2, blue: 0.4 },
                          textFormat: {
                            bold: true,
                            foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                          },
                        },
                      },
                      fields: "userEnteredFormat(backgroundColor,textFormat)",
                    },
                  },
                ],
              },
            });
          }
        } catch (separatorErr) {
          console.warn("[auth] Failed to append / format date separator row:", separatorErr.message);
        }
      }

      // Append the actual login row for this user
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:I`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        resource: {
          values: [rowData],
        },
      });
    } else {
      console.log(`[auth] Skipping append - existing row will be updated at index ${existingRowIndex}`);
    }

    console.log(`[auth] ✅ Login data appended successfully to Google Sheet (${sheetName}) for user: ${user.email}`);
    console.log(`[auth] ========== appendLoginToGoogleSheet END (SUCCESS) ==========`);
  } catch (error) {
    // Don't block login if Google Sheets append fails - just log the error
    console.error("[auth] ❌ Failed to append login data to Google Sheet:");
    console.error("[auth] Error message:", error.message);
    console.error("[auth] Error stack:", error.stack);
    if (error.response) {
      console.error("[auth] Error response:", JSON.stringify(error.response.data, null, 2));
    }
    console.error(`[auth] ========== appendLoginToGoogleSheet END (ERROR) ==========`);
  }
}

// Helper function to update logout data in existing login row
async function appendLogoutToGoogleSheet(user, ipAddress, userAgent) {
  console.log("[auth] ========== appendLogoutToGoogleSheet START ==========");
  console.log("[auth] Called for user:", user?.email);
  console.log("[auth] IP Address:", ipAddress);
  console.log("[auth] User Agent:", userAgent);
  
  try {
    const spreadsheetId = process.env.LOGIN_TRACKING_SHEET_ID;
    
    if (!spreadsheetId) {
      console.error("[auth] ERROR: LOGIN_TRACKING_SHEET_ID not configured, skipping Google Sheet append");
      return;
    }
    
    console.log("[auth] Spreadsheet ID:", spreadsheetId);

    const logoutTimeFormatted = moment().tz(TZ).format("MMMM DD, YYYY [at] hh:mm A [Dallas Time]");
    const userEmail = user.email;
    
    // Note: We don't need to get location again for logout, just update the logout time
    
    // Get current month and year in "Month YYYY" format based on Dallas timezone (e.g., "March 2026")
    // Always uses Dallas datetime (America/Chicago timezone)
    const now = moment().tz(TZ); // TZ = "America/Chicago" (Dallas timezone)
    const sheetName = now.format("MMMM YYYY");

    // Get Google Sheets API client using service account
    const sheetsScopes = ["https://www.googleapis.com/auth/spreadsheets"];
    let auth;
    try {
      console.log("[auth] Attempting to get Google auth client for Sheets (logout)...");
      
      const clientEmail = process.env.GCP_CLIENT_EMAIL;
      const privateKey = process.env.GCP_PRIVATE_KEY;
      
      if (!clientEmail || !privateKey) {
        throw new Error("GCP_CLIENT_EMAIL and GCP_PRIVATE_KEY are required for Google Sheets API");
      }
      
      // Create JWT auth for Sheets (doesn't need GMAIL_IMPERSONATED_USER)
      auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey.replace(/\\n/g, "\n"),
        scopes: sheetsScopes,
      });
    } catch (err) {
      console.error("[auth] Failed to get Google auth client for logout:", err.message);
      console.error("[auth] Please ensure GCP_CLIENT_EMAIL and GCP_PRIVATE_KEY are set in .env");
      return;
    }
    const sheets = google.sheets({ version: "v4", auth });

    // Get all data from the sheet to find the most recent login row for this user
    let allData;
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:I`,
      });
      allData = response.data.values || [];
      console.log(`[auth] Retrieved ${allData.length} rows from sheet ${sheetName}`);
    } catch (err) {
      console.error(`[auth] Error reading sheet ${sheetName}:`, err.message);
      return;
    }

    if (allData.length < 2) {
      // No data rows (only headers or empty sheet)
      console.warn(`[auth] No login data found for user ${userEmail} in sheet ${sheetName} (only ${allData.length} rows)`);
      return;
    }

    // Find the row for this user for today (ONE USER = ONE ROW PER DAY)
    // When user logs out and logs in again, login time should append to same row with comma
    let rowIndex = -1;
    const currentDate = logoutTimeFormatted.split(" at ")[0].trim() || ""; // Format: "March 06, 2026"
    const searchEmail = userEmail.trim().toLowerCase();
    console.log(`[auth] Searching for user ${userEmail} in sheet ${sheetName} for date "${currentDate}"...`);
    
    // Find the row for this user on today's date (most recent one, search from bottom to top)
    for (let i = allData.length - 1; i >= 1; i--) {
      const row = allData[i];
      const rowEmail = (row[1] || "").trim().toLowerCase();
      const rowLoginTime = (row[5] || "").trim(); // Column F (index 5) is Login Time (Dallas)
      const rowDate = rowLoginTime.split(" at ")[0].trim() || ""; // Extract date part
      
      // Check if this row matches the user email and date (ONE USER = ONE ROW PER DAY)
      if (rowEmail === searchEmail && rowDate === currentDate) {
        rowIndex = i + 1; // +1 because Sheets API uses 1-based indexing
        console.log(`[auth] ✅ Found matching row at index ${rowIndex} (sheet row ${i + 1}) for user ${userEmail} on ${currentDate}`);
        break;
      }
    }

    if (rowIndex === -1) {
      console.warn(`[auth] No login session found for user ${userEmail} on ${currentDate} in sheet ${sheetName}`);
      console.warn(`[auth] Searched through ${allData.length - 1} data rows`);
      // Log a few sample rows for debugging
      if (allData.length > 1) {
        console.warn(`[auth] Sample rows (last 3):`, allData.slice(-3).map((r, idx) => ({
          row: allData.length - 3 + idx,
          email: r[1],
          loginTime: r[5],
          logoutDallas: r[6],
          loginCount: r[7],
          logoutCount: r[8]
        })));
      }
      return;
    }

    // Get existing logout times and count from the row
    const existingRow = allData[rowIndex - 1]; // -1 because allData is 0-indexed
    const existingLogoutTimeDallas = (existingRow[6] || "").trim(); // Column G (index 6) is Logout Time (Dallas)
    const existingLogoutCount = parseInt(existingRow[8] || "0") || 0; // Column I (index 8) is Times Logged Out
    
    // Append new logout time with comma separator (for multiple logouts on same day)
    // Example: "March 06, 2026 at 10:00 AM Dallas Time, March 06, 2026 at 03:00 PM Dallas Time"
    const updatedLogoutTimeDallas = existingLogoutTimeDallas 
      ? `${existingLogoutTimeDallas}, ${logoutTimeFormatted}`
      : logoutTimeFormatted;
    
    // Increment logout count
    const updatedLogoutCount = existingLogoutCount + 1;
    
    console.log(`[auth] Appending logout time. Existing: "${existingLogoutTimeDallas}", New: "${logoutTimeFormatted}", Updated: "${updatedLogoutTimeDallas}"`);

    // Update the logout time and count columns (G and I)
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          valueInputOption: "USER_ENTERED",
          data: [
            {
              range: `${sheetName}!G${rowIndex}`,
              values: [[updatedLogoutTimeDallas]],
            },
            {
              range: `${sheetName}!I${rowIndex}`,
              values: [[updatedLogoutCount]],
            },
          ],
        },
      });
      console.log(`[auth] ✅ Logout data appended successfully in Google Sheet (${sheetName}) row ${rowIndex} for user: ${userEmail}, count: ${updatedLogoutCount}`);
      console.log(`[auth] ========== appendLogoutToGoogleSheet END (SUCCESS) ==========`);
    } catch (updateErr) {
      console.error(`[auth] Failed to update logout data in row ${rowIndex}:`, updateErr.message);
      throw updateErr;
    }
  } catch (error) {
    // Don't block logout if Google Sheets update fails - just log the error
    console.error("[auth] ❌ Failed to update logout data in Google Sheet:");
    console.error("[auth] Error message:", error.message);
    console.error("[auth] Error stack:", error.stack);
    if (error.response) {
      console.error("[auth] Error response:", JSON.stringify(error.response.data, null, 2));
    }
    console.error(`[auth] ========== appendLogoutToGoogleSheet END (ERROR) ==========`);
  }
}

// Signup Route (Admins Only)
router.post("/signup", validateSignup, async (req, res) => {
  try {
    const { firstName, lastName, email, password, team, role } = req.body;
    // Email whitelist check
    console.log("Allowed emails:", allowedEmails,email);
    if (!allowedEmails.includes(email)) {
      return res.status(403).json({ message: "Email not authorized for signup" });
    }

    // Role must be Admin
    if (role !== "Admin") {
      return res.status(403).json({ message: "Only Admins can sign up directly." });
    }

    // User already exists
    const existingUser = await User.findOne({ email });
    console.log("Existing user from DB:", existingUser);
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    // 5. Create user
    const newUser = new User({
      firstName,
      lastName,
      email,
      password,
      team,
      role
    });

    await newUser.save();

    res.status(201).json({ message: "Admin account created successfully" });
  } catch (err) {
    res.status(500).json({ message: "Something went wrong" });
  }
});

// Login Route
router.post("/login", validateLogin, async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }); // not .lean() so pre-save etc if needed
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role }, // keep in sync with requireAuth
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    // Optional: clean old sessions as you do
    await LoggedInUser.deleteMany({ expiry: { $lte: new Date() } });

    const expiryDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
    
    // Extract IP address and user agent
    const ipAddress = getIpAddress(req);
    const userAgent = req.headers["user-agent"] || "Unknown";
    
    await LoggedInUser.findOneAndUpdate(
      { userId: user._id },
      { 
        userId: user._id, 
        loginTime: new Date(), 
        jwtToken: token, 
        expiry: expiryDate,
        ipAddress: ipAddress,
        userAgent: userAgent,
      },
      { upsert: true, new: true }
    );
    const safeUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      team: user.team,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Append login data to Google Sheet (non-blocking)
    appendLoginToGoogleSheet(user, ipAddress, userAgent).catch((err) => {
      console.error("[auth] Google Sheet append error (non-blocking):", err);
    });

    return res.status(200).json({ token, user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Logout Route
router.post("/logout", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user info before deleting the session
    const user = await User.findById(decoded.id);
    if (user) {
      // Extract IP address and user agent
      const ipAddress = getIpAddress(req);
      const userAgent = req.headers["user-agent"] || "Unknown";
      
      // Append logout data to Google Sheet (non-blocking)
      appendLogoutToGoogleSheet(user, ipAddress, userAgent).catch((err) => {
        console.error("[auth] Google Sheet append error for logout (non-blocking):", err.message);
        console.error("[auth] Error stack:", err.stack);
        if (err.response) {
          console.error("[auth] Error response:", JSON.stringify(err.response.data, null, 2));
        }
      });
    } else {
      console.warn(`[auth] User not found for logout, ID: ${decoded.id}`);
    }
    
    await LoggedInUser.deleteOne({ userId: decoded.id });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(401).json({ message: "Invalid token" });
  }
});

export default router;
