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

export function getAuthUrl(redirectUriOverride = null, forceConsent = false) {
  const oAuth2Client = createOAuthClient(redirectUriOverride);
  
  // Check if we already have a refresh token
  let hasRefreshToken = false;
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const existingTokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
      hasRefreshToken = !!existingTokens.refresh_token;
    } catch (err) {
      // If we can't read token.json, assume no refresh token
      hasRefreshToken = false;
    }
  }
  
  const authUrlOptions = {
    access_type: "offline",
    scope: DEFAULT_SCOPES,
    include_granted_scopes: true,
  };
  
  // Only add prompt: "consent" if:
  // 1. Force consent is explicitly requested, OR
  // 2. We don't have a refresh token (first time setup)
  // Otherwise, let Google decide (don't set prompt parameter)
  // This allows Google to show consent screen if needed, or skip if not
  if (forceConsent || !hasRefreshToken) {
    authUrlOptions.prompt = "consent";
    console.log("[googleAuth] Using consent prompt -", forceConsent ? "forced" : "no refresh token found");
  } else {
    // Don't set prompt parameter - let Google decide
    // Google will show consent screen only if needed (e.g., token expired, permissions changed)
    // This prevents "interaction_required" errors when refresh token is still valid
    console.log("[googleAuth] Omitting prompt parameter - refresh token exists, letting Google decide");
  }
  
  return oAuth2Client.generateAuthUrl(authUrlOptions);
}

export async function setTokensFromCode(code, redirectUriOverride = null) {
  const oAuth2Client = createOAuthClient(redirectUriOverride);
  
  console.log("[googleAuth] Attempting to exchange authorization code for tokens...");
  console.log("[googleAuth] Using redirect URI:", redirectUriOverride || "default");
  console.log("[googleAuth] Code length:", code?.length || 0);
  
  let tokens;
  try {
    const response = await oAuth2Client.getToken(code);
    tokens = response.tokens;
    console.log("[googleAuth] Successfully exchanged code for tokens");
  } catch (err) {
    console.error("[googleAuth] Failed to exchange authorization code:", err.message);
    console.error("[googleAuth] Error details:", JSON.stringify(err.response?.data || err.message, null, 2));
    
    // Handle invalid_grant error specifically
    if (err.message?.includes("invalid_grant") || err.code === "invalid_grant" || err.response?.data?.error === "invalid_grant") {
      const errorDetails = err.response?.data?.error_description || err.message;
      console.error("[googleAuth] invalid_grant error - common causes:");
      console.error("[googleAuth] 1. Authorization code was already used (codes are single-use)");
      console.error("[googleAuth] 2. Authorization code expired (codes expire after ~10 minutes)");
      console.error("[googleAuth] 3. Redirect URI mismatch between auth URL and callback");
      console.error("[googleAuth] 4. Server clock is out of sync with Google's servers");
      
      throw new Error(`Invalid authorization code: ${errorDetails}. Please start a new authorization flow by visiting /api/gmail/oauth2/url`);
    }
    
    throw err;
  }
  
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

// Function to force refresh the access token (used by background jobs)
export async function refreshAccessTokenIfNeeded() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Missing token.json. Authorize via /api/gmail/oauth2/url first.");
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  
  if (!tokens.refresh_token) {
    throw new Error("No refresh token available. Please re-authorize via /api/gmail/oauth2/url");
  }

  const oAuth2Client = createOAuthClient();
  
  // Force refresh if token expires within 45 minutes (aggressive to keep refresh token active)
  // This ensures we're actively using the refresh token regularly, which keeps it alive
  const fortyFiveMinutesFromNow = Date.now() + (45 * 60 * 1000);
  const shouldRefresh = !tokens.expiry_date || tokens.expiry_date <= fortyFiveMinutesFromNow;
  
  if (shouldRefresh) {
    const minutesUntilExpiry = tokens.expiry_date ? Math.round((tokens.expiry_date - Date.now()) / 60000) : 'unknown';
    console.log(`[refreshAccessTokenIfNeeded] Token expires in ${minutesUntilExpiry} minutes, refreshing...`);
    console.log(`[refreshAccessTokenIfNeeded] Refresh token preview: ${tokens.refresh_token.substring(0, 20)}...`);
    
    try {
      oAuth2Client.setCredentials({
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
        token_type: tokens.token_type || "Bearer",
      });
      
      const { credentials } = await oAuth2Client.refreshAccessToken();
      const newTokens = { ...tokens, ...credentials };
      
      // CRITICAL: Preserve refresh_token - Google doesn't always return it on refresh
      // Verify refresh_token is preserved
      if (!newTokens.refresh_token && tokens.refresh_token) {
        console.log("[refreshAccessTokenIfNeeded] Refresh token not in response, preserving existing one");
        newTokens.refresh_token = tokens.refresh_token;
      } else if (newTokens.refresh_token && newTokens.refresh_token !== tokens.refresh_token) {
        console.log("[refreshAccessTokenIfNeeded] New refresh token received from Google");
      } else {
        console.log("[refreshAccessTokenIfNeeded] Refresh token preserved successfully");
      }
      
      // Verify refresh token was saved
      if (!newTokens.refresh_token) {
        throw new Error("CRITICAL: Refresh token was lost during refresh! This should not happen.");
      }
      
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(newTokens, null, 2));
      
      // Verify it was saved correctly
      const verifyTokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
      if (!verifyTokens.refresh_token) {
        throw new Error("CRITICAL: Refresh token was not saved to token.json!");
      }
      
      console.log(`[refreshAccessTokenIfNeeded] Token refreshed successfully. New expiry: ${newTokens.expiry_date ? new Date(newTokens.expiry_date).toISOString() : 'unknown'}`);
      console.log(`[refreshAccessTokenIfNeeded] Refresh token preserved: ${verifyTokens.refresh_token.substring(0, 20)}...`);
      
      // Clear cache to force new client creation with fresh token
      clearTokenCache();
      
      return newTokens;
    } catch (err) {
      console.error("[refreshAccessTokenIfNeeded] Failed to refresh token:", err.message);
      
      // Parse error data - could be in response.data or as JSON string in message
      let errorData = err.response?.data || {};
      if (typeof err.message === 'string' && err.message.startsWith('{')) {
        try {
          errorData = JSON.parse(err.message);
        } catch (e) {
          // Not JSON, use message as-is
        }
      }
      console.error("[refreshAccessTokenIfNeeded] Error details:", JSON.stringify(errorData, null, 2));
      
      // Check for RAPT (Risk-Aware Protection Token) error - Google security feature
      if (errorData.error_subtype === "invalid_rapt" || 
          errorData.error_subtype === "rapt_required" ||
          errorData.error_description?.includes("invalid_rapt") ||
          errorData.error_description?.includes("reauth related error") ||
          err.message?.includes("invalid_rapt") ||
          err.message?.includes("rapt_required")) {
        console.error("[refreshAccessTokenIfNeeded] RAPT (Risk-Aware Protection Token) required by Google");
        console.error("[refreshAccessTokenIfNeeded] This is a Google security feature that requires re-authorization");
        console.error("[refreshAccessTokenIfNeeded] Solution: Delete token.json and reauthorize via /api/gmail/oauth2/url");
        throw new Error("RAPT required - Google security policy requires re-authorization. Please delete token.json and visit /api/gmail/oauth2/url to re-authorize.");
      }
      
      // Check if refresh token is still in file
      try {
        const currentTokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
        if (currentTokens.refresh_token) {
          console.log("[refreshAccessTokenIfNeeded] Refresh token still exists in token.json after error");
        } else {
          console.error("[refreshAccessTokenIfNeeded] CRITICAL: Refresh token missing from token.json after error!");
        }
      } catch (readErr) {
        console.error("[refreshAccessTokenIfNeeded] Failed to verify refresh token after error:", readErr.message);
      }
      
      throw err;
    }
  } else {
    const minutesRemaining = Math.round((tokens.expiry_date - Date.now()) / 60000);
    console.log(`[refreshAccessTokenIfNeeded] Token still valid for ${minutesRemaining} more minutes, skipping refresh`);
    console.log(`[refreshAccessTokenIfNeeded] Refresh token present: ${tokens.refresh_token ? 'YES' : 'NO'}`);
  }
  
  return tokens;
}

export async function getGmailClient() {
  // Check if we need to refresh before using cached client
  if (cachedGmail) {
    // If cached, still check if token needs refresh (but don't block)
    // The cached client will auto-refresh on API calls, but we want to be proactive
    try {
      await refreshAccessTokenIfNeeded().catch(() => {
        // If refresh fails, clear cache to force re-creation
        clearTokenCache();
      });
    } catch (err) {
      // Refresh failed, clear cache
      clearTokenCache();
      throw err;
    }
    return cachedGmail;
  }

  const oAuth2Client = createOAuthClient();
  
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Missing token.json. Authorize via /api/gmail/oauth2/url first.");
  }
  
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  
  // Validate that we have a refresh_token
  if (!tokens.refresh_token) {
    throw new Error("No refresh token available. Please re-authorize via /api/gmail/oauth2/url");
  }
  
  // Set up automatic token refresh handler BEFORE setting credentials
  // This will be called automatically by the OAuth2 client when tokens are refreshed
  oAuth2Client.on('tokens', (newTokens) => {
    console.log("[googleAuth] Tokens automatically refreshed by OAuth2 client");
    // Merge new tokens with existing ones (preserve refresh_token)
    const currentTokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    const updatedTokens = { ...currentTokens, ...newTokens };
    if (!updatedTokens.refresh_token && currentTokens.refresh_token) {
      updatedTokens.refresh_token = currentTokens.refresh_token;
    }
    // Save updated tokens to disk
    try {
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(updatedTokens, null, 2));
      console.log("[googleAuth] Updated tokens saved to token.json");
    } catch (err) {
      console.error("[googleAuth] Failed to save refreshed tokens:", err.message);
    }
  });
  
  // Check if access_token is blocked by reauth policy
  if (tokens.access_token === "blocked_by_reauth_policy" || !tokens.access_token || tokens.access_token === "") {
    console.log("[googleAuth] Access token is blocked or missing, refreshing immediately...");
    
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
      console.error("[googleAuth] Error details:", JSON.stringify(err.response?.data || err.message, null, 2));
      
      // Check if it's a RAPT (Risk-Aware Protection Token) error - Google security feature
      const errorData = err.response?.data || (typeof err.message === 'string' ? (err.message.startsWith('{') ? JSON.parse(err.message) : {}) : {}) || {};
      if (err.message?.includes("rapt_required") || 
          err.message?.includes("invalid_rapt") ||
          errorData.error_subtype === "rapt_required" ||
          errorData.error_subtype === "invalid_rapt" ||
          errorData.error_description?.includes("invalid_rapt") ||
          errorData.error_description?.includes("reauth related error")) {
        console.warn("[googleAuth] RAPT (Risk-Aware Protection Token) required by Google security policy.");
        console.warn("[googleAuth] This is a Google security feature that requires re-authorization.");
        console.warn("[googleAuth] The refresh_token may also be blocked until re-authorization.");
        throw new Error("RAPT required - Google security policy requires re-authorization. Please visit /api/gmail/oauth2/url to re-authorize.");
      }
      
      // Check if refresh token is invalid
      if (err.message?.includes("invalid_grant") || err.code === "invalid_grant") {
        console.error("[googleAuth] Refresh token is invalid. This usually means:");
        console.error("[googleAuth] 1. The token was revoked by the user");
        console.error("[googleAuth] 2. The token expired (unlikely but possible)");
        console.error("[googleAuth] 3. The OAuth client credentials changed");
        throw new Error("Refresh token is invalid. Please re-authorize via /api/gmail/oauth2/url");
      }
      
      throw new Error("Token is blocked by reauth policy and refresh failed. Please re-authorize via /api/gmail/oauth2/url");
    }
  }
  
  oAuth2Client.setCredentials(tokens);

  // Refresh token if expired or expiring soon (within 15 minutes)
  // More proactive check to prevent token expiration during API calls
  const fifteenMinutesFromNow = Date.now() + (15 * 60 * 1000);
  if (!tokens.expiry_date || tokens.expiry_date <= fifteenMinutesFromNow) {
    const reason = !tokens.expiry_date 
      ? "no expiry date found" 
      : tokens.expiry_date <= Date.now() 
        ? "expired" 
        : `expiring in ${Math.round((tokens.expiry_date - Date.now()) / 60000)} minutes`;
    console.log(`[googleAuth] Token ${reason}, refreshing proactively...`);
    try {
      // Set credentials with refresh_token first, then refresh
      oAuth2Client.setCredentials({
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token, // Include existing access token if present
        expiry_date: tokens.expiry_date,
        token_type: tokens.token_type || "Bearer",
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
      
      // Parse error data - could be in response.data or as JSON string in message
      let errorData = err.response?.data || {};
      let errorMessageStr = err.message || '';
      
      // Try to parse error message if it's a JSON string
      if (typeof errorMessageStr === 'string') {
        // Check if it looks like JSON
        const trimmed = errorMessageStr.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed);
            errorData = { ...errorData, ...parsed }; // Merge with response.data if exists
          } catch (e) {
            // Not valid JSON, use as-is
          }
        }
      }
      
      console.error("[googleAuth] Error details:", JSON.stringify(errorData, null, 2));
      
      // Check for RAPT error first (before generic invalid_grant)
      // RAPT errors have error_subtype: "invalid_rapt" or error_description contains "invalid_rapt"
      const isRaptError = 
        errorData.error_subtype === "invalid_rapt" || 
        errorData.error_subtype === "rapt_required" ||
        errorData.error_description?.includes("invalid_rapt") ||
        errorData.error_description?.includes("reauth related error") ||
        errorMessageStr.includes("invalid_rapt") ||
        errorMessageStr.includes("rapt_required");
      
      if (isRaptError) {
        console.error("[googleAuth] RAPT (Risk-Aware Protection Token) required by Google");
        console.error("[googleAuth] This is a Google security feature that requires re-authorization");
        console.error("[googleAuth] Solution: Delete token.json and reauthorize via /api/gmail/oauth2/url");
        throw new Error("RAPT required - Google security policy requires re-authorization. Please delete token.json and visit /api/gmail/oauth2/url to re-authorize.");
      }
      
      // If refresh fails with invalid_grant, the refresh token is likely invalid
      // This can happen if:
      // 1. Token was revoked by user
      // 2. Token was issued for different OAuth client
      // 3. Token expired (rare for refresh tokens, but can happen if not used for 6+ months)
      if (err.message?.includes("invalid_grant") || err.code === "invalid_grant" || errorData.error === "invalid_grant") {
        console.error("[googleAuth] Refresh token is invalid - invalid_grant error");
        console.error("[googleAuth] Error details:", JSON.stringify(errorData, null, 2));
        console.error("[googleAuth] To fix: Delete token.json and visit /api/gmail/oauth2/url to re-authorize.");
        // Throw an error so callers can handle it properly
        throw new Error("Refresh token is invalid (invalid_grant). Please delete token.json and re-authorize via /api/gmail/oauth2/url");
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

// Legacy JWT support  (still available for other Google APIs if needed)
export function getGoogleJwtClient(scopes = DEFAULT_SCOPES) {
  if (cachedAuth && !cachedAuth.credentials) {
    // If we have OAuth2 client, use it
    return cachedAuth;
  }
  
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
