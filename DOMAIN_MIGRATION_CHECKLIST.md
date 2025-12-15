# Domain Migration Checklist: www.spotops360.com

## Current Status
- **Old Server IP**: 13.203.40.170
- **New Server IP**: 13.232.37.47
- **Current DNS**: Points to old server (13.203.40.170)
- **New Server Status**: Accessible via HTTP (200 OK)

## Pre-Migration Verification Steps

### 1. Verify New Server Configuration
Run these commands on the new server (SSH into 13.232.37.47):

```bash
# Check if application is running
pm2 list

# Check Nginx configuration
sudo nginx -t
cat /etc/nginx/sites-available/spotops360

# Check if SSL certificate exists
sudo certbot certificates
# OR
ls -la /etc/letsencrypt/live/spotops360.com/

# Test application directly
curl http://localhost:3000  # or whatever port your app runs on
```

### 2. Nginx Configuration Check
Ensure `/etc/nginx/sites-available/spotops360` has:
- Server block for `www.spotops360.com`
- SSL configuration (if using HTTPS)
- Proper proxy_pass to your application
- Enabled site: `sudo ln -s /etc/nginx/sites-available/spotops360 /etc/nginx/sites-enabled/`

### 3. SSL Certificate Setup
If using Let's Encrypt:
```bash
# Check certificate
sudo certbot certificates

# If certificate doesn't exist for new IP, you may need to:
# Option A: Use DNS challenge (recommended for zero downtime)
sudo certbot certonly --manual --preferred-challenges dns -d spotops360.com -d www.spotops360.com

# Option B: Temporarily point domain to new IP, then get certificate
# (This causes brief downtime)
```

### 4. Database Verification
- Ensure database is synced/backed up
- Check application can connect to database
- Verify data integrity

### 5. Application Testing
Test these on new server via IP (http://13.232.37.47/):
- [ ] Login functionality
- [ ] Database connectivity
- [ ] API endpoints
- [ ] File uploads/downloads
- [ ] Critical workflows

## Migration Steps

### Step 1: Pre-Migration (Do this first)
1. ✅ Verify new server is fully operational
2. ✅ Test all functionality via IP address
3. ✅ Ensure SSL certificate is ready (or use DNS challenge)
4. ✅ Keep old server running

### Step 2: DNS Update
Update DNS A record:
- **Record Type**: A
- **Name**: www (or @ for root domain)
- **Value**: Change from `13.203.40.170` to `13.232.37.47`
- **TTL**: Set to 300 (5 minutes) for faster propagation

**Where to update:**
- Your domain registrar's DNS management panel
- Or your DNS hosting provider (Cloudflare, Route53, etc.)

### Step 3: Monitor Propagation
```bash
# Check DNS propagation
nslookup www.spotops360.com
dig www.spotops360.com
# Or use online tools: whatsmydns.net
```

### Step 4: Post-Migration
1. Monitor application logs on new server
2. Check for any errors
3. Verify SSL certificate auto-renewal
4. Keep old server running for 24-48 hours as backup

## Zero-Downtime Strategy

1. **Both servers running**: Old and new servers should both be operational
2. **DNS propagation**: Users will gradually switch to new server (1-4 hours typically)
3. **Rollback plan**: If issues occur, revert DNS back to old IP immediately

## Rollback Plan

If issues occur after DNS change:
1. Revert DNS A record back to `13.203.40.170`
2. Monitor old server to ensure it's still operational
3. Investigate issues on new server
4. Fix and retry migration

## Estimated Timeline

- **Pre-migration checks**: 15-30 minutes
- **DNS update**: 2 minutes
- **DNS propagation**: 1-4 hours (most users)
- **Full global propagation**: Up to 48 hours
- **Monitoring period**: 24-48 hours

## Notes

- Keep old server running during entire migration
- Monitor both servers during propagation
- Have rollback plan ready
- Test thoroughly before DNS change


