# Quick Deployment Reference

## 🚀 One-Time Setup (on EC2)

```bash
cd /var/www/spotopsCRMv2
chmod +x scripts/*.sh
./scripts/setup-deploy.sh
```

## 📦 Deploy

```bash
# Deploy main branch
./scripts/deploy.sh

# Deploy specific branch
./scripts/deploy.sh feature-branch
```

## ⏪ Rollback

```bash
# Rollback to last deployment
./scripts/rollback.sh

# Rollback to specific backup
./scripts/rollback.sh 20250103_143022
```

## 🔍 Check Status

```bash
# PM2 status
pm2 status

# PM2 logs
pm2 logs spotops360-api --lines 50

# Health check
curl http://localhost:5000/api/health

# List backups
ls -la backups/
```

## 🐛 Troubleshooting

```bash
# If deployment fails, check:
pm2 logs spotops360-api --lines 100
sudo tail -f /var/log/nginx/error.log

# Manual rollback
./scripts/rollback.sh

# Force restart (if needed)
pm2 restart spotops360-api
```

