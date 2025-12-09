# OAuth2 Setup Guide (Like lead-platform)

This guide will help you set up OAuth2 authentication for Gmail API, similar to the `lead-platform` project.

## Step 1: Get credentials.json from Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
5. If prompted, configure the OAuth consent screen first:
   - Choose **External** (unless you have Google Workspace)
   - Fill in required fields (App name, User support email, Developer contact)
   - Add scopes:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
   - Add test users (your email) if in testing mode
   - Save and continue
6. Back to Credentials:
   - Application type: **Web application**
   - Name: `Gmail CRM OAuth Client`
   - Authorized redirect URIs:
     - `http://localhost:5000/api/gmail/oauth2/callback` (for local dev)
     - `https://yourdomain.com/api/gmail/oauth2/callback` (for production)
   - Click **Create**
7. Download the JSON file and save it as `credentials.json` in the `backend` folder

## Step 2: Place credentials.json

Place the downloaded `credentials.json` file in:
```
backend/credentials.json
```

**Important:** Add `credentials.json` to `.gitignore` to keep it secure:
```gitignore
# Google OAuth credentials
credentials.json
token.json
```

## Step 3: Authorize the Application

1. Start your backend server
2. Visit: `http://localhost:5000/api/gmail/oauth2/url`
3. You'll get a JSON response with a `url` field
4. Copy that URL and open it in your browser
5. Sign in with the Gmail account you want to use for fetching leads
6. Grant permissions
7. You'll be redirected to the callback URL
8. You should see: "✅ Gmail Connected Successfully!"

After authorization, a `token.json` file will be created in the `backend` folder. This file contains your access and refresh tokens.

## Step 4: Verify Setup

1. Check that `token.json` was created in the `backend` folder
2. Visit the Leads page in your frontend
3. The "Gmail Account Used to Fetch Leads" should now show your email address

## Environment Variables (Optional)

You can still use environment variables as a fallback:

```env
# Optional: Fallback email if OAuth2 not configured
GMAIL_IMPERSONATED_USER=your-email@yourdomain.com

# Pub/Sub Configuration (still required for watch functionality)
GMAIL_PUBSUB_TOPIC=projects/your-project/topics/gmail-crm
GMAIL_PUBSUB_VERIFY_TOKEN=your-secret-token
GMAIL_WATCH_LABELS=INBOX,UNREAD
SALES_AGENT_EMAILS=agent1@yourdomain.com,agent2@yourdomain.com
```

## Troubleshooting

### "Missing credentials.json"
- Make sure `credentials.json` is in the `backend` folder
- Check the file path is correct

### "Missing token.json"
- Visit `/api/gmail/oauth2/url` and complete the OAuth flow
- Make sure you grant all requested permissions

### "Token expired"
- The system will automatically refresh tokens
- If refresh fails, re-authorize via `/api/gmail/oauth2/url`

### Email not showing in Leads page
- Check browser console for errors
- Verify `token.json` exists and contains valid tokens
- Check server logs for OAuth2 errors

## How It Works

1. **OAuth2 Flow**: User authorizes via Google OAuth2
2. **Token Storage**: Access and refresh tokens stored in `token.json`
3. **Email Extraction**: User email extracted from OAuth2 token
4. **Gmail API**: Uses OAuth2 tokens to access Gmail API
5. **Pub/Sub**: Still works with OAuth2 (no service account needed for basic Gmail access)

## Differences from Service Account (JWT)

- **OAuth2**: User-based authentication, requires user consent
- **Service Account (JWT)**: Service-based, requires domain-wide delegation
- **OAuth2 is simpler** for single-user or small team setups
- **Service Account is better** for enterprise/automated systems

