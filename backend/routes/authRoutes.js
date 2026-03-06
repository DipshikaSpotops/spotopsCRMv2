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
import { getGoogleJwtClient } from "../services/googleAuth.js";

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

// Helper function to append login data to Google Sheet
async function appendLoginToGoogleSheet(user, ipAddress, userAgent) {
  console.log("[auth] appendLoginToGoogleSheet called for user:", user?.email);
  try {
    const spreadsheetId = process.env.LOGIN_TRACKING_SHEET_ID;
    
    if (!spreadsheetId) {
      console.warn("[auth] LOGIN_TRACKING_SHEET_ID not configured, skipping Google Sheet append");
      return;
    }
    
    console.log("[auth] Spreadsheet ID:", spreadsheetId);

    const loginTime = moment().tz(TZ).format("YYYY-MM-DD HH:mm:ss");
    const loginTimeFormatted = moment().tz(TZ).format("MMMM DD, YYYY [at] hh:mm A [Dallas Time]");
    const userFullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
    
    // Get current month and year in "Month YYYY" format (e.g., "March 2026")
    const now = moment().tz(TZ);
    const sheetName = now.format("MMMM YYYY");
    
    // Prepare row data (logout columns will be empty initially)
    const rowData = [
      userFullName,
      user.email,
      user.role || "N/A",
      user.team || "N/A",
      ipAddress || "Unknown",
      userAgent || "Unknown",
      loginTimeFormatted,
      loginTime,
      "", // Logout Time (Dallas) - empty on login
      "", // Logout Time (ISO) - empty on login
    ];

    // Get Google Sheets API client using service account
    const sheetsScopes = ["https://www.googleapis.com/auth/spreadsheets"];
    let auth;
    try {
      console.log("[auth] Attempting to get Google auth client for Sheets...");
      
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
      
      console.log("[auth] Google auth client obtained successfully");
    } catch (err) {
      console.error("[auth] Failed to get Google auth client:", err.message);
      console.error("[auth] Error stack:", err.stack);
      console.error("[auth] Please ensure GCP_CLIENT_EMAIL and GCP_PRIVATE_KEY are set in .env");
      // Don't throw - just return so login can continue
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

    // Helper function to format header with light blue background
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
                    endColumnIndex: 10,
                  },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: {
                        red: 0.85,
                        green: 0.95,
                        blue: 1.0,
                      },
                    },
                  },
                  fields: "userEnteredFormat.backgroundColor",
                },
              },
            ],
          },
        });
      } catch (err) {
        console.warn(`[auth] Failed to format header:`, err.message);
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
          "IP Address",
          "User Agent",
          "Login Time (Dallas)",
          "Login Time (ISO)",
          "Logout Time (Dallas)",
          "Logout Time (ISO)",
        ];
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1:J1`,
          valueInputOption: "USER_ENTERED",
          resource: {
            values: [headers],
          },
        });
        needsHeaderFormat = true;
        console.log(`[auth] Added headers to sheet: ${sheetName}`);
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
          range: `${sheetName}!A1:J1`,
        });

        // If no headers exist, add them
        if (!headerCheck.data.values || headerCheck.data.values.length === 0) {
          const headers = [
            "Name",
            "Email",
            "Role",
            "Team",
            "IP Address",
            "User Agent",
            "Login Time (Dallas)",
            "Login Time (ISO)",
            "Logout Time (Dallas)",
            "Logout Time (ISO)",
          ];
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1:J1`,
            valueInputOption: "USER_ENTERED",
            resource: {
              values: [headers],
            },
          });
          needsHeaderFormat = true;
          console.log(`[auth] Added headers to existing sheet: ${sheetName}`);
        } else {
          // Headers exist, but we should still format them
          needsHeaderFormat = true;
        }
      } catch (headerErr) {
        console.warn(`[auth] Could not check/add headers for ${sheetName}:`, headerErr.message);
      }
    }

    // Format header with light blue background (always format if we have sheetId)
    if (sheetId !== null) {
      await formatHeader(sheetId);
    }

    // Check if it's a new day - get the last row to check the date
    let isNewDay = false;
    try {
      const allDataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:J`,
      });
      const allData = allDataResponse.data.values || [];
      
      if (allData.length > 1) {
        // Get the last row with data (skip header)
        const lastRow = allData[allData.length - 1];
        // Column G (index 6) contains "Login Time (Dallas)" - extract date from it
        const lastLoginTime = lastRow[6] || "";
        const lastDate = lastLoginTime.split(" at ")[0] || "";
        const currentDate = loginTimeFormatted.split(" at ")[0] || "";
        
        // Compare dates (format: "MMMM DD, YYYY")
        if (lastDate !== currentDate && lastDate !== "") {
          isNewDay = true;
        }
      } else {
        // Only header exists, so it's effectively a new day
        isNewDay = false; // Don't add spacing on first data entry
      }
    } catch (err) {
      console.warn(`[auth] Could not check for new day:`, err.message);
      isNewDay = false;
    }

    // If it's a new day, add 3 empty rows before appending
    if (isNewDay) {
      try {
        const emptyRows = [[], [], []];
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A:J`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          resource: {
            values: emptyRows,
          },
        });
        console.log(`[auth] Added 3 empty rows for new day in sheet: ${sheetName}`);
      } catch (err) {
        console.warn(`[auth] Failed to add empty rows:`, err.message);
      }
    }

    // Append the row to the monthly sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: {
        values: [rowData],
      },
    });

    console.log(`[auth] Login data appended to Google Sheet (${sheetName}) for user: ${user.email}`);
  } catch (error) {
    // Don't block login if Google Sheets append fails - just log the error
    console.error("[auth] Failed to append login data to Google Sheet:");
    console.error("[auth] Error message:", error.message);
    console.error("[auth] Error stack:", error.stack);
    if (error.response) {
      console.error("[auth] Error response:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Helper function to update logout data in existing login row
async function appendLogoutToGoogleSheet(user, ipAddress, userAgent) {
  console.log("[auth] appendLogoutToGoogleSheet called for user:", user?.email);
  try {
    const spreadsheetId = process.env.LOGIN_TRACKING_SHEET_ID;
    
    if (!spreadsheetId) {
      console.warn("[auth] LOGIN_TRACKING_SHEET_ID not configured, skipping Google Sheet append");
      return;
    }
    
    console.log("[auth] Spreadsheet ID:", spreadsheetId);

    const logoutTime = moment().tz(TZ).format("YYYY-MM-DD HH:mm:ss");
    const logoutTimeFormatted = moment().tz(TZ).format("MMMM DD, YYYY [at] hh:mm A [Dallas Time]");
    const userEmail = user.email;
    
    // Get current month and year in "Month YYYY" format (e.g., "March 2026")
    const now = moment().tz(TZ);
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
        range: `${sheetName}!A:J`,
      });
      allData = response.data.values || [];
    } catch (err) {
      console.error(`[auth] Error reading sheet ${sheetName}:`, err.message);
      return;
    }

    if (allData.length < 2) {
      // No data rows (only headers or empty sheet)
      console.warn(`[auth] No login data found for user ${userEmail} in sheet ${sheetName}`);
      return;
    }

    // Find the most recent login row for this user that doesn't have logout time
    // Start from the bottom (most recent) and work up
    let rowIndex = -1;
    for (let i = allData.length - 1; i >= 1; i--) {
      const row = allData[i];
      // Check if this row matches the user email (column B, index 1)
      // and if logout time columns (I and J, indices 8 and 9) are empty
      if (
        row[1] === userEmail &&
        (!row[8] || row[8].trim() === "") &&
        (!row[9] || row[9].trim() === "")
      ) {
        rowIndex = i + 1; // +1 because Sheets API uses 1-based indexing
        break;
      }
    }

    if (rowIndex === -1) {
      console.warn(`[auth] No open login session found for user ${userEmail} in sheet ${sheetName}`);
      return;
    }

    // Update the logout time columns (I and J)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!I${rowIndex}:J${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[logoutTimeFormatted, logoutTime]],
      },
    });

    console.log(`[auth] Logout data updated in Google Sheet (${sheetName}) row ${rowIndex} for user: ${userEmail}`);
  } catch (error) {
    // Don't block logout if Google Sheets update fails - just log the error
    console.error("[auth] Failed to update logout data in Google Sheet:");
    console.error("[auth] Error message:", error.message);
    console.error("[auth] Error stack:", error.stack);
    if (error.response) {
      console.error("[auth] Error response:", JSON.stringify(error.response.data, null, 2));
    }
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
        console.error("[auth] Google Sheet append error for logout (non-blocking):", err);
      });
    }
    
    await LoggedInUser.deleteOne({ userId: decoded.id });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(401).json({ message: "Invalid token" });
  }
});

export default router;
