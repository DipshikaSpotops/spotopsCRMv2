#!/bin/bash
# Zero-downtime deployment script for EC2
# Usage: ./scripts/deploy.sh [branch-name]

set -e  # Exit on any error

BRANCH=${1:-main}
APP_DIR="/var/www/spotopsCRMv2"
BACKUP_DIR="${APP_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Create backup directory
mkdir -p "$BACKUP_DIR"

log "Starting deployment of branch: $BRANCH"

# Step 1: Backup current version
log "Step 1: Creating backup..."
mkdir -p "$BACKUP_PATH"
cp -r "${APP_DIR}/backend" "${BACKUP_PATH}/backend" 2>/dev/null || true
cp -r "${APP_DIR}/client/dist" "${BACKUP_PATH}/client-dist" 2>/dev/null || true
echo "$TIMESTAMP" > "${APP_DIR}/.last_deployment"
log "Backup created at: $BACKUP_PATH"

# Step 2: Pull latest code
log "Step 2: Pulling latest code from $BRANCH..."
cd "$APP_DIR"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH" || {
    error "Failed to pull code. Rolling back..."
    exit 1
}

# Step 3: Install backend dependencies
log "Step 3: Installing backend dependencies..."
cd "${APP_DIR}/backend"
npm install --production || {
    error "Backend npm install failed. Rolling back..."
    exit 1
}

# Step 4: Build frontend in temporary directory
log "Step 4: Building frontend..."
cd "${APP_DIR}/client"
npm install || {
    error "Client npm install failed. Rolling back..."
    exit 1
}

# Build to temporary directory first
TEMP_DIST="${APP_DIR}/client/dist-new"
rm -rf "$TEMP_DIST"
npm run build || {
    error "Frontend build failed. Rolling back..."
    exit 1
}

# Step 5: Health check before swap
log "Step 5: Running pre-deployment health check..."
if ! curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
    warn "Health check failed, but continuing (server might be restarting)..."
fi

# Step 6: Atomic swap of frontend build
log "Step 6: Swapping frontend build (atomic operation)..."
if [ -d "${APP_DIR}/client/dist" ]; then
    mv "${APP_DIR}/client/dist" "${APP_DIR}/client/dist-old"
fi
mv "$TEMP_DIST" "${APP_DIR}/client/dist"
rm -rf "${APP_DIR}/client/dist-old"

# Step 7: Restart PM2 with zero-downtime
log "Step 7: Restarting PM2 processes..."
cd "$APP_DIR"
pm2 reload spotops360-api --update-env || {
    error "PM2 reload failed. Attempting rollback..."
    # Rollback frontend
    if [ -d "${APP_DIR}/client/dist-old" ]; then
        rm -rf "${APP_DIR}/client/dist"
        mv "${APP_DIR}/client/dist-old" "${APP_DIR}/client/dist"
    fi
    exit 1
}

# Step 8: Wait and verify health
log "Step 8: Waiting for service to be healthy..."
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
    warn "Health check attempt $RETRY_COUNT/$MAX_RETRIES failed, retrying..."
    sleep 2
done

if [ "$HEALTHY" = true ]; then
    log "✅ Deployment successful! Service is healthy."
    log "Backup available at: $BACKUP_PATH"
    log "To rollback: ./scripts/rollback.sh $TIMESTAMP"
    exit 0
else
    error "❌ Health check failed after deployment. Rolling back..."
    "${APP_DIR}/scripts/rollback.sh" "$TIMESTAMP"
    exit 1
fi

