#!/bin/bash
# Rollback script - restores previous deployment
# Usage: ./scripts/rollback.sh [backup-timestamp]

set -e

APP_DIR="/var/www/spotopsCRMv2"
BACKUP_DIR="${APP_DIR}/backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# If no timestamp provided, use the last backup
if [ -z "$1" ]; then
    if [ -f "${APP_DIR}/.last_deployment" ]; then
        TIMESTAMP=$(cat "${APP_DIR}/.last_deployment")
        log "Using last deployment timestamp: $TIMESTAMP"
    else
        # Find the most recent backup
        TIMESTAMP=$(ls -t "$BACKUP_DIR" 2>/dev/null | head -n1)
        if [ -z "$TIMESTAMP" ]; then
            error "No backup found. Cannot rollback."
            exit 1
        fi
        log "Using most recent backup: $TIMESTAMP"
    fi
else
    TIMESTAMP=$1
fi

BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

if [ ! -d "$BACKUP_PATH" ]; then
    error "Backup not found: $BACKUP_PATH"
    error "Available backups:"
    ls -la "$BACKUP_DIR" 2>/dev/null || echo "  (none)"
    exit 1
fi

log "Rolling back to: $TIMESTAMP"

# Step 1: Restore backend
if [ -d "${BACKUP_PATH}/backend" ]; then
    log "Restoring backend..."
    rm -rf "${APP_DIR}/backend"
    cp -r "${BACKUP_PATH}/backend" "${APP_DIR}/backend"
fi

# Step 2: Restore frontend build
if [ -d "${BACKUP_PATH}/client-dist" ]; then
    log "Restoring frontend build..."
    if [ -d "${APP_DIR}/client/dist" ]; then
        mv "${APP_DIR}/client/dist" "${APP_DIR}/client/dist-failed"
    fi
    cp -r "${BACKUP_PATH}/client-dist" "${APP_DIR}/client/dist"
    rm -rf "${APP_DIR}/client/dist-failed"
fi

# Step 3: Restart PM2
log "Restarting PM2..."
cd "$APP_DIR"
pm2 reload spotops360-api --update-env

# Step 4: Verify health
log "Verifying service health..."
sleep 5

MAX_RETRIES=10
RETRY_COUNT=0
HEALTHY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 2
done

if [ "$HEALTHY" = true ]; then
    log "✅ Rollback successful! Service is healthy."
else
    error "❌ Rollback completed but health check failed."
    error "You may need to manually check the service."
    exit 1
fi

