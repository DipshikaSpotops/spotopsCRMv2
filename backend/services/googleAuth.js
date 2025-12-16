import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_PATH = path.join(__dirname, "..", "token.json");
const CREDS_PATH = path.join(__dirname, "..", "credentials.json");

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/pubsub",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
];

let cachedAuth;
let cachedGmail;
let cachedUserEmail = null;

// Function to clear all cached tokens (useful after re-authorization)
export function clearTokenCache() {
  cachedAuth = null;
  cachedGmail = null;
  cachedUserEmail = null;
  console.log("[googleAuth] Token cache cleared");
}

function createOAuthClient(redirectUriOverride = null) {
  if (!fs.existsSync(CREDS_PATH)) {
    throw new Error(
      `Missing credentials.json file. Please download it from Google Cloud Console and place it at: ${CREDS_PATH}`
    );
  }
  const raw = fs.readFileSync(CREDS_PATH, "utf-8");
  const json = JSON.parse(raw);
  const web = json.web || json.installed;
  
  if (!web || !web.client_id || !web.client_secret) {
    throw new Error("Invalid credentials.json format. Missing client_id or client_secret.");
  }

  // Use provided redirect URI, or from credentials.json, or env var, or default
  const redirectUri = redirectUriOverride ||
                      process.env.GMAIL_OAUTH_REDIRECT_URI ||
                      web.redirect_uris?.[0] || 
                      "http://localhost:5000/api/gmail/oauth2/callback";
  
  console.log("[googleAuth] Using redirect URI:", redirectUri);
  
  return new google.auth.OAuth2(web.client_id, web.client_secret, redirectUri);
}

export function getAuthUrl(redirectUriOverride = null) {
  const oAuth2Client = createOAuthClient(redirectUriOverride);
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DEFAULT_SCOPES,
    // Add include_granted_scopes to help with token refresh
    include_granted_scopes: true,
  });
}

export async function setTokensFromCode(code, redirectUriOverride = null) {
  const oAuth2Client = createOAuthClient(redirectUriOverride);
  let { tokens } = await oAuth2Client.getToken(code);
  
  // Ensure token.json directory exists
  const tokenDir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(tokenDir)) {
    fs.mkdirSync(tokenDir, { recursive: true });
  }
  
  // Check if access_token is blocked immediately after OAuth
  if (tokens.access_token === "blocked_by_reauth_policy" || !tokens.access_token || tokens.access_token === "") {
    console.log("[googleAuth] Access token is blocked immediately after OAuth. Attempting to refresh...");
    
    if (tokens.refresh_token) {
      try {
        // Set credentials with refresh_token
        oAuth2Client.setCredentials({
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date || null,
          token_type: tokens.token_type || "Bearer",
        });
        
        // Try to refresh immediately
        const { credentials } = await oAuth2Client.refreshAccessToken();
        const refreshedTokens = { ...tokens, ...credentials };
        // Preserve refresh_token
        if (!refreshedTokens.refresh_token && tokens.refresh_token) {
          refreshedTokens.refresh_token = tokens.refresh_token;
        }
        
        // Save refreshed tokens
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(refreshedTokens, null, 2));
        console.log("[googleAuth] Token refreshed successfully after OAuth");
        
        // Use refreshed tokens
        tokens = refreshedTokens;
        oAuth2Client.setCredentials(tokens);
      } catch (refreshErr) {
        console.error("[googleAuth] Failed to refresh token after OAuth:", refreshErr.message);
        console.error("[googleAuth] Refresh error details:", JSON.stringify(refreshErr.response?.data || refreshErr.message, null, 2));
        
        // Check if it's a rapt_required error
        if (refreshErr.message?.includes("rapt_required") || refreshErr.response?.data?.error_subtype === "rapt_required") {
          console.error("[googleAuth] RAPT required even after OAuth. This may require:");
          console.error("[googleAuth] 1. Verifying the OAuth app in Google Cloud Console");
          console.error("[googleAuth] 2. Adding the user as a test user in OAuth consent screen");
          console.error("[googleAuth] 3. Waiting a few minutes and trying again");
        }
        
        // Still save the original tokens (with refresh_token) - it might work later
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.warn("[googleAuth] Saved tokens with refresh_token. Will attempt refresh on next use.");
        oAuth2Client.setCredentials(tokens);
      }
    } else {
      // No refresh_token, just save what we got
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.warn("[googleAuth] No refresh_token in OAuth response. Token may be blocked.");
      oAuth2Client.setCredentials(tokens);
    }
  } else {
    // Token looks good, save it
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    oAuth2Client.setCredentials(tokens);
  }
  
  // Get user email from token
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const { data } = await oauth2.userinfo.get();
    if (data?.email) {
      cachedUserEmail = data.email;
      console.log("[googleAuth] User email from OAuth2:", data.email);
    }
  } catch (err) {
    console.error("[googleAuth] Failed to get user email:", err.message);
  }
  
  // Clear cached clients to force refresh
  cachedAuth = null;
  cachedGmail = null;
  
  return tokens;
}

export async function getGmailClient() {
  if (cachedGmail) return cachedGmail;

  const oAuth2Client = createOAuthClient();
  
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Missing token.json. Authorize via /api/gmail/oauth2/url first.");
  }
  
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  
  // Check if access_token is blocked by reauth policy
  if (tokens.access_token === "blocked_by_reauth_policy" || !tokens.access_token || tokens.access_token === "") {
    console.log("[googleAuth] Access token is blocked or missing, refreshing immediately...");
    
    // Make sure we have a refresh_token
    if (!tokens.refresh_token) {
      throw new Error("No refresh token available. Please re-authorize via /api/gmail/oauth2/url");
    }
    
    try {
      // Set all credentials first (including refresh_token)
      oAuth2Client.setCredentials({
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token, // Even if blocked, include it
        expiry_date: tokens.expiry_date || null,
        token_type: tokens.token_type || "Bearer",
      });
      
      console.log("[googleAuth] Attempting to refresh token with refresh_token:", tokens.refresh_token?.substring(0, 20) + "...");
      const { credentials } = await oAuth2Client.refreshAccessToken();
      const newTokens = { ...tokens, ...credentials };
      // Preserve refresh_token if not in new credentials
      if (!newTokens.refresh_token && tokens.refresh_token) {
        newTokens.refresh_token = tokens.refresh_token;
      }
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(newTokens, null, 2));
      oAuth2Client.setCredentials(newTokens);
      console.log("[googleAuth] Token refreshed successfully after reauth block");
      // Update tokens reference
      Object.assign(tokens, newTokens);
    } catch (err) {
      console.error("[googleAuth] Failed to refresh blocked token:", err.message);
      
      // Check if it's a rapt_required error (Google security feature)
      if (err.message?.includes("rapt_required") || err.response?.data?.error_subtype === "rapt_required") {
        console.warn("[googleAuth] RAPT (Risk-Aware Protection Token) required by Google security policy.");
        console.warn("[googleAuth] This requires re-authorization. The refresh_token may also be blocked.");
        throw new Error("Google security policy (RAPT) requires re-authorization. Please visit /api/gmail/oauth2/url to re-authorize.");
      }
      
      throw new Error("Token is blocked by reauth policy and refresh failed. Please re-authorize via /api/gmail/oauth2/url");
    }
  }
  
  oAuth2Client.setCredentials(tokens);
  
  // Refresh token if expired or expiring soon (within 5 minutes)
  const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
  if (tokens.expiry_date && tokens.expiry_date <= fiveMinutesFromNow) {
    console.log("[googleAuth] Token expired or expiring soon, refreshing automatically...");
    try {
      // Set credentials with refresh_token first, then refresh
      oAuth2Client.setCredentials({
        refresh_token: tokens.refresh_token,
      });
      
      const { credentials } = await oAuth2Client.refreshAccessToken();
      const newTokens = { ...tokens, ...credentials };
      // Preserve refresh_token if not in new credentials
      if (!newTokens.refresh_token && tokens.refresh_token) {
        newTokens.refresh_token = tokens.refresh_token;
      }
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(newTokens, null, 2));
      oAuth2Client.setCredentials(newTokens);
      console.log("[googleAuth] Token refreshed successfully");
      
      // Update cached tokens
      tokens.access_token = newTokens.access_token;
      tokens.expiry_date = newTokens.expiry_date;
      if (newTokens.id_token) {
        tokens.id_token = newTokens.id_token;
      }
    } catch (err) {
      console.error("[googleAuth] Failed to refresh token:", err.message);
      
      // If refresh fails with invalid_grant, the refresh token is likely invalid
      // This can happen if:
      // 1. Token was revoked by user
      // 2. Token was issued for different OAuth client
      // 3. Token expired (rare for refresh tokens)
      if (err.message?.includes("invalid_grant") || err.code === "invalid_grant") {
        console.warn("[googleAuth] Refresh token is invalid. Email will still be available from id_token, but Gmail API calls will fail.");
        console.warn("[googleAuth] To fix: Visit /api/gmail/oauth2/url to get a new authorization URL and re-authorize.");
        // Don't throw - allow the code to continue with expired token
        // The email can still be extracted from id_token
        // Gmail API calls will fail, but at least the email will show
      } else {
        // For other errors, still throw but with helpful message
        if (!tokens.refresh_token) {
          throw new Error("No refresh token available. Please re-authorize via /api/gmail/oauth2/url");
        }
        throw new Error(`Token refresh failed: ${err.message}. Please re-authorize via /api/gmail/oauth2/url`);
      }
    }
  }
  
  cachedAuth = oAuth2Client;
  cachedGmail = google.gmail({ version: "v1", auth: oAuth2Client });
  
  // Get user email if not cached
  if (!cachedUserEmail) {
    try {
      const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
      const { data } = await oauth2.userinfo.get();
      if (data?.email) {
        cachedUserEmail = data.email;
        console.log("[googleAuth] User email from OAuth2:", data.email);
      }
    } catch (err) {
      console.error("[googleAuth] Failed to get user email:", err.message);
    }
  }
  
  return cachedGmail;
}

export function getUserEmail() {
  // If cached, return it
  if (cachedUserEmail) return cachedUserEmail;
  
  // Try to extract from id_token in token.json (even if expired)
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
      if (tokens.id_token) {
        // Decode JWT without verification (we just want the email)
        const base64Url = tokens.id_token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
        const decoded = JSON.parse(jsonPayload);
        if (decoded.email) {
          cachedUserEmail = decoded.email;
          console.log("[googleAuth] User email extracted from id_token:", decoded.email);
          return decoded.email;
        }
      }
    } catch (err) {
      console.error("[googleAuth] Failed to extract email from id_token:", err.message);
    }
  }
  
  // Fallback to environment variable
  return process.env.GMAIL_IMPERSONATED_USER || null;
}

// Legacy JWT support (for backward compatibility)
export function getGoogleJwtClient(scopes = DEFAULT_SCOPES) {
  if (cachedAuth && !cachedAuth.credentials) {
    // If we have OAuth2 client, use it
    return cachedAuth;
  }
  
  // Fallback to JWT if OAuth2 not available
  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  const privateKey = process.env.GCP_PRIVATE_KEY;
  const userToImpersonate = process.env.GMAIL_IMPERSONATED_USER;

  if (!clientEmail || !privateKey || !userToImpersonate) {
    throw new Error(
      "Google credentials missing. Either set up OAuth2 (credentials.json + token.json) or ensure GCP_CLIENT_EMAIL, GCP_PRIVATE_KEY, and GMAIL_IMPERSONATED_USER are set."
    );
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes,
    subject: userToImpersonate,
  });
}
