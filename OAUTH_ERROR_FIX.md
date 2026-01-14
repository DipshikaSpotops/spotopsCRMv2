# Fix OAuth "Invalid Authorization Code" Error

## Error Message
```
Invalid authorization code: Bad Request. Please start a new authorization flow by visiting /api/gmail/oauth2/url
```

## Quick Fix

**Simply start a fresh authorization:**

1. Visit: `http://localhost:5000/api/gmail/oauth2/url`
2. Click "Authorize Gmail Access"
3. Sign in and grant permissions
4. Complete the flow in one go (don't go back)

## Why This Error Happens

Authorization codes from Google are:
- **Single-use only** - Once used, they're invalid
- **Time-limited** - Expire after ~10 minutes
- **URI-specific** - Must match exactly between auth URL and callback

### Common Causes:

1. **Clicked "Back" or "BACK TO SAFETY"** on Google's warning page
   - Going back invalidates the code
   - Solution: Start fresh authorization

2. **Refresh/reload the callback page**
   - Refreshing tries to use the same code twice
   - Solution: Start fresh authorization

3. **Code expired**
   - If you wait >10 minutes between clicking "Authorize" and the callback
   - Solution: Complete authorization quickly, or start fresh

4. **Redirect URI mismatch**
   - The redirect URI in Google Cloud Console must exactly match what your app uses
   - For localhost: `http://localhost:5000/api/gmail/oauth2/callback`
   - For production: `https://yourdomain.com/api/gmail/oauth2/callback`

## Step-by-Step Fix

### For Local Development:

1. **Visit the OAuth URL:**
   ```
   http://localhost:5000/api/gmail/oauth2/url
   ```

2. **Click "Authorize Gmail Access" button**

3. **On Google's warning page:**
   - Click "Advanced" (bottom left)
   - Click "Go to spotops360.com (unsafe)" or similar
   - **DO NOT click "BACK TO SAFETY"**

4. **Grant permissions** - Click "Allow" on all requested permissions

5. **Wait for redirect** - You should see "✅ Gmail Connected Successfully!"

### For Production:

1. **Visit:** `https://yourdomain.com/api/gmail/oauth2/url`

2. **Follow the same steps** as local development

## Preventing the Google Warning Screen

The warning screen appears because your OAuth app is in "Testing" mode. To remove it:

### Option 1: Add Test Users (Quick Fix)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **OAuth consent screen**
3. Scroll to **Test users** section
4. Click **+ ADD USERS**
5. Add email addresses of users who need access
6. Save

**Note:** Only added users can use the app without seeing the warning.

### Option 2: Publish Your App (Recommended for Production)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **OAuth consent screen**
3. Click **PUBLISH APP** button (top right)
4. Confirm publication

**Important:** Publishing removes the warning but:
- You may need to verify your app with Google (if using sensitive scopes)
- Verification can take several days
- For Gmail API, verification is typically required

## Verify Redirect URI in Google Cloud Console

Make sure your redirect URI is correctly configured:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, verify these are listed:
   - `http://localhost:5000/api/gmail/oauth2/callback` (for dev)
   - `https://yourdomain.com/api/gmail/oauth2/callback` (for production)
5. Click **SAVE** if you made changes

## Still Not Working?

If the error persists after starting fresh:

1. **Check server logs** - Look for detailed error messages
2. **Verify credentials.json** exists in `backend/` folder
3. **Check token.json** - Delete it if present, then re-authorize:
   ```bash
   rm backend/token.json
   # Then visit /api/gmail/oauth2/url again
   ```
4. **Verify server time** - Ensure server clock is synchronized:
   ```bash
   # On Linux/Mac
   timedatectl status
   
   # On Windows, check Date & Time settings
   ```
5. **Check redirect URI exactly matches** - Compare:
   - What's in Google Cloud Console
   - What the server logs show when generating auth URL
   - What the server logs show when callback is received

## Best Practices

1. **Complete authorization in one session** - Don't navigate away
2. **Don't refresh the callback page** - Wait for automatic redirect
3. **Use the same browser/session** - Don't copy URLs between browsers
4. **For production, publish the app** - Prevents warning screens
5. **Monitor server logs** - Check for redirect URI mismatches
