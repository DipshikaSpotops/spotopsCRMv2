# Blue-Green Deployment Guide

This guide helps you set up blue-green deployment for zero-downtime deployments.

## Overview

**Blue-Green Deployment** is a technique that reduces downtime and risk by running two identical production environments called Blue and Green. At any time, only one of the environments is live, serving all production traffic.

- **Blue**: Current production environment (port 5000, nginx port 80)
- **Green**: New environment for testing new versions (port 5001, nginx port 8080)

## Architecture

```
                    ┌─────────────┐
                    │   Load      │
                    │  Balancer   │
                    │  / Nginx    │
                    └──────┬──────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
    ┌───────▼──────┐            ┌────────▼────────┐
    │   Blue       │            │   Green         │
    │  (Active)    │            │  (Standby)      │
    │  Port 5000   │            │  Port 5001      │
    │  Nginx :80   │            │  Nginx :8080    │
    └──────────────┘            └─────────────────┘
```

## Step 1: Setup Green Instance

### Option A: New EC2 Instance

1. **Launch a new EC2 instance** (same specs as blue instance)
   - Same AMI, instance type, security groups
   - Same VPC and subnet

2. **SSH into the new instance:**
   ```bash
   ssh -i your-key.pem ubuntu@GREEN_INSTANCE_IP
   ```

3. **Run the setup script:**
   ```bash
   # Clone or copy the repository first
   cd /var/www
   git clone YOUR_REPO_URL spotopsCRMv2
   cd spotopsCRMv2
   
   # Make script executable
   chmod +x scripts/setup-green-instance.sh
   
   # Run setup (as root or with sudo)
   sudo ./scripts/setup-green-instance.sh main
   ```

4. **Copy environment files from blue instance:**
   ```bash
   # From green instance, copy files from blue
   scp ubuntu@BLUE_IP:/var/www/spotopsCRMv2/backend/.env /var/www/spotopsCRMv2/backend/
   scp ubuntu@BLUE_IP:/var/www/spotopsCRMv2/backend/credentials.json /var/www/spotopsCRMv2/backend/
   scp ubuntu@BLUE_IP:/var/www/spotopsCRMv2/backend/token.json /var/www/spotopsCRMv2/backend/
   ```

5. **Restart PM2 to load environment:**
   ```bash
   pm2 restart spotops360-api-green
   ```

### Option B: Use Existing Instance (Development/Testing)

If you want to test on the same instance first:

```bash
# On your current instance, create green environment
cd /var/www/spotopsCRMv2
./scripts/setup-green-instance.sh main
```

## Step 2: Verify Green Instance

```bash
# Check PM2 status
pm2 status

# Check health
curl http://localhost:5001/api/health

# Check nginx
curl http://localhost:8080/api/health

# View logs
pm2 logs spotops360-api-green
```

## Step 3: Setup Load Balancer / Nginx Upstream

### Option A: Nginx Upstream (Recommended for Single Server)

Create a new nginx config that can switch between blue and green:

```bash
# On your main server (blue instance)
sudo nano /etc/nginx/sites-available/spotops360-lb.conf
```

```nginx
upstream backend_api {
    # Active environment (blue)
    server 127.0.0.1:5000;
    
    # Standby environment (green) - uncomment to switch
    # server 127.0.0.1:5001 backup;
}

upstream backend_frontend {
    # Active environment (blue)
    server 127.0.0.1:80;
    
    # Standby environment (green) - uncomment to switch
    # server 127.0.0.1:8080 backup;
}

server {
    listen 80;
    server_name spotops360.com www.spotops360.com;

    # API proxy
    location ^~ /api/ {
        proxy_pass http://backend_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend
    location / {
        proxy_pass http://backend_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Option B: AWS Application Load Balancer (Recommended for Production)

1. Create an ALB in AWS Console
2. Create two target groups:
   - `blue-target-group` → Blue instance (port 80)
   - `green-target-group` → Green instance (port 8080)
3. Configure listener rules to switch between target groups

## Step 4: Deployment Workflow

### Deploy to Green (Standby)

```bash
# SSH into green instance
ssh ubuntu@GREEN_IP

# Deploy new version
cd /var/www/spotopsCRMv2
./scripts/deploy.sh main
```

### Switch Traffic from Blue to Green

**Method 1: Nginx Upstream (Single Server)**

```bash
# Edit nginx config
sudo nano /etc/nginx/sites-available/spotops360-lb.conf

# Switch upstream to green:
# server 127.0.0.1:5001;  # green active
# server 127.0.0.1:5000 backup;  # blue backup

# Reload nginx
sudo nginx -t && sudo systemctl reload nginx
```

**Method 2: AWS ALB (Production)**

1. Go to AWS Console → EC2 → Load Balancers
2. Select your ALB
3. Edit listener rules
4. Change default action to `green-target-group`
5. Save

### Rollback (Switch back to Blue)

Simply reverse the nginx/ALB configuration back to blue.

## Step 5: Automated Blue-Green Script

Create a script to automate the switching:

```bash
# scripts/switch-to-green.sh
#!/bin/bash
# Switch traffic from blue to green

set -e

NGINX_CONFIG="/etc/nginx/sites-available/spotops360-lb.conf"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Health check green
log "Health checking green instance..."
if ! curl -f http://localhost:5001/api/health > /dev/null 2>&1; then
    echo "ERROR: Green instance is not healthy!"
    exit 1
fi

# Update nginx config
log "Switching nginx to green..."
sed -i 's/server 127.0.0.1:5000;/server 127.0.0.1:5000 backup;/' "$NGINX_CONFIG"
sed -i 's/server 127.0.0.1:5001 backup;/server 127.0.0.1:5001;/' "$NGINX_CONFIG"

# Test and reload
nginx -t && systemctl reload nginx

log "✅ Traffic switched to green!"

# scripts/switch-to-blue.sh
#!/bin/bash
# Switch traffic from green back to blue

set -e

NGINX_CONFIG="/etc/nginx/sites-available/spotops360-lb.conf"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Health check blue
log "Health checking blue instance..."
if ! curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
    echo "ERROR: Blue instance is not healthy!"
    exit 1
fi

# Update nginx config
log "Switching nginx to blue..."
sed -i 's/server 127.0.0.1:5001;/server 127.0.0.1:5001 backup;/' "$NGINX_CONFIG"
sed -i 's/server 127.0.0.1:5000 backup;/server 127.0.0.1:5000;/' "$NGINX_CONFIG"

# Test and reload
nginx -t && systemctl reload nginx

log "✅ Traffic switched to blue!"
```

## Step 6: Complete Deployment Process

```bash
# 1. Deploy new version to green (standby)
ssh ubuntu@GREEN_IP
cd /var/www/spotopsCRMv2
./scripts/deploy.sh main

# 2. Test green instance
curl http://GREEN_IP:8080/api/health
# Test manually in browser: http://GREEN_IP:8080

# 3. Switch traffic to green
# On main server:
sudo ./scripts/switch-to-green.sh

# 4. Monitor for issues
pm2 logs spotops360-api-green --lines 100
tail -f /var/log/nginx/error.log

# 5. If issues occur, rollback:
sudo ./scripts/switch-to-blue.sh

# 6. If successful, deploy same version to blue for next cycle
ssh ubuntu@BLUE_IP
cd /var/www/spotopsCRMv2
./scripts/deploy.sh main
```

## Benefits

✅ **Zero Downtime**: Switch traffic instantly  
✅ **Easy Rollback**: Switch back in seconds  
✅ **Safe Testing**: Test new version before going live  
✅ **Reduced Risk**: Always have a working backup environment  

## Maintenance

### Keep Environments in Sync

After successful deployment, sync blue to match green:

```bash
# On blue instance
cd /var/www/spotopsCRMv2
git pull origin main
cd backend && npm install
cd ../client && npm install && npm run build
pm2 reload spotops360-api
```

### Cleanup Old Deployments

```bash
# Remove old backups periodically
cd /var/www/spotopsCRMv2/backups
ls -t | tail -n +11 | xargs rm -rf
```

## Troubleshooting

### Green instance not starting

```bash
# Check PM2
pm2 status
pm2 logs spotops360-api-green

# Check port
sudo netstat -tlnp | grep 5001

# Check environment
cat /var/www/spotopsCRMv2/backend/.env
```

### Nginx switching issues

```bash
# Test config
sudo nginx -t

# Check nginx status
sudo systemctl status nginx

# View error logs
sudo tail -f /var/log/nginx/error.log
```

### Health check failing

```bash
# Test directly
curl http://localhost:5001/api/health

# Check if app is running
pm2 status

# Check application logs
pm2 logs spotops360-api-green --lines 50
```

## Next Steps

1. ✅ Setup green instance
2. ✅ Test green instance thoroughly
3. ✅ Setup load balancer/nginx upstream
4. ✅ Create switch scripts
5. ✅ Test complete blue-green workflow
6. ✅ Document your specific setup
7. ✅ Train team on blue-green process








