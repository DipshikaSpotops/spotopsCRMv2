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

function createOAuthClient() {
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

  const redirectUri = web.redirect_uris?.[0] || process.env.GMAIL_OAUTH_REDIRECT_URI || "http://localhost:5000/api/gmail/oauth2/callback";
  
  return new google.auth.OAuth2(web.client_id, web.client_secret, redirectUri);
}

export function getAuthUrl() {
  const oAuth2Client = createOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DEFAULT_SCOPES,
  });
}

export async function setTokensFromCode(code) {
  const oAuth2Client = createOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  
  // Ensure token.json directory exists
  const tokenDir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(tokenDir)) {
    fs.mkdirSync(tokenDir, { recursive: true });
  }
  
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  
  // Get user email from token
  oAuth2Client.setCredentials(tokens);
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
  oAuth2Client.setCredentials(tokens);
  
  // Refresh token if expired
  if (tokens.expiry_date && tokens.expiry_date <= Date.now()) {
    console.log("[googleAuth] Token expired, refreshing...");
    try {
      const { credentials } = await oAuth2Client.refreshAccessToken();
      const newTokens = { ...tokens, ...credentials };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(newTokens, null, 2));
      oAuth2Client.setCredentials(newTokens);
    } catch (err) {
      console.error("[googleAuth] Failed to refresh token:", err.message);
      throw new Error("Token expired and refresh failed. Please re-authorize via /api/gmail/oauth2/url");
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
  return cachedUserEmail || process.env.GMAIL_IMPERSONATED_USER || null;
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
