# Fix 404 Error on Server API

## Problem
Getting `404 Not Found` when accessing `http://13.232.37.47/api/health`

## Root Causes

1. **Backend not running** - Node.js app not started on port 5000
2. **Nginx config issue** - `server_name` doesn't match the IP address
3. **Wrong nginx config active** - Default nginx config is being used

## Quick Diagnostic Commands

Run these **on the server** (SSH into `13.232.37.47`):

```bash
# 1. Check if backend is running
pm2 list
pm2 logs spotops360-api --lines 20

# 2. Test backend directly (bypass nginx)
curl http://localhost:5000/api/health
curl http://127.0.0.1:5000/api/health

# 3. Check nginx configuration
sudo nginx -t
sudo cat /etc/nginx/sites-available/spotops360

# 4. Check which nginx configs are enabled
ls -la /etc/nginx/sites-enabled/

# 5. Check nginx error logs
sudo tail -f /var/log/nginx/error.log
```

## Fix Steps

### Step 1: Fix Nginx Configuration

The nginx config needs to accept requests by IP address. Edit the config:

```bash
sudo nano /etc/nginx/sites-available/spotops360
```

**Option A: Add IP to server_name (Recommended for testing)**
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name 13.232.37.47 spotops360.com www.spotops360.com;
    
    # ... rest of config
}
```

**Option B: Use catch-all (Easier for testing)**
```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;  # Catch-all, accepts any domain/IP
    
    # ... rest of config
}
```

**Option C: Separate block for IP (Best practice)**
```nginx
# Block for IP access (testing)
server {
    listen 80;
    listen [::]:80;
    server_name 13.232.37.47;
    
    # ... rest of config
}

# Block for domain (production)
server {
    listen 80;
    listen [::]:80;
    server_name spotops360.com www.spotops360.com;
    
    # ... rest of config (same as above)
}
```

After editing, test and reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 2: Ensure Backend is Running

```bash
# Check PM2 status
pm2 list

# If not running, start it
cd /var/www/spotopsCRMv2
pm2 start ecosystem.config.js
# OR if ecosystem.config.js doesn't exist:
pm2 start backend/server.js --name spotops360-api

# Save PM2 process list
pm2 save

# Make PM2 start on boot
pm2 startup
# Follow the instructions it gives you
```

### Step 3: Verify API Proxy Configuration

Make sure nginx is configured to proxy to the backend:

```bash
sudo cat /etc/nginx/sites-available/spotops360
```

Should contain:
```nginx
location ^~ /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_intercept_errors off;
}
```

**Important:** If using `location /api` (without trailing slash), the proxy_pass behavior is different. The trailing slash in `location ^~ /api/` ensures `/api/health` is proxied to `/api/health` (not `/health`).

### Step 4: Check for Default Nginx Config

If default nginx config is enabled, it might be intercepting requests:

```bash
# Remove default config if present
sudo rm -f /etc/nginx/sites-enabled/default

# Ensure your config is enabled
sudo ln -sf /etc/nginx/sites-available/spotops360 /etc/nginx/sites-enabled/spotops360

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Step 5: Verify Port 5000 is Listening

```bash
# Check if port 5000 is being listened to
sudo netstat -tlnp | grep 5000
# OR
sudo ss -tlnp | grep 5000
# OR
sudo lsof -i :5000
```

Should show Node.js/PM2 process listening on port 5000.

## Complete Fix Script

Run this on the server to fix everything:

```bash
#!/bin/bash

# 1. Ensure backend is running
cd /var/www/spotopsCRMv2
pm2 start ecosystem.config.js || pm2 start backend/server.js --name spotops360-api
pm2 save

# 2. Fix nginx config to accept IP
sudo tee /etc/nginx/sites-available/spotops360 > /dev/null << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;  # Accept any domain/IP
    
    # --- Security ---
    location ~ /\. { deny all; }
    
    # --- API proxy ---
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_intercept_errors off;
    }
    
    # --- WebSocket / Socket.IO ---
    location /socket.io/ {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_pass http://127.0.0.1:5000;
    }
    
    # --- Frontend ---
    root /var/www/spotopsCRMv2/client/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# 3. Enable config
sudo ln -sf /etc/nginx/sites-available/spotops360 /etc/nginx/sites-enabled/spotops360
sudo rm -f /etc/nginx/sites-enabled/default

# 4. Test and reload nginx
sudo nginx -t && sudo systemctl reload nginx

# 5. Test locally
curl http://localhost:5000/api/health

echo "✅ Setup complete! Test with: curl http://13.232.37.47/api/health"
```

## Test After Fix

```bash
# From your local machine
curl http://13.232.37.47/api/health

# Should return: {"status":"ok"} or similar
```

## Still Not Working?

If you still get 404:

1. **Check nginx access logs:**
   ```bash
   sudo tail -f /var/log/nginx/access.log
   ```
   Then try the curl command again and see what nginx logs.

2. **Check backend logs:**
   ```bash
   pm2 logs spotops360-api
   ```

3. **Verify backend route exists:**
   ```bash
   # SSH into server
   curl http://localhost:5000/api/health
   ```
   If this works but IP doesn't, it's definitely an nginx config issue.

4. **Check for firewall blocking:**
   ```bash
   sudo ufw status
   # Port 80 should be allowed
   ```
