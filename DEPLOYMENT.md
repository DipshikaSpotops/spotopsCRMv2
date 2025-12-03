# Deployment Guide

This project uses a zero-downtime deployment strategy with automatic rollback capabilities.

## Quick Start

### Manual Deployment

```bash
# SSH into your EC2 instance
ssh ubuntu@your-ec2-ip

# Navigate to app directory
cd /var/www/spotopsCRMv2

# Deploy (defaults to main branch)
./scripts/deploy.sh

# Or deploy specific branch
./scripts/deploy.sh feature-branch
```

### Rollback

```bash
# Rollback to last deployment
./scripts/rollback.sh

# Or rollback to specific backup
./scripts/rollback.sh 20250103_143022
```

## Setup (One-time)

1. **On EC2, run the setup script:**
   ```bash
   cd /var/www/spotopsCRMv2
   chmod +x scripts/setup-deploy.sh
   ./scripts/setup-deploy.sh
   ```

2. **For GitHub Actions (optional):**
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Add these secrets:
     - `EC2_HOST`: Your EC2 public IP or domain
     - `EC2_USER`: Usually `ubuntu`
     - `EC2_SSH_KEY`: Your private SSH key content

## How It Works

### Deployment Process

1. **Backup**: Creates a timestamped backup of current backend and frontend build
2. **Pull Code**: Fetches latest code from specified branch
3. **Install Dependencies**: Runs `npm install` for backend
4. **Build Frontend**: Builds React app to temporary directory
5. **Health Check**: Verifies current service is healthy
6. **Atomic Swap**: Swaps new frontend build atomically
7. **PM2 Reload**: Uses `pm2 reload` for zero-downtime restart
8. **Verify**: Checks service health after deployment
9. **Auto-Rollback**: If health check fails, automatically rolls back

### Rollback Process

1. Restores backend code from backup
2. Restores frontend build from backup
3. Restarts PM2
4. Verifies service health

## Features

- ✅ **Zero Downtime**: Uses PM2 reload instead of restart
- ✅ **Atomic Deployments**: Frontend build swapped atomically
- ✅ **Automatic Rollback**: Rolls back if health check fails
- ✅ **Backup Management**: Keeps timestamped backups
- ✅ **Health Checks**: Verifies service before and after deployment

## Backup Management

Backups are stored in `/var/www/spotopsCRMv2/backups/` with timestamp format: `YYYYMMDD_HHMMSS`

To list backups:
```bash
ls -la /var/www/spotopsCRMv2/backups/
```

To clean old backups (keep last 10):
```bash
cd /var/www/spotopsCRMv2/backups
ls -t | tail -n +11 | xargs rm -rf
```

## Troubleshooting

### Deployment Fails

1. Check logs: `pm2 logs spotops360-api`
2. Check backup exists: `ls -la backups/`
3. Manual rollback: `./scripts/rollback.sh [timestamp]`

### Health Check Fails

1. Check if service is running: `pm2 status`
2. Check API endpoint: `curl http://localhost:5000/api/health`
3. Check nginx: `sudo systemctl status nginx`
4. Check logs: `pm2 logs spotops360-api --lines 50`

### Frontend Not Updating

1. Verify build exists: `ls -la client/dist/`
2. Check nginx config: `sudo nginx -t`
3. Clear browser cache
4. Check nginx error logs: `sudo tail -f /var/log/nginx/error.log`

## CI/CD with GitHub Actions

Once secrets are configured, deployments happen automatically on push to `main` branch.

To deploy manually via GitHub Actions:
1. Go to Actions tab
2. Select "Deploy to EC2" workflow
3. Click "Run workflow"
4. Select branch and run

## Manual Steps (if scripts fail)

```bash
# 1. Backup
mkdir -p backups/$(date +%Y%m%d_%H%M%S)
cp -r backend backups/$(date +%Y%m%d_%H%M%S)/
cp -r client/dist backups/$(date +%Y%m%d_%H%M%S)/

# 2. Pull code
git pull origin main

# 3. Install & build
cd backend && npm install
cd ../client && npm install && npm run build

# 4. Restart
pm2 reload spotops360-api
```

