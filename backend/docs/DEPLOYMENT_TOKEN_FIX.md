# Deploying Gmail Token Fix to Production

## Important: Manual Reauthorization Required

When you deploy the updated code to production, you **must** manually reauthorize Gmail to get a new refresh token.

## Step-by-Step Deployment

### 1. Deploy the Code
```bash
# On your production server
cd /var/www/spotopsCRMv2
git pull  # or however you deploy
npm install  # if needed
```

### 2. Delete the Old Token
```bash
# Delete the invalid token.json
rm /var/www/spotopsCRMv2/backend/token.json
```

### 3. Restart the Server
```bash
pm2 restart spotops3
# or however you restart your server
```

### 4. Reauthorize Gmail
- Visit: `https://www.spotops360.com/api/gmail/oauth2/url`
- Click "Authorize Gmail Access"
- Sign in with `sales@50starsautoparts.com`
- Grant all permissions
- You should see a success message

### 5. Verify It Works
- Check server logs - should see successful token refresh messages
- Test the Leads page - should load Gmail messages
- Check health endpoint: `https://www.spotops360.com/api/gmail/health`

## After Reauthorization

Once you get a new refresh token:
- **Automatic refresh will work** - the code will refresh tokens every 20 minutes
- **No daily reauthorization needed** - unless Google requires RAPT again
- **Token will persist** - until Google security policy requires reauthorization

## Why This Is Needed

The old token.json on production has an invalid refresh token (blocked by RAPT). The new code can detect RAPT errors better, but it cannot fix an already-invalid token. You need to delete the old token and get a fresh one.

## Monitoring

After deployment, monitor the logs:
```bash
pm2 logs spotops3
```

Look for:
- `[Token Refresh Job] Token refresh check completed successfully` - Good!
- `[Token Refresh Job] RAPT required` - Need to reauthorize again
- `[Token Refresh Job] Refresh token invalid` - Need to reauthorize

## Health Check Endpoint

You can check token status anytime:
```
GET https://www.spotops360.com/api/gmail/health
```

Returns JSON with:
- `status`: Token health status
- `needsReauth`: Whether reauthorization is needed
- `reauthUrl`: Direct link to reauthorize
