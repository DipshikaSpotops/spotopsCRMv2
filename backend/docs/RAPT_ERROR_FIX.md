# Fixing RAPT (Risk-Aware Protection Token) Error

## 🔒 What is RAPT?

**RAPT** (Risk-Aware Protection Token) is a Google security feature that requires additional verification when Google detects:
- Unusual account activity
- High-risk access patterns
- Security policy violations
- Account security concerns

## ❌ Error Message

You're seeing this error:
```
"error": "invalid_grant",
"error_description": "reauth related error (invalid_rapt)",
"error_subtype": "invalid_rapt"
```

## ✅ Solution

### Step 1: Reauthorize Gmail Access

1. **Delete the old token:**
   ```bash
   # On Windows (PowerShell)
   Remove-Item backend\token.json
   
   # On Linux/Mac
   rm backend/token.json
   ```

2. **Reauthorize:**
   - Visit: `http://localhost:5000/api/gmail/oauth2/url` (or your production URL)
   - Click "Authorize Gmail Access"
   - Sign in with `sales@50starsautoparts.com`
   - Grant all permissions
   - You should see a success message

3. **Verify it worked:**
   ```bash
   node backend/scripts/testTokenRefresh.js
   ```

### Step 2: Check GCP Settings (If Still Failing)

Even though your app is "In production", verify these settings:

#### A. OAuth Consent Screen
- **Location:** https://console.cloud.google.com/apis/credentials/consent
- **Check:**
  - Publishing status: Should be "In production" ✅ (you have this)
  - User type: External (this is fine)

#### B. OAuth 2.0 Client ID
- **Location:** https://console.cloud.google.com/apis/credentials
- **Check:**
  - **Authorized redirect URIs** must include:
    - `http://localhost:5000/api/gmail/oauth2/callback`
    - `https://www.spotops360.com/api/gmail/oauth2/callback` (or your production URL)
  - **Important:** Must match EXACTLY (including http vs https, trailing slashes, etc.)

#### C. Scopes
- **Location:** OAuth consent screen → Scopes
- **Verify all required scopes are added:**
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.modify`
  - `https://www.googleapis.com/auth/pubsub`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
  - `openid`

### Step 3: Check Google Account Security

RAPT errors can also be triggered by Google account security settings:

1. **Check Google Account Security:**
   - Go to: https://myaccount.google.com/security
   - Check for any security alerts
   - Verify 2-Step Verification is enabled (recommended)
   - Check "Recent security activity" for any suspicious activity

2. **Check if Account is Restricted:**
   - Go to: https://myaccount.google.com/permissions
   - Look for your app in "Third-party apps with account access"
   - If you see restrictions, remove and re-add

3. **Check Admin Settings (if using Google Workspace):**
   - If `sales@50starsautoparts.com` is a Google Workspace account
   - Admin may have security policies that trigger RAPT
   - Contact your Google Workspace admin if needed

## 🔍 Why This Happens

RAPT errors occur when Google's security systems detect:
1. **Unusual access patterns** - Multiple rapid token refreshes
2. **Account security concerns** - Suspicious login activity
3. **Policy violations** - App doesn't meet security requirements
4. **High-risk operations** - Accessing sensitive data frequently

## 🛡️ Prevention Tips

1. **Don't refresh tokens too frequently**
   - Current code refreshes every 20 minutes (this is fine)
   - Don't manually refresh more than needed

2. **Use consistent IP addresses**
   - If possible, use the same server/IP for token operations
   - Avoid switching between different networks frequently

3. **Keep OAuth app secure**
   - Don't share credentials.json
   - Use environment variables for sensitive data
   - Keep GCP project secure

4. **Monitor token usage**
   - Check server logs for frequent refresh failures
   - If RAPT errors persist, contact Google Support

## 📞 If Problem Persists

If reauthorization doesn't fix it:

1. **Wait 24 hours** - Sometimes RAPT restrictions are temporary
2. **Check Google Account** - Ensure no security issues
3. **Contact Google Support** - If using Google Workspace, contact your admin
4. **Check GCP Quotas** - Ensure you're not hitting API limits

## 🔗 Useful Links

- [Google OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
- [OAuth 2.0 Client IDs](https://console.cloud.google.com/apis/credentials)
- [Google Account Security](https://myaccount.google.com/security)
- [Google Support - RAPT](https://support.google.com/a/answer/9368756)

## ✅ Quick Fix Checklist

- [ ] Delete `backend/token.json`
- [ ] Visit `/api/gmail/oauth2/url` and reauthorize
- [ ] Verify redirect URIs match exactly in GCP
- [ ] Check Google Account security settings
- [ ] Test with `node backend/scripts/testTokenRefresh.js`
- [ ] Monitor server logs for success
