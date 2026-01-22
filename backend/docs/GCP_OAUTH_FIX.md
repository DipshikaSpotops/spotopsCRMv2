# GCP OAuth Settings - Fix Daily Reauthorization

If you're having to reauthorize Gmail every day, check these settings in Google Cloud Platform (GCP).

## 🔍 Critical Checks in GCP

### 1. **OAuth Consent Screen Status** ⚠️ MOST IMPORTANT

**Location:** Google Cloud Console → APIs & Services → OAuth consent screen

**What to Check:**
- [ ] **Publishing Status**: Should be **"Published"** (not "Testing")
  - If it says "Testing", refresh tokens expire after **7 days**
  - Published apps have refresh tokens that don't expire (unless revoked)

**How to Fix:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **OAuth consent screen**
3. If status is "Testing":
   - Complete all required fields (App name, User support email, Developer contact)
   - Add all required scopes
   - Click **"PUBLISH APP"** button
   - Confirm publishing

**Note:** Publishing requires:
- App verification (for sensitive scopes like Gmail)
- Privacy policy URL
- Terms of service URL (sometimes)

---

### 2. **Test Users** (If Still in Testing Mode)

**Location:** OAuth consent screen → Test users

**What to Check:**
- [ ] Your Gmail account (`sales@50starsautoparts.com`) is listed as a **Test User**
- [ ] Any other accounts that need access are added

**How to Fix:**
1. In OAuth consent screen, scroll to **"Test users"** section
2. Click **"+ ADD USERS"**
3. Add: `sales@50starsautoparts.com`
4. Add any other email addresses that need access
5. Click **"SAVE"**

**Important:** If app is in Testing mode, ONLY test users can use it. Everyone else will get errors.

---

### 3. **OAuth 2.0 Client ID Configuration**

**Location:** APIs & Services → Credentials → OAuth 2.0 Client IDs

**What to Check:**
- [ ] **Application type**: Should be **"Web application"**
- [ ] **Authorized redirect URIs**: Must include your callback URL
  - `http://localhost:5000/api/gmail/oauth2/callback` (for local dev)
  - `https://www.spotops360.com/api/gmail/oauth2/callback` (for production)
- [ ] **Authorized JavaScript origins**: Should include your domain
  - `http://localhost:5000` (for local dev)
  - `https://www.spotops360.com` (for production)

**How to Fix:**
1. Go to **Credentials** → Click on your OAuth 2.0 Client ID
2. Under **"Authorized redirect URIs"**, add:
   ```
   http://localhost:5000/api/gmail/oauth2/callback
   https://www.spotops360.com/api/gmail/oauth2/callback
   ```
3. Under **"Authorized JavaScript origins"**, add:
   ```
   http://localhost:5000
   https://www.spotops360.com
   ```
4. Click **"SAVE"**

---

### 4. **Gmail API Enabled**

**Location:** APIs & Services → Enabled APIs

**What to Check:**
- [ ] **Gmail API** is enabled
- [ ] **Google+ API** or **People API** is enabled (for user info)

**How to Fix:**
1. Go to **APIs & Services** → **Library**
2. Search for "Gmail API"
3. Click on it and ensure it's **ENABLED**
4. Also enable **"Google+ API"** or **"People API"** if needed

---

### 5. **App Verification Status** (For Published Apps)

**Location:** OAuth consent screen → App verification

**What to Check:**
- [ ] If using sensitive scopes (Gmail), app may need verification
- [ ] Check for any verification warnings or requirements

**How to Fix:**
- If verification is required, you'll see a banner in the OAuth consent screen
- Follow the verification process (can take a few days)
- For internal/workspace apps, verification may not be required

---

### 6. **Scopes Configuration**

**Location:** OAuth consent screen → Scopes

**What to Check:**
- [ ] All required scopes are added:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.modify`
  - `https://www.googleapis.com/auth/pubsub`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
  - `openid`

**How to Fix:**
1. In OAuth consent screen, go to **"Scopes"** tab
2. Click **"+ ADD OR REMOVE SCOPES"**
3. Search and add all required scopes
4. Click **"UPDATE"** → **"SAVE AND CONTINUE"**

---

## 🎯 Quick Fix Checklist

Run through this checklist in order:

1. ✅ **Publish OAuth Consent Screen** (if in Testing mode)
   - This is the #1 cause of daily reauthorization
   - Testing mode = refresh tokens expire in 7 days
   - Published mode = refresh tokens don't expire

2. ✅ **Add Test Users** (if still in Testing mode)
   - Add `sales@50starsautoparts.com` to test users

3. ✅ **Verify Redirect URIs**
   - Must match exactly what your app uses
   - Check both localhost and production URLs

4. ✅ **Enable Required APIs**
   - Gmail API
   - People API or Google+ API

5. ✅ **Check App Verification**
   - If required, complete verification process

---

## 🔧 After Making Changes

1. **Wait 5-10 minutes** for changes to propagate
2. **Reauthorize** by visiting: `/api/gmail/oauth2/url`
3. **Check token.json** - should have `refresh_token` field
4. **Monitor logs** - should see successful token refreshes

---

## 📊 How to Verify It's Fixed

After making changes, check your server logs:

**Good signs:**
```
[Token Refresh] Initial token check completed successfully
[Token Refresh Job] Token refresh check completed successfully
[googleAuth] Token refreshed successfully
```

**Bad signs (still broken):**
```
[Token Refresh] ⚠️ Refresh token invalid
[googleAuth] Refresh token is invalid (invalid_grant)
```

---

## 🚨 Common Issues

### Issue: "App is in Testing mode"
**Solution:** Publish the OAuth consent screen

### Issue: "User is not a test user"
**Solution:** Add the user email to test users list

### Issue: "Redirect URI mismatch"
**Solution:** Add exact redirect URI to OAuth client settings

### Issue: "Refresh token expired"
**Solution:** 
- If app is published: Token shouldn't expire (check if it was revoked)
- If app is in testing: Publish the app to get permanent tokens

### Issue: "invalid_grant error"
**Solution:**
- Reauthorize via `/api/gmail/oauth2/url`
- Check if OAuth client credentials changed
- Verify redirect URI matches exactly

---

## 📝 Additional Notes

- **Testing Mode**: Refresh tokens expire after 7 days of inactivity
- **Published Mode**: Refresh tokens don't expire (unless revoked)
- **Token Revocation**: User can revoke access in their Google Account settings
- **Credential Changes**: If you regenerate OAuth client credentials, all tokens become invalid

---

## 🔗 Direct Links

- [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
- [OAuth 2.0 Client IDs](https://console.cloud.google.com/apis/credentials)
- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Enabled APIs](https://console.cloud.google.com/apis/dashboard)

---

## Need Help?

If issues persist after checking all of the above:
1. Check server logs for specific error messages
2. Verify `token.json` has a `refresh_token` field
3. Try reauthorizing with `prompt=consent` parameter
4. Check Google Cloud Console for any warnings or errors
