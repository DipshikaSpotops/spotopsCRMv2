#!/bin/bash
# Restore script for server backup
# Usage: ./scripts/restore-backup.sh [backup-timestamp]
# Example: ./scripts/restore-backup.sh 20250115_143022

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 [backup-timestamp]"
    echo "Example: $0 20250115_143022"
    echo ""
    echo "Available backups:"
    ls -1 /var/backups/spotops360/ 2>/dev/null | grep -E "^[0-9]{8}_[0-9]{6}$" || echo "No backups found"
    exit 1
fi

BACKUP_TIMESTAMP="$1"
BACKUP_BASE_DIR="/var/backups/spotops360"
BACKUP_DIR="${BACKUP_BASE_DIR}/${BACKUP_TIMESTAMP}"
APP_DIR="/var/www/spotopsCRMv2"
CURRENT_USER=$(whoami)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Check if backup exists
if [ ! -d "$BACKUP_DIR" ]; then
    # Check if archive exists
    ARCHIVE_PATH="${BACKUP_BASE_DIR}/spotops360-backup-${BACKUP_TIMESTAMP}.tar.gz"
    if [ -f "$ARCHIVE_PATH" ]; then
        log "Archive found, extracting..."
        cd "$BACKUP_BASE_DIR"
        tar -xzf "$ARCHIVE_PATH"
    else
        error "Backup not found: $BACKUP_DIR"
        error "Archive also not found: $ARCHIVE_PATH"
        exit 1
    fi
fi

if [ ! -d "$BACKUP_DIR" ]; then
    error "Backup directory still not found after extraction"
    exit 1
fi

log "Restoring from backup: $BACKUP_TIMESTAMP"
log "Backup location: $BACKUP_DIR"

# Confirm restoration
read -p "This will overwrite current files. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    log "Restoration cancelled"
    exit 0
fi

# Step 1: Restore application files
log "Step 1: Restoring application files..."
if [ -d "$BACKUP_DIR/app" ]; then
    # Create app directory if it doesn't exist
    sudo mkdir -p "$APP_DIR"
    sudo chown -R $CURRENT_USER:$CURRENT_USER "$APP_DIR"
    
    # Restore backend
    if [ -d "$BACKUP_DIR/app/backend" ]; then
        log "  Restoring backend..."
        rm -rf "$APP_DIR/backend"
        cp -r "$BACKUP_DIR/app/backend" "$APP_DIR/backend"
    fi
    
    # Restore frontend build
    if [ -d "$BACKUP_DIR/app/client-dist" ]; then
        log "  Restoring frontend build..."
        mkdir -p "$APP_DIR/client"
        rm -rf "$APP_DIR/client/dist"
        cp -r "$BACKUP_DIR/app/client-dist" "$APP_DIR/client/dist"
    fi
    
    # Restore scripts
    if [ -d "$BACKUP_DIR/app/scripts" ]; then
        log "  Restoring scripts..."
        cp -r "$BACKUP_DIR/app/scripts" "$APP_DIR/scripts"
    fi
    
    # Restore ecosystem config
    if [ -f "$BACKUP_DIR/app/ecosystem.config.js" ]; then
        cp "$BACKUP_DIR/app/ecosystem.config.js" "$APP_DIR/"
    fi
    
    log "  ✅ Application files restored"
else
    warn "  Application backup not found"
fi

# Step 2: Restore configuration files
log "Step 2: Restoring configuration files..."
if [ -d "$BACKUP_DIR/config" ]; then
    mkdir -p "$APP_DIR/backend"
    
    if [ -f "$BACKUP_DIR/config/.env" ]; then
        log "  Restoring .env file..."
        cp "$BACKUP_DIR/config/.env" "$APP_DIR/backend/.env"
        chmod 600 "$APP_DIR/backend/.env" 2>/dev/null || true
    fi
    
    if [ -f "$BACKUP_DIR/config/credentials.json" ]; then
        log "  Restoring credentials.json..."
        cp "$BACKUP_DIR/config/credentials.json" "$APP_DIR/backend/credentials.json"
        chmod 600 "$APP_DIR/backend/credentials.json" 2>/dev/null || true
    fi
    
    if [ -f "$BACKUP_DIR/config/token.json" ]; then
        log "  Restoring token.json..."
        cp "$BACKUP_DIR/config/token.json" "$APP_DIR/backend/token.json"
        chmod 600 "$APP_DIR/backend/token.json" 2>/dev/null || true
    fi
    
    log "  ✅ Configuration files restored"
else
    warn "  Configuration backup not found"
fi

# Step 3: Restore nginx configuration
log "Step 3: Restoring nginx configuration..."
if [ -d "$BACKUP_DIR/nginx" ]; then
    if [ -d "$BACKUP_DIR/nginx/sites-available" ]; then
        log "  Restoring nginx sites..."
        sudo cp -r "$BACKUP_DIR/nginx/sites-available"/* /etc/nginx/sites-available/ 2>/dev/null || true
    fi
    
    if [ -f "$BACKUP_DIR/nginx/nginx.conf" ]; then
        log "  Restoring nginx.conf..."
        sudo cp "$BACKUP_DIR/nginx/nginx.conf" /etc/nginx/nginx.conf.backup 2>/dev/null || true
        warn "  nginx.conf backed up to nginx.conf.backup (manual review recommended)"
    fi
    
    sudo nginx -t && sudo systemctl reload nginx
    log "  ✅ Nginx configuration restored"
else
    warn "  Nginx backup not found"
fi

# Step 4: Restore PM2 configuration
log "Step 4: Restoring PM2 configuration..."
if [ -d "$BACKUP_DIR/pm2" ]; then
    if [ -f "$BACKUP_DIR/pm2/dump.pm2" ]; then
        log "  Restoring PM2 dump..."
        mkdir -p ~/.pm2
        cp "$BACKUP_DIR/pm2/dump.pm2" ~/.pm2/dump.pm2 2>/dev/null || true
    fi
    
    log "  ✅ PM2 configuration restored"
    warn "  You may need to run: pm2 resurrect"
else
    warn "  PM2 backup not found"
fi

# Step 5: Restore MongoDB (if backup exists)
log "Step 5: Checking for MongoDB restore..."
if [ -d "$BACKUP_DIR/mongodb" ] && [ "$(ls -A $BACKUP_DIR/mongodb 2>/dev/null)" ]; then
    if command -v mongorestore &> /dev/null; then
        # Try to get MongoDB URI from restored .env
        if [ -f "$APP_DIR/backend/.env" ]; then
            MONGODB_URI=$(grep -E "^MONGODB_URI=" "$APP_DIR/backend/.env" 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" || echo "")
            
            if [ -n "$MONGODB_URI" ]; then
                log "  Restoring MongoDB..."
                read -p "Restore MongoDB? This will overwrite existing data. (yes/no): " restore_db
                if [ "$restore_db" = "yes" ]; then
                    mongorestore --uri="$MONGODB_URI" "$BACKUP_DIR/mongodb/" 2>/dev/null || {
                        warn "  MongoDB restore failed (may need authentication)"
                        info "  You may need to restore MongoDB manually"
                    }
                else
                    warn "  MongoDB restore skipped"
                fi
            else
                warn "  MongoDB URI not found in .env"
            fi
        else
            warn "  .env file not found for MongoDB restore"
        fi
    else
        warn "  mongorestore not found"
    fi
else
    warn "  MongoDB backup not found or empty"
fi

# Step 6: Reinstall dependencies and restart
log "Step 6: Reinstalling dependencies..."
if [ -d "$APP_DIR/backend" ]; then
    cd "$APP_DIR/backend"
    npm install --production
fi

log "Step 7: Restarting services..."
if command -v pm2 &> /dev/null; then
    cd "$APP_DIR"
    pm2 restart spotops360-api || pm2 start ecosystem.config.js
    pm2 save
    log "  ✅ PM2 restarted"
fi

# Summary
log ""
log "=========================================="
log "✅ Restoration Complete!"
log "=========================================="
log ""
log "Next steps:"
log "1. Verify application is running: pm2 status"
log "2. Check logs: pm2 logs spotops360-api"
log "3. Test endpoints: curl http://localhost:5000/api/health"
log "4. Verify nginx: sudo nginx -t && sudo systemctl status nginx"
log ""

