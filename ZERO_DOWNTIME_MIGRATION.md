# Zero-Downtime Domain Migration Guide
## Migrating spotops360.com to 13.232.37.47

This guide ensures **zero downtime** when shifting the domain from the current server to the new IP `13.232.37.47`.

## Prerequisites

- Access to both servers (current and new)
- DNS management access for `spotops360.com`
- MongoDB connection string (shared or replicated)
- All environment variables and credentials

---

## Phase 1: Pre-Migration Setup (New Server)

### Step 1: Set Up New Server at 13.232.37.47

1. **SSH into new server:**
   ```bash
   ssh ubuntu@13.232.37.47
   ```

2. **Install dependencies:**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js (if not installed)
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PM2
   sudo npm install -g pm2
   
   # Install nginx (if not installed)
   sudo apt install nginx -y
   ```

3. **Clone and set up application:**
   ```bash
   # Create app directory
   sudo mkdir -p /var/www/spotopsCRMv2
   sudo chown -R $USER:$USER /var/www/spotopsCRMv2
   
   # Clone repository
   cd /var/www/spotopsCRMv2
   git clone <your-repo-url> .
   
   # Or if already cloned, pull latest
   git pull origin main
   ```

4. **Copy environment files:**
   ```bash
   # Copy .env from current server to new server
   # On CURRENT server:
   scp backend/.env ubuntu@13.232.37.47:/var/www/spotopsCRMv2/backend/.env
   
   # Copy credentials.json and token.json (if needed)
   scp backend/credentials.json ubuntu@13.232.37.47:/var/www/spotopsCRMv2/backend/credentials.json
   scp backend/token.json ubuntu@13.232.37.47:/var/www/spotopsCRMv2/backend/token.json
   ```

5. **Install dependencies and build:**
   ```bash
   cd /var/www/spotopsCRMv2/backend
   npm install --production
   
   cd ../client
   npm install
   npm run build
   ```

6. **Set up PM2:**
   ```bash
   cd /var/www/spotopsCRMv2
   chmod +x scripts/setup-deploy.sh
   ./scripts/setup-deploy.sh
   ```

7. **Start application (but don't expose to domain yet):**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   ```

8. **Configure nginx for new server:**
   ```bash
   sudo nano /etc/nginx/sites-available/spotops360
   ```

   Add this configuration:
   ```nginx
   server {
       listen 80;
       server_name 13.232.37.47;  # Use IP for now
       
       # Frontend
       location / {
           root /var/www/spotopsCRMv2/client/dist;
           try_files $uri $uri/ /index.html;
       }
       
       # Backend API
       location /api {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
       
       # WebSocket support
       location /socket.io {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
       }
   }
   ```

   ```bash
   sudo ln -s /etc/nginx/sites-available/spotops360 /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

9. **Test new server directly via IP:**
   ```bash
   # Test backend
   curl http://13.232.37.47/api/health
   
   # Test frontend
   curl http://13.232.37.47/
   ```

---

## Phase 2: DNS Preparation (Zero-Downtime Strategy)

### Strategy: Dual DNS Records with Health Checks

We'll use **DNS with low TTL** and **health checks** to ensure zero downtime.

### Step 1: Reduce DNS TTL (Do this FIRST, 24-48 hours before migration)

1. **Check current TTL:**
   ```bash
   dig spotops360.com
   # Look for TTL value (usually 3600 seconds = 1 hour)
   ```

2. **Reduce TTL to 60 seconds** (or minimum allowed by your DNS provider):
   - Go to your DNS provider (Cloudflare, Route53, etc.)
   - Find the A record for `spotops360.com`
   - Change TTL to **60 seconds** (or minimum allowed)
   - **Wait 24-48 hours** for old TTL to expire

   **Why?** This allows quick DNS changes during migration.

### Step 2: Verify Both Servers Are Running

```bash
# Test current server
curl https://spotops360.com/api/health

# Test new server
curl http://13.232.37.47/api/health
```

Both should return healthy responses.

---

## Phase 3: Migration Execution (Zero-Downtime)

### Option A: Simple DNS Switch (Recommended if TTL is low)

1. **Ensure both servers are running and healthy**

2. **Update DNS A record:**
   - Go to your DNS provider
   - Change A record for `spotops360.com` from current IP → `13.232.37.47`
   - Save changes

3. **Monitor migration:**
   ```bash
   # Watch DNS propagation
   watch -n 5 'dig +short spotops360.com'
   
   # Monitor both servers
   # Old server (should see traffic decrease)
   pm2 logs spotops360-api --lines 50
   
   # New server (should see traffic increase)
   ssh ubuntu@13.232.37.47
   pm2 logs spotops360-api --lines 50
   ```

4. **With 60-second TTL, migration completes in ~2-5 minutes**

### Option B: Gradual Migration with Load Balancer (Advanced)

If you want even smoother migration:

1. **Set up a simple load balancer** (nginx on a third server) or use AWS ELB/Cloudflare Load Balancer
2. **Point both servers to load balancer**
3. **Gradually shift traffic** from old → new server
4. **Once 100% on new server, update DNS directly to new IP**

---

## Phase 4: Post-Migration Verification

### Step 1: Verify DNS Propagation

```bash
# Check from multiple locations
dig spotops360.com @8.8.8.8
dig spotops360.com @1.1.1.1
nslookup spotops360.com

# Should return: 13.232.37.47
```

### Step 2: Test Application

1. **Backend health:**
   ```bash
   curl https://spotops360.com/api/health
   ```

2. **Frontend:**
   - Visit `https://spotops360.com` in browser
   - Test login, navigation, all features

3. **API endpoints:**
   - Test critical API calls
   - Check MongoDB connections
   - Verify Gmail OAuth (if applicable)

### Step 3: Monitor for 24 Hours

```bash
# On new server, monitor logs
pm2 logs spotops360-api --lines 100

# Check error rates
pm2 monit

# Monitor nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Phase 5: SSL Certificate Setup (If Using HTTPS)

If you're using HTTPS, set up SSL certificate on new server:

### Option 1: Let's Encrypt (Free)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot --nginx -d spotops360.com -d www.spotops360.com

# Auto-renewal (already set up by certbot)
sudo certbot renew --dry-run
```

### Option 2: Existing Certificate

If you have an existing certificate:

```bash
# Copy certificate files from old server
scp /etc/nginx/ssl/spotops360.com.crt ubuntu@13.232.37.47:/tmp/
scp /etc/nginx/ssl/spotops360.com.key ubuntu@13.232.37.47:/tmp/

# On new server
sudo mkdir -p /etc/nginx/ssl
sudo mv /tmp/spotops360.com.* /etc/nginx/ssl/

# Update nginx config to use SSL
sudo nano /etc/nginx/sites-available/spotops360
```

Add SSL configuration:
```nginx
server {
    listen 443 ssl http2;
    server_name spotops360.com www.spotops360.com;
    
    ssl_certificate /etc/nginx/ssl/spotops360.com.crt;
    ssl_certificate_key /etc/nginx/ssl/spotops360.com.key;
    
    # ... rest of config
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name spotops360.com www.spotops360.com;
    return 301 https://$server_name$request_uri;
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Phase 6: Cleanup (After 48 Hours)

Once migration is confirmed stable:

1. **Stop old server** (optional, keep as backup for a week):
   ```bash
   # On old server
   pm2 stop spotops360-api
   ```

2. **Update DNS TTL back to normal** (3600 seconds or your preferred value)

3. **Remove old server DNS records** (if any)

---

## Rollback Plan (If Issues Occur)

If something goes wrong:

1. **Immediate rollback:**
   - Go to DNS provider
   - Change A record back to old server IP
   - With 60-second TTL, rollback completes in ~2-5 minutes

2. **Verify old server is still running:**
   ```bash
   # On old server
   pm2 status
   pm2 logs spotops360-api
   ```

3. **Investigate issues on new server** while traffic flows to old server

---

## Checklist

### Pre-Migration
- [ ] New server set up and tested via IP
- [ ] All environment variables copied
- [ ] MongoDB connection verified
- [ ] Application running on new server
- [ ] DNS TTL reduced to 60 seconds
- [ ] Waited 24-48 hours for TTL to expire

### Migration
- [ ] Both servers healthy and running
- [ ] DNS A record updated to new IP
- [ ] Monitoring both servers during migration
- [ ] DNS propagation verified

### Post-Migration
- [ ] Application fully functional
- [ ] All features tested
- [ ] SSL certificate configured (if HTTPS)
- [ ] Monitoring for 24 hours
- [ ] No errors in logs

### Cleanup
- [ ] Old server stopped (optional)
- [ ] DNS TTL restored to normal
- [ ] Documentation updated

---

## Troubleshooting

### DNS Not Propagating
- Check TTL was reduced in advance
- Clear DNS cache: `sudo systemd-resolve --flush-caches` (Linux) or `ipconfig /flushdns` (Windows)
- Use different DNS servers: `dig @8.8.8.8 spotops360.com`

### Application Errors on New Server
- Check PM2 logs: `pm2 logs spotops360-api`
- Check nginx logs: `sudo tail -f /var/log/nginx/error.log`
- Verify environment variables: `cat backend/.env`
- Verify MongoDB connection
- Check firewall: `sudo ufw status`

### SSL Certificate Issues
- Verify certificate files exist and have correct permissions
- Check nginx config: `sudo nginx -t`
- Review SSL logs: `sudo tail -f /var/log/nginx/error.log`

---

## Expected Downtime

**With proper preparation: 0-2 minutes**

- If TTL is 60 seconds: ~2-5 minutes for full propagation
- Most users will see new server within 1-2 minutes
- Some users may take up to 5 minutes (depending on their DNS cache)

---

## Support

If you encounter issues during migration:
1. Check logs on both servers
2. Verify DNS propagation
3. Test application endpoints
4. Rollback if necessary (change DNS back)

