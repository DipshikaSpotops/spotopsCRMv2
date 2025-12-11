#!/bin/bash
# Backup script for current server
# Run this on the server you want to backup (13.232.37.47)
# Usage: ./scripts/backup-server.sh

set -e

# Configuration
BACKUP_BASE_DIR="/var/backups/spotops360"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_BASE_DIR}/${TIMESTAMP}"
# Auto-detect app directory (supports both spotopsCRM and spotopsCRMv2)
if [ -d "/var/www/spotopsCRMv2" ]; then
    APP_DIR="/var/www/spotopsCRMv2"
elif [ -d "/var/www/spotopsCRM" ]; then
    APP_DIR="/var/www/spotopsCRM"
else
    APP_DIR="/var/www/spotopsCRMv2"  # Default
fi
CURRENT_USER=$(whoami)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log "Starting server backup..."
log "Backup will be saved to: $BACKUP_DIR"

# Create backup directory
sudo mkdir -p "$BACKUP_DIR"
sudo chown -R $CURRENT_USER:$CURRENT_USER "$BACKUP_DIR"

# Step 1: Backup application files
log "Step 1: Backing up application files..."
if [ -d "$APP_DIR" ]; then
    mkdir -p "$BACKUP_DIR/app"
    
    # Backup backend
    if [ -d "$APP_DIR/backend" ]; then
        log "  Backing up backend..."
        cp -r "$APP_DIR/backend" "$BACKUP_DIR/app/backend" 2>/dev/null || {
            warn "  Some files may not have been copied (permissions)"
        }
    fi
    
    # Backup frontend build
    if [ -d "$APP_DIR/client/dist" ]; then
        log "  Backing up frontend build..."
        cp -r "$APP_DIR/client/dist" "$BACKUP_DIR/app/client-dist" 2>/dev/null || {
            warn "  Frontend build may not exist"
        }
    fi
    
    # Backup client source (optional, but good to have)
    if [ -d "$APP_DIR/client/src" ]; then
        log "  Backing up client source..."
        mkdir -p "$BACKUP_DIR/app/client-src"
        cp -r "$APP_DIR/client/src" "$BACKUP_DIR/app/client-src/" 2>/dev/null || true
        cp "$APP_DIR/client/package.json" "$BACKUP_DIR/app/client-src/" 2>/dev/null || true
    fi
    
    # Backup scripts
    if [ -d "$APP_DIR/scripts" ]; then
        log "  Backing up scripts..."
        cp -r "$APP_DIR/scripts" "$BACKUP_DIR/app/scripts" 2>/dev/null || true
    fi
    
    # Backup ecosystem config
    if [ -f "$APP_DIR/ecosystem.config.js" ]; then
        cp "$APP_DIR/ecosystem.config.js" "$BACKUP_DIR/app/" 2>/dev/null || true
    fi
    
    # Backup package files
    if [ -f "$APP_DIR/package.json" ]; then
        cp "$APP_DIR/package.json" "$BACKUP_DIR/app/" 2>/dev/null || true
    fi
    
    log "  ✅ Application files backed up"
else
    warn "  Application directory not found: $APP_DIR"
fi

# Step 2: Backup environment and credentials
log "Step 2: Backing up configuration files..."
mkdir -p "$BACKUP_DIR/config"

# Backup .env files
if [ -f "$APP_DIR/backend/.env" ]; then
    log "  Backing up .env file..."
    cp "$APP_DIR/backend/.env" "$BACKUP_DIR/config/.env" 2>/dev/null || {
        warn "  Could not copy .env (may need sudo)"
        sudo cp "$APP_DIR/backend/.env" "$BACKUP_DIR/config/.env" 2>/dev/null || true
    }
else
    warn "  .env file not found"
fi

# Backup credentials.json
if [ -f "$APP_DIR/backend/credentials.json" ]; then
    log "  Backing up credentials.json..."
    cp "$APP_DIR/backend/credentials.json" "$BACKUP_DIR/config/credentials.json" 2>/dev/null || {
        sudo cp "$APP_DIR/backend/credentials.json" "$BACKUP_DIR/config/credentials.json" 2>/dev/null || true
    }
fi

# Backup token.json
if [ -f "$APP_DIR/backend/token.json" ]; then
    log "  Backing up token.json..."
    cp "$APP_DIR/backend/token.json" "$BACKUP_DIR/config/token.json" 2>/dev/null || {
        sudo cp "$APP_DIR/backend/token.json" "$BACKUP_DIR/config/token.json" 2>/dev/null || true
    }
fi

log "  ✅ Configuration files backed up"

# Step 3: Backup nginx configuration
log "Step 3: Backing up nginx configuration..."
mkdir -p "$BACKUP_DIR/nginx"

if [ -d "/etc/nginx" ]; then
    log "  Backing up nginx configs..."
    sudo cp -r /etc/nginx/sites-available "$BACKUP_DIR/nginx/" 2>/dev/null || true
    sudo cp -r /etc/nginx/sites-enabled "$BACKUP_DIR/nginx/" 2>/dev/null || true
    sudo cp /etc/nginx/nginx.conf "$BACKUP_DIR/nginx/" 2>/dev/null || true
    
    # Fix permissions
    sudo chown -R $CURRENT_USER:$CURRENT_USER "$BACKUP_DIR/nginx"
    log "  ✅ Nginx configuration backed up"
else
    warn "  Nginx directory not found"
fi

# Step 4: Backup PM2 configuration and process list
log "Step 4: Backing up PM2 configuration..."
mkdir -p "$BACKUP_DIR/pm2"

if command -v pm2 &> /dev/null; then
    log "  Saving PM2 process list..."
    pm2 save 2>/dev/null || true
    
    # Backup PM2 dump file
    if [ -f ~/.pm2/dump.pm2 ]; then
        cp ~/.pm2/dump.pm2 "$BACKUP_DIR/pm2/dump.pm2" 2>/dev/null || true
    fi
    
    # Save PM2 status
    pm2 list > "$BACKUP_DIR/pm2/process-list.txt" 2>/dev/null || true
    pm2 describe all > "$BACKUP_DIR/pm2/process-details.txt" 2>/dev/null || true
    
    log "  ✅ PM2 configuration backed up"
else
    warn "  PM2 not found"
fi

# Step 5: Backup system information
log "Step 5: Backing up system information..."
mkdir -p "$BACKUP_DIR/system"

# System info
uname -a > "$BACKUP_DIR/system/uname.txt" 2>/dev/null || true
cat /etc/os-release > "$BACKUP_DIR/system/os-release.txt" 2>/dev/null || true

# Node version
if command -v node &> /dev/null; then
    node --version > "$BACKUP_DIR/system/node-version.txt" 2>/dev/null || true
    npm --version > "$BACKUP_DIR/system/npm-version.txt" 2>/dev/null || true
fi

# PM2 version
if command -v pm2 &> /dev/null; then
    pm2 --version > "$BACKUP_DIR/system/pm2-version.txt" 2>/dev/null || true
fi

# Nginx version
if command -v nginx &> /dev/null; then
    nginx -v > "$BACKUP_DIR/system/nginx-version.txt" 2>&1 || true
fi

# Network info
ip addr show > "$BACKUP_DIR/system/network-info.txt" 2>/dev/null || true
hostname > "$BACKUP_DIR/system/hostname.txt" 2>/dev/null || true

log "  ✅ System information backed up"

# Step 6: Backup MongoDB (if applicable)
log "Step 6: Checking for MongoDB backup..."
if command -v mongodump &> /dev/null; then
    # Try to get MongoDB connection string from .env
    if [ -f "$BACKUP_DIR/config/.env" ] || [ -f "$APP_DIR/backend/.env" ]; then
        ENV_FILE="$BACKUP_DIR/config/.env"
        [ ! -f "$ENV_FILE" ] && ENV_FILE="$APP_DIR/backend/.env"
        
        MONGODB_URI=$(grep -E "^MONGODB_URI=" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" || echo "")
        
        if [ -n "$MONGODB_URI" ]; then
            log "  MongoDB URI found, creating database backup..."
            mkdir -p "$BACKUP_DIR/mongodb"
            
            # Extract database name from URI
            DB_NAME=$(echo "$MONGODB_URI" | sed -n 's/.*\/\([^?]*\).*/\1/p' || echo "spotops360")
            
            # Create MongoDB backup
            mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/mongodb/" 2>/dev/null || {
                warn "  MongoDB backup failed (may need authentication or different method)"
                info "  You may need to backup MongoDB manually"
            }
            
            if [ -d "$BACKUP_DIR/mongodb" ] && [ "$(ls -A $BACKUP_DIR/mongodb 2>/dev/null)" ]; then
                log "  ✅ MongoDB backup created"
            else
                warn "  MongoDB backup directory is empty"
            fi
        else
            warn "  MongoDB URI not found in .env"
        fi
    else
        warn "  .env file not accessible for MongoDB backup"
    fi
else
    warn "  mongodump not found (MongoDB may be on a different server)"
fi

# Step 7: Create backup manifest
log "Step 7: Creating backup manifest..."
cat > "$BACKUP_DIR/BACKUP_MANIFEST.txt" << EOF
Backup Created: $(date)
Server: $(hostname)
IP: $(hostname -I | awk '{print $1}')
User: $CURRENT_USER

Backup Contents:
- Application files: $([ -d "$BACKUP_DIR/app" ] && echo "YES" || echo "NO")
- Configuration files: $([ -d "$BACKUP_DIR/config" ] && echo "YES" || echo "NO")
- Nginx configuration: $([ -d "$BACKUP_DIR/nginx" ] && echo "YES" || echo "NO")
- PM2 configuration: $([ -d "$BACKUP_DIR/pm2" ] && echo "YES" || echo "NO")
- System information: $([ -d "$BACKUP_DIR/system" ] && echo "YES" || echo "NO")
- MongoDB backup: $([ -d "$BACKUP_DIR/mongodb" ] && [ "$(ls -A $BACKUP_DIR/mongodb 2>/dev/null)" ] && echo "YES" || echo "NO")

Backup Location: $BACKUP_DIR
Total Size: $(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

To restore this backup, see: scripts/restore-backup.sh
EOF

log "  ✅ Manifest created"

# Step 8: Create compressed archive (optional)
log "Step 8: Creating compressed archive..."
ARCHIVE_NAME="spotops360-backup-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_BASE_DIR}/${ARCHIVE_NAME}"

log "  Compressing backup (this may take a while)..."
cd "$BACKUP_BASE_DIR"
tar -czf "$ARCHIVE_PATH" "$TIMESTAMP" 2>/dev/null || {
    warn "  Compression failed, but backup files are still available"
}

if [ -f "$ARCHIVE_PATH" ]; then
    ARCHIVE_SIZE=$(du -sh "$ARCHIVE_PATH" | cut -f1)
    log "  ✅ Archive created: $ARCHIVE_NAME ($ARCHIVE_SIZE)"
    info "  Archive location: $ARCHIVE_PATH"
fi

# Step 9: Calculate backup size
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
log "Backup size: $BACKUP_SIZE"

# Summary
log ""
log "=========================================="
log "✅ Backup Complete!"
log "=========================================="
log ""
log "Backup Location: $BACKUP_DIR"
if [ -f "$ARCHIVE_PATH" ]; then
    log "Archive Location: $ARCHIVE_PATH"
fi
log ""
log "Backup Contents:"
[ -d "$BACKUP_DIR/app" ] && log "  ✅ Application files"
[ -d "$BACKUP_DIR/config" ] && log "  ✅ Configuration files"
[ -d "$BACKUP_DIR/nginx" ] && log "  ✅ Nginx configuration"
[ -d "$BACKUP_DIR/pm2" ] && log "  ✅ PM2 configuration"
[ -d "$BACKUP_DIR/system" ] && log "  ✅ System information"
[ -d "$BACKUP_DIR/mongodb" ] && [ "$(ls -A $BACKUP_DIR/mongodb 2>/dev/null)" ] && log "  ✅ MongoDB backup" || warn "  ⚠️  MongoDB backup (check manually)"
log ""
log "Next Steps:"
log "1. Verify backup contents: ls -lh $BACKUP_DIR"
log "2. Download backup to local machine (if needed):"
log "   scp -r $CURRENT_USER@13.232.37.47:$BACKUP_DIR ./backup-${TIMESTAMP}"
if [ -f "$ARCHIVE_PATH" ]; then
    log "   OR download archive:"
    log "   scp $CURRENT_USER@13.232.37.47:$ARCHIVE_PATH ./"
fi
log "3. Proceed with migration setup"
log ""

