#!/bin/bash
# Setup script to prepare EC2 for CI/CD
# Run this once on your EC2 instance

set -e

APP_DIR="/var/www/spotopsCRMv2"

log() {
    echo -e "\033[0;32m[SETUP]\033[0m $1"
}

log "Setting up deployment scripts..."

# Make scripts executable
chmod +x "${APP_DIR}/scripts/deploy.sh"
chmod +x "${APP_DIR}/scripts/rollback.sh"

# Create backups directory
mkdir -p "${APP_DIR}/backups"

# Create PM2 ecosystem file if it doesn't exist
if [ ! -f "${APP_DIR}/ecosystem.config.js" ]; then
    log "Creating PM2 ecosystem config..."
    cat > "${APP_DIR}/ecosystem.config.js" << 'EOF'
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
fi

log "✅ Setup complete!"
log ""
log "To deploy manually, run:"
log "  cd ${APP_DIR}"
log "  ./scripts/deploy.sh [branch-name]"
log ""
log "To rollback, run:"
log "  ./scripts/rollback.sh [backup-timestamp]"

