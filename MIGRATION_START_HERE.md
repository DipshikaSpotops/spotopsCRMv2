# Migration Guide: www.spotops360.com → 13.232.37.47

## Current Situation
- **Old Server**: `www.spotops360.com` (currently running, serving users)
- **New Server**: `13.232.37.47` (where we want to migrate to)
- **Goal**: Zero-downtime migration

---

## Step-by-Step Migration Process

### Phase 1: Backup Current Server (www.spotops360.com)

**⚠️ IMPORTANT: Backup the OLD server first, not the new one!**

1. **SSH into your OLD server** (www.spotops360.com):
   ```bash
   ssh ubuntu@[OLD_SERVER_IP]
   # Or if you have the domain SSH configured:
   ssh ubuntu@www.spotops360.com
   ```

2. **Navigate to your project**:
   ```bash
   cd /var/www/spotopsCRMv2
   ```

3. **Copy the backup script** (if not already there):
   ```bash
   # If you have the script locally, upload it:
   # From your local machine:
   scp scripts/backup-server.sh ubuntu@[OLD_SERVER_IP]:/var/www/spotopsCRMv2/scripts/
   ```

4. **Run the backup**:
   ```bash
   chmod +x scripts/backup-server.sh
   ./scripts/backup-server.sh
   ```

5. **Note the backup location** (you'll see it in the output):
   ```
   Backup Location: /var/backups/spotops360/20250115_143022/
   ```

6. **Download the backup to your local machine** (safety measure):
   ```bash
   # From your local machine:
   scp -r ubuntu@[OLD_SERVER_IP]:/var/backups/spotops360/[TIMESTAMP] ./backup-[TIMESTAMP]
   ```

---

### Phase 2: Set Up New Server (13.232.37.47)

1. **SSH into the NEW server**:
   ```bash
   ssh ubuntu@13.232.37.47
   ```

2. **Check what's currently running** (if anything):
   ```bash
   # Check if there's already an application
   ls -la /var/www/
   
   # Check if PM2 is running anything
   pm2 list
   
   # Check nginx
   sudo systemctl status nginx
   ```

3. **If there's already something running, backup it first**:
   ```bash
   # Copy backup script to new server
   scp scripts/backup-server.sh ubuntu@13.232.37.47:/tmp/
   
   # SSH into new server
   ssh ubuntu@13.232.37.47
   
   # Run backup
   chmod +x /tmp/backup-server.sh
   /tmp/backup-server.sh
   ```

4. **Set up the new server with your application**:

   **Option A: Use the migration script** (recommended):
   ```bash
   # Copy migration script to new server
   scp scripts/migrate-to-new-server.sh ubuntu@13.232.37.47:/tmp/
   
   # SSH into new server
   ssh ubuntu@13.232.37.47
   
   # Run setup
   chmod +x /tmp/migrate-to-new-server.sh
   /tmp/migrate-to-new-server.sh
   ```

   **Option B: Manual setup**:
   ```bash
   # Clone your repository
   cd /var/www
   sudo mkdir -p spotopsCRMv2
   sudo chown -R $USER:$USER spotopsCRMv2
   cd spotopsCRMv2
   git clone [YOUR_REPO_URL] .
   
   # Copy .env from old server
   scp ubuntu@[OLD_SERVER_IP]:/var/www/spotopsCRMv2/backend/.env ./backend/.env
   
   # Copy credentials (if needed)
   scp ubuntu@[OLD_SERVER_IP]:/var/www/spotopsCRMv2/backend/credentials.json ./backend/credentials.json
   scp ubuntu@[OLD_SERVER_IP]:/var/www/spotopsCRMv2/backend/token.json ./backend/token.json
   
   # Install and build
   cd backend && npm install --production
   cd ../client && npm install && npm run build
   
   # Set up PM2
   cd /var/www/spotopsCRMv2
   pm2 start ecosystem.config.js
   pm2 save
   ```

5. **Configure nginx on new server**:
   ```bash
   sudo nano /etc/nginx/sites-available/spotops360
   ```

   Add this configuration:
   ```nginx
   server {
       listen 80;
       server_name 13.232.37.47;  # Use IP for now, will change to domain later
       
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
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. **Test the new server via IP**:
   ```bash
   # Test backend
   curl http://13.232.37.47/api/health
   
   # Test frontend
   curl http://13.232.37.47/
   ```

   Or open in browser: `http://13.232.37.47`

---

### Phase 3: Verify Both Servers Are Running

**Before DNS migration, verify both servers work:**

1. **Test old server** (should still work):
   ```bash
   curl https://www.spotops360.com/api/health
   ```

2. **Test new server** (via IP):
   ```bash
   curl http://13.232.37.47/api/health
   ```

Both should return healthy responses.

---

### Phase 4: Prepare DNS for Zero-Downtime Migration

1. **Reduce DNS TTL** (do this 24-48 hours before migration):
   - Go to your DNS provider (where you manage spotops360.com)
   - Find the A record for `www.spotops360.com` (or `spotops360.com`)
   - Change TTL to **60 seconds** (or minimum allowed)
   - **Wait 24-48 hours** for old TTL to expire

2. **Note current DNS settings**:
   - Current A record IP: `[OLD_SERVER_IP]`
   - Will change to: `13.232.37.47`

---

### Phase 5: DNS Migration (The Actual Switch)

**⚠️ This is the critical moment - do this when ready!**

1. **Ensure both servers are running and healthy**

2. **Update DNS A record**:
   - Go to your DNS provider
   - Change A record for `www.spotops360.com` (or `spotops360.com`) 
   - From: `[OLD_SERVER_IP]`
   - To: `13.232.37.47`
   - Save changes

3. **Update nginx on new server** to accept domain name:
   ```bash
   ssh ubuntu@13.232.37.47
   sudo nano /etc/nginx/sites-available/spotops360
   ```

   Change:
   ```nginx
   server_name 13.232.37.47;
   ```
   
   To:
   ```nginx
   server_name spotops360.com www.spotops360.com;
   ```

   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **Monitor migration**:
   ```bash
   # Watch DNS propagation
   watch -n 5 'dig +short www.spotops360.com'
   
   # Monitor new server logs
   ssh ubuntu@13.232.37.47
   pm2 logs spotops360-api --lines 50
   ```

5. **With 60-second TTL, migration completes in ~2-5 minutes**

---

### Phase 6: Post-Migration Verification

1. **Verify DNS propagation**:
   ```bash
   dig www.spotops360.com @8.8.8.8
   # Should return: 13.232.37.47
   ```

2. **Test application**:
   - Visit `https://www.spotops360.com` in browser
   - Test login, navigation, all features
   - Check API endpoints

3. **Monitor for 24 hours**:
   ```bash
   pm2 logs spotops360-api
   pm2 monit
   ```

---

### Phase 7: SSL Certificate (If Using HTTPS)

If you're using HTTPS, set up SSL on new server:

```bash
ssh ubuntu@13.232.37.47
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d spotops360.com -d www.spotops360.com
```

---

## Quick Start Checklist

- [ ] **Phase 1**: Backup old server (www.spotops360.com)
- [ ] **Phase 2**: Set up new server (13.232.37.47)
- [ ] **Phase 3**: Verify both servers are running
- [ ] **Phase 4**: Reduce DNS TTL (wait 24-48 hours)
- [ ] **Phase 5**: Update DNS A record to new IP
- [ ] **Phase 6**: Update nginx server_name on new server
- [ ] **Phase 7**: Verify everything works
- [ ] **Phase 8**: Set up SSL certificate (if HTTPS)

---

## Rollback Plan

If something goes wrong:

1. **Immediate rollback**: Change DNS A record back to old server IP
2. **With 60-second TTL**: Rollback completes in ~2-5 minutes
3. **Investigate issues** on new server while traffic flows to old server

---

## Need Help?

- Check logs: `pm2 logs spotops360-api`
- Check nginx: `sudo nginx -t && sudo systemctl status nginx`
- Test endpoints: `curl http://localhost:5000/api/health`

