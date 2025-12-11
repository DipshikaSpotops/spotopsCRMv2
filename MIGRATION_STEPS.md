# Migration Steps: 13.203.40.170 → 13.232.37.47

## Server Information
- **Old Server**: `13.203.40.170` (currently running www.spotops360.com)
  - App Directory: `/var/www/spotopsCRM`
- **New Server**: `13.232.37.47` (target for migration)
  - App Directory: `/var/www/spotopsCRMv2`

---

## Step 1: Backup Old Server (13.203.40.170)

### 1.1 Copy backup script to old server

**From your local machine** (in the project directory):

```bash
scp scripts/backup-server.sh ubuntu@13.203.40.170:/var/www/spotopsCRM/scripts/
```

If the scripts directory doesn't exist, create it first:
```bash
ssh ubuntu@13.203.40.170
mkdir -p /var/www/spotopsCRM/scripts
exit
```

Then copy:
```bash
scp scripts/backup-server.sh ubuntu@13.203.40.170:/var/www/spotopsCRM/scripts/
```

### 1.2 Run backup on old server

```bash
ssh ubuntu@13.203.40.170
cd /var/www/spotopsCRM
chmod +x scripts/backup-server.sh
./scripts/backup-server.sh
```

**Note the backup timestamp** from the output (e.g., `20250115_143022`)

### 1.3 Download backup to local machine (safety)

```bash
# From your local machine, replace [TIMESTAMP] with actual timestamp
scp -r ubuntu@13.203.40.170:/var/backups/spotops360/[TIMESTAMP] ./backup-old-server-[TIMESTAMP]
```

---

## Step 2: Check New Server (13.232.37.47)

### 2.1 Check what's currently running

```bash
ssh ubuntu@13.232.37.47

# Check if application exists
ls -la /var/www/

# Check PM2 processes
pm2 list

# Check nginx
sudo systemctl status nginx

# Check if port 5000 is in use
sudo netstat -tlnp | grep 5000
```

### 2.2 If something is running, backup it first

```bash
# Copy backup script
scp scripts/backup-server.sh ubuntu@13.232.37.47:/tmp/

# SSH and run backup
ssh ubuntu@13.232.37.47
chmod +x /tmp/backup-server.sh
/tmp/backup-server.sh
exit
```

---

## Step 3: Set Up New Server (13.232.37.47)

### Option A: Automated Setup (Recommended)

```bash
# Copy migration script to new server
scp scripts/migrate-to-new-server.sh ubuntu@13.232.37.47:/tmp/

# SSH into new server
ssh ubuntu@13.232.37.47

# Run setup
chmod +x /tmp/migrate-to-new-server.sh
/tmp/migrate-to-new-server.sh
```

The script will guide you through:
- Installing dependencies
- Cloning repository
- Copying .env and credentials
- Building frontend
- Setting up PM2 and nginx

### Option B: Manual Setup

#### 3.1 Install system dependencies

```bash
ssh ubuntu@13.232.37.47

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

#### 3.2 Clone repository

```bash
# Create app directory
sudo mkdir -p /var/www/spotopsCRMv2
sudo chown -R $USER:$USER /var/www/spotopsCRMv2

# Clone repository (replace with your repo URL)
cd /var/www/spotopsCRMv2
git clone [YOUR_REPO_URL] .
# OR if already cloned:
git pull origin main
```

#### 3.3 Copy configuration from old server

```bash
# From your local machine, copy .env
scp ubuntu@13.203.40.170:/var/www/spotopsCRM/backend/.env ubuntu@13.232.37.47:/var/www/spotopsCRMv2/backend/.env

# Copy credentials (if needed)
scp ubuntu@13.203.40.170:/var/www/spotopsCRM/backend/credentials.json ubuntu@13.232.37.47:/var/www/spotopsCRMv2/backend/credentials.json
scp ubuntu@13.203.40.170:/var/www/spotopsCRM/backend/token.json ubuntu@13.232.37.47:/var/www/spotopsCRMv2/backend/token.json
```

#### 3.4 Install dependencies and build

```bash
ssh ubuntu@13.232.37.47

# Backend
cd /var/www/spotopsCRMv2/backend
npm install --production

# Frontend
cd /var/www/spotopsCRMv2/client
npm install
npm run build
```

#### 3.5 Set up PM2

```bash
cd /var/www/spotopsCRMv2

# If ecosystem.config.js exists, use it
pm2 start ecosystem.config.js

# Or create basic PM2 config
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'spotops360-api',
    script: './backend/server.js',
    cwd: '/var/www/spotopsCRMv2',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/home/ubuntu/.pm2/logs/spotops360-api-error.log',
    out_file: '/home/ubuntu/.pm2/logs/spotops360-api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false
  }]
};
EOF

pm2 start ecosystem.config.js
pm2 save
```

#### 3.6 Configure nginx

```bash
sudo nano /etc/nginx/sites-available/spotops360
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name 13.232.37.47;  # Will change to domain after DNS migration
    
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

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/spotops360 /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

#### 3.7 Test new server

```bash
# Test backend health
curl http://13.232.37.47/api/health

# Test frontend
curl http://13.232.37.47/

# Check PM2
pm2 status
pm2 logs spotops360-api --lines 20
```

---

## Step 4: Verify Both Servers

### 4.1 Test old server (should still work)

```bash
curl https://www.spotops360.com/api/health
# Or if HTTP:
curl http://www.spotops360.com/api/health
```

### 4.2 Test new server (via IP)

```bash
curl http://13.232.37.47/api/health
```

Both should return healthy responses.

---

## Step 5: Prepare DNS (24-48 hours before migration)

### 5.1 Reduce DNS TTL

1. Go to your DNS provider (where you manage spotops360.com)
2. Find the A record for `www.spotops360.com` (or `spotops360.com`)
3. Note current IP: Should be `13.203.40.170`
4. Change TTL to **60 seconds** (or minimum allowed)
5. **Wait 24-48 hours** for old TTL to expire

**Why?** This allows quick DNS changes during migration.

---

## Step 6: DNS Migration (The Switch)

### 6.1 Ensure both servers are running

```bash
# Old server
curl https://www.spotops360.com/api/health

# New server
curl http://13.232.37.47/api/health
```

### 6.2 Update DNS A record

1. Go to your DNS provider
2. Find A record for `www.spotops360.com` (or `spotops360.com`)
3. Change from: `13.203.40.170`
4. Change to: `13.232.37.47`
5. Save changes

### 6.3 Update nginx on new server

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

Reload nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6.4 Monitor migration

```bash
# Watch DNS propagation (from your local machine)
watch -n 5 'dig +short www.spotops360.com'

# Monitor new server logs
ssh ubuntu@13.232.37.47
pm2 logs spotops360-api --lines 50
```

**Expected time**: With 60-second TTL, migration completes in ~2-5 minutes

---

## Step 7: Post-Migration Verification

### 7.1 Verify DNS

```bash
dig www.spotops360.com @8.8.8.8
# Should return: 13.232.37.47
```

### 7.2 Test application

- Visit `https://www.spotops360.com` in browser
- Test login, navigation, all features
- Check API endpoints

### 7.3 Monitor for 24 hours

```bash
ssh ubuntu@13.232.37.47
pm2 logs spotops360-api
pm2 monit
```

---

## Step 8: SSL Certificate (If Using HTTPS)

```bash
ssh ubuntu@13.232.37.47
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d spotops360.com -d www.spotops360.com
```

---

## Rollback Plan

If something goes wrong:

1. **Immediate rollback**: Change DNS A record back to `13.203.40.170`
2. **With 60-second TTL**: Rollback completes in ~2-5 minutes
3. **Old server should still be running** and will handle traffic again

---

## Quick Command Reference

### Backup old server
```bash
scp scripts/backup-server.sh ubuntu@13.203.40.170:/var/www/spotopsCRM/scripts/
ssh ubuntu@13.203.40.170 "cd /var/www/spotopsCRM && chmod +x scripts/backup-server.sh && ./scripts/backup-server.sh"
```

### Copy .env to new server
```bash
scp ubuntu@13.203.40.170:/var/www/spotopsCRM/backend/.env ubuntu@13.232.37.47:/var/www/spotopsCRMv2/backend/.env
```

### Test both servers
```bash
# Old
curl https://www.spotops360.com/api/health

# New
curl http://13.232.37.47/api/health
```

---

## Checklist

- [ ] Backup old server (13.203.40.170)
- [ ] Check new server (13.232.37.47) for existing setup
- [ ] Set up new server with application
- [ ] Copy .env and credentials to new server
- [ ] Test new server via IP
- [ ] Reduce DNS TTL to 60 seconds
- [ ] Wait 24-48 hours for TTL to expire
- [ ] Update DNS A record to 13.232.37.47
- [ ] Update nginx server_name on new server
- [ ] Verify DNS propagation
- [ ] Test application on new domain
- [ ] Set up SSL certificate (if HTTPS)
- [ ] Monitor for 24 hours

