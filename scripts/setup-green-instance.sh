#!/bin/bash
# Setup script for Green instance (new environment for blue-green deployment)
# This script sets up a new EC2 instance with the current production version
# Usage: Run this on the NEW (green) EC2 instance

set -e

APP_DIR="/var/www/spotopsCRMv2"
GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/your-org/your-repo.git}"  # Update with your repo
BRANCH="${1:-main}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    error "Please run as root or with sudo"
    exit 1
fi

log "Starting Green instance setup..."

# Step 1: Update system
log "Step 1: Updating system packages..."
apt-get update -y
apt-get upgrade -y

# Step 2: Install required packages
log "Step 2: Installing required packages..."
apt-get install -y \
    curl \
    git \
    nginx \
    build-essential \
    software-properties-common

# Step 3: Install Node.js (LTS version)
log "Step 3: Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Step 4: Install PM2 globally
log "Step 4: Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    pm2 startup systemd -u ubuntu --hp /home/ubuntu
fi

# Step 5: Create application directory
log "Step 5: Creating application directory..."
mkdir -p "$APP_DIR"
chown -R ubuntu:ubuntu "$APP_DIR"

# Step 6: Clone repository (or update if exists)
log "Step 6: Setting up repository..."
if [ -d "$APP_DIR/.git" ]; then
    warn "Repository already exists, pulling latest..."
    cd "$APP_DIR"
    sudo -u ubuntu git fetch origin
    sudo -u ubuntu git checkout "$BRANCH"
    sudo -u ubuntu git pull origin "$BRANCH"
else
    info "Cloning repository..."
    cd /var/www
    sudo -u ubuntu git clone "$GIT_REPO_URL" spotopsCRMv2
    cd "$APP_DIR"
    sudo -u ubuntu git checkout "$BRANCH"
fi

# Step 7: Install dependencies
log "Step 7: Installing backend dependencies..."
cd "$APP_DIR/backend"
sudo -u ubuntu npm install --production

log "Step 8: Installing frontend dependencies..."
cd "$APP_DIR/client"
sudo -u ubuntu npm install

# Step 8: Build frontend
log "Step 9: Building frontend..."
sudo -u ubuntu npm run build

# Step 9: Copy environment files (if they exist on blue instance)
log "Step 10: Setting up environment..."
warn "⚠️  IMPORTANT: You need to manually copy environment files:"
warn "   - backend/.env (if exists)"
warn "   - backend/credentials.json (Gmail OAuth)"
warn "   - backend/token.json (Gmail OAuth token)"
warn "   - Any other secrets/config files"
warn ""
warn "You can copy from blue instance using:"
warn "  scp ubuntu@BLUE_IP:/var/www/spotopsCRMv2/backend/.env $APP_DIR/backend/"
warn "  scp ubuntu@BLUE_IP:/var/www/spotopsCRMv2/backend/credentials.json $APP_DIR/backend/"
warn "  scp ubuntu@BLUE_IP:/var/www/spotopsCRMv2/backend/token.json $APP_DIR/backend/"

# Step 10: Setup PM2 ecosystem
log "Step 11: Setting up PM2..."
cd "$APP_DIR"
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'spotops360-api-green',
    script: './backend/server.js',
    cwd: '/var/www/spotopsCRMv2',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5001  // Different port for green instance
    },
    error_file: '/home/ubuntu/.pm2/logs/spotops360-api-green-error.log',
    out_file: '/home/ubuntu/.pm2/logs/spotops360-api-green-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF

chown ubuntu:ubuntu ecosystem.config.js

# Step 11: Start application on green port (5001)
log "Step 12: Starting application on port 5001 (green)..."
sudo -u ubuntu pm2 start ecosystem.config.js
sudo -u ubuntu pm2 save

# Step 12: Setup nginx for green instance
log "Step 13: Setting up Nginx configuration..."
cat > /etc/nginx/sites-available/spotops360-green.conf << 'EOF'
server {
  listen 8080;  # Different port for green instance
  server_name _;

  # Security
  location ~ /\. { deny all; }

  # API proxy
  location ^~ /api/ {
    proxy_pass http://127.0.0.1:5001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_intercept_errors off;
  }

  # WebSocket / Socket.IO
  location /socket.io/ {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_pass http://127.0.0.1:5001;
  }

  # Frontend
  root /var/www/spotopsCRMv2/client/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/spotops360-green.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
nginx -t && systemctl reload nginx

# Step 13: Setup firewall (if ufw is enabled)
if command -v ufw &> /dev/null; then
    log "Step 14: Configuring firewall..."
    ufw allow 8080/tcp
    ufw allow 22/tcp
    ufw --force enable || true
fi

# Step 14: Health check
log "Step 15: Running health check..."
sleep 3
if curl -f http://localhost:5001/api/health > /dev/null 2>&1; then
    log "✅ Green instance is healthy!"
else
    warn "⚠️  Health check failed. Check logs: pm2 logs spotops360-api-green"
fi

log ""
log "✅ Green instance setup complete!"
log ""
info "Green instance details:"
info "  - App directory: $APP_DIR"
info "  - Backend port: 5001"
info "  - Nginx port: 8080"
info "  - PM2 app name: spotops360-api-green"
info ""
warn "Next steps:"
warn "  1. Copy environment files from blue instance"
warn "  2. Test green instance: curl http://GREEN_IP:8080/api/health"
warn "  3. Setup load balancer or nginx upstream to switch between blue/green"
warn "  4. Test thoroughly before switching traffic"



