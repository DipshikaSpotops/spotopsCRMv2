import { google } from "googleapis";

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/pubsub",
];

let cachedAuth;
let cachedGmail;

export function getGoogleJwtClient(scopes = DEFAULT_SCOPES) {
  if (cachedAuth) return cachedAuth;

  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  const privateKey = process.env.GCP_PRIVATE_KEY;
  const userToImpersonate = process.env.GMAIL_IMPERSONATED_USER;

  if (!clientEmail || !privateKey || !userToImpersonate) {
    throw new Error(
      "Google credentials missing. Ensure GCP_CLIENT_EMAIL, GCP_PRIVATE_KEY, and GMAIL_IMPERSONATED_USER are set."
    );
  }

  cachedAuth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes,
    subject: userToImpersonate,
  });

  return cachedAuth;
}

export function getGmailClient() {
  if (cachedGmail) return cachedGmail;

  cachedGmail = google.gmail({
    version: "v1",
    auth: getGoogleJwtClient(),
  });

  return cachedGmail;
}

