# DNS Fix Guide - spotops360.com ERR_NAME_NOT_RESOLVED

## Problem
The domain `spotops360.com` is not resolving, causing `ERR_NAME_NOT_RESOLVED` errors on the live site.

## Quick Diagnostic Steps

### Step 1: Check DNS Records
Run these commands from your local machine or terminal:

```bash
# Check current DNS resolution
nslookup spotops360.com
nslookup www.spotops360.com

# Using dig (more detailed)
dig spotops360.com
dig www.spotops360.com

# Using Google DNS
dig @8.8.8.8 spotops360.com
dig @8.8.8.8 www.spotops360.com
```

**Expected result:** Should return an IP address (either `13.203.40.170` or `13.232.37.47`)
**If you see "NXDOMAIN" or no answer:** DNS records are missing or incorrect

### Step 2: Test Server by IP
Test if the servers are running:

```bash
# Test old server
curl http://13.203.40.170/api/health

# Test new server  
curl http://13.232.37.47/api/health
```

**If both work:** Servers are running, only DNS needs fixing
**If neither works:** Server issue needs to be resolved first

## Fix Options

### Option 1: Fix DNS Records (Recommended)

1. **Find your DNS provider:**
   - Check where you registered `spotops360.com` (Namecheap, GoDaddy, Route53, etc.)
   - Or check who manages DNS: `whois spotops360.com`

2. **Access DNS Management Panel:**
   - Log into your DNS provider
   - Find "DNS Management" or "DNS Records" section

3. **Verify/Add A Records:**
   
   Required records:
   ```
   Type: A
   Name: @ (or spotops360.com)
   Value: 13.232.37.47 (or 13.203.40.170 if using old server)
   TTL: 300 (5 minutes) or 3600 (1 hour)
   
   Type: A
   Name: www
   Value: 13.232.37.47 (or 13.203.40.170 if using old server)
   TTL: 300 (5 minutes) or 3600 (1 hour)
   ```

4. **If using Route 53:**
   - Go to AWS Console → Route 53 → Hosted Zones
   - Select `spotops360.com` hosted zone
   - Edit/create A records as above

5. **Wait for DNS propagation:**
   - TTL determines how long it takes (usually 5 minutes to 1 hour)
   - Check propagation: https://www.whatsmydns.net/#A/spotops360.com

### Option 2: Verify Nameservers

If DNS records exist but still not resolving, check nameservers:

```bash
# Check nameservers
dig NS spotops360.com

# Should return something like:
# ns-xxx.awsdns-xx.com
# ns-yyy.awsdns-yy.net
```

**If nameservers are wrong:**
1. Update nameservers at your domain registrar
2. Use the nameservers from your DNS provider (Route 53, Cloudflare, etc.)
3. Wait 24-48 hours for nameserver propagation

### Option 3: Temporary Workaround (Development Only)

If you need immediate access for testing, you can modify your local hosts file:

**Windows:**
```powershell
# Run PowerShell as Administrator
notepad C:\Windows\System32\drivers\etc\hosts

# Add this line:
13.232.37.47 spotops360.com www.spotops360.com
```

**Mac/Linux:**
```bash
sudo nano /etc/hosts

# Add this line:
13.232.37.47 spotops360.com www.spotops360.com
```

**⚠️ Warning:** This only works on your local machine and is NOT a solution for the live site.

## Verify Server Configuration

Once DNS is fixed, verify server can handle the domain:

```bash
# SSH into server
ssh ubuntu@13.232.37.47  # or 13.203.40.170

# Check nginx config
sudo cat /etc/nginx/sites-available/spotops360

# Should have:
# server_name spotops360.com www.spotops360.com;

# If not, update it:
sudo nano /etc/nginx/sites-available/spotops360
# Change server_name line to include both domains
sudo nginx -t
sudo systemctl reload nginx

# Check if application is running
pm2 list
pm2 logs spotops360-api --lines 20
```

## After Fixing DNS

1. **Wait 5-15 minutes** for DNS propagation
2. **Clear browser cache** or use incognito mode
3. **Test the domain:**
   ```bash
   curl http://spotops360.com/api/health
   curl http://www.spotops360.com/api/health
   ```
4. **Check browser console** - errors should be gone

## Common Issues

### Issue: DNS shows old IP but site doesn't work
- **Check:** Server on that IP is running
- **Check:** Nginx is configured correctly
- **Check:** PM2 process is running

### Issue: DNS propagation is slow
- **Solution:** Lower TTL to 300 seconds (5 minutes)
- **Wait:** Can take up to 48 hours for full global propagation

### Issue: SSL certificate errors
- **Check:** SSL certificate exists on server
- **Check:** Nginx SSL configuration is correct
- **May need:** Re-generate SSL certificate for new IP

## Need Help?

Provide these details:
1. DNS query results: `dig spotops360.com`
2. Server IP test: `curl http://[SERVER_IP]/api/health`
3. Nginx config: `cat /etc/nginx/sites-available/spotops360`
4. PM2 status: `pm2 list`
