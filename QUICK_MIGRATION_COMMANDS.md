# Quick Migration Commands
## spotopsCRM (13.203.40.170) → spotopsCRMv2 (13.232.37.47)

---

## Step 1: Backup Old Server

```bash
# Copy backup script to old server
scp scripts/backup-server.sh ubuntu@13.203.40.170:/var/www/spotopsCRM/scripts/

# SSH and run backup
ssh ubuntu@13.203.40.170
cd /var/www/spotopsCRM
chmod +x scripts/backup-server.sh
./scripts/backup-server.sh
```

**Note the backup timestamp** from output (e.g., `20250115_143022`)

---

## Step 2: Copy Configuration to New Server

```bash
# Copy .env file
scp ubuntu@13.203.40.170:/var/www/spotopsCRM/backend/.env ubuntu@13.232.37.47:/var/www/spotopsCRMv2/backend/.env

# Copy credentials (if needed)
scp ubuntu@13.203.40.170:/var/www/spotopsCRM/backend/credentials.json ubuntu@13.232.37.47:/var/www/spotopsCRMv2/backend/credentials.json
scp ubuntu@13.203.40.170:/var/www/spotopsCRM/backend/token.json ubuntu@13.232.37.47:/var/www/spotopsCRMv2/backend/token.json
```

---

## Step 3: Set Up New Server

```bash
# Copy migration script
scp scripts/migrate-to-new-server.sh ubuntu@13.232.37.47:/tmp/

# SSH and run setup
ssh ubuntu@13.232.37.47
chmod +x /tmp/migrate-to-new-server.sh
/tmp/migrate-to-new-server.sh
```

---

## Step 4: Test Both Servers

```bash
# Test old server (should work)
curl https://www.spotops360.com/api/health

# Test new server (via IP)
curl http://13.232.37.47/api/health
```

---

## Step 5: DNS Migration

1. **Update DNS A record**: `www.spotops360.com` → `13.232.37.47`

2. **Update nginx on new server**:
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

---

## Directory Reference

| Server | IP | App Directory |
|--------|----|--------------| 
| Old | 13.203.40.170 | `/var/www/spotopsCRM` |
| New | 13.232.37.47 | `/var/www/spotopsCRMv2` |

---

## Quick Test Commands

```bash
# Old server health
curl https://www.spotops360.com/api/health

# New server health (before DNS)
curl http://13.232.37.47/api/health

# New server health (after DNS)
curl https://www.spotops360.com/api/health

# Check DNS
dig www.spotops360.com @8.8.8.8
```

