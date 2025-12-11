#!/bin/bash
# Quick setup script for new server migration
# Run this on the NEW server (13.232.37.47)
# Usage: ./scripts/migrate-to-new-server.sh

set -e

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

log "Starting new server setup for migration..."

# Check if running as root or with sudo
if [ "$EUID" -eq 0 ]; then
    error "Please run this script as a regular user (not root). It will use sudo when needed."
    exit 1
fi

# Step 1: Install system dependencies
log "Step 1: Installing system dependencies..."
sudo apt update
sudo apt upgrade -y

# Check Node.js
if ! command -v node &> /dev/null; then
    log "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    log "Node.js already installed: $(node --version)"
fi

# Check PM2
if ! command -v pm2 &> /dev/null; then
    log "Installing PM2..."
    sudo npm install -g pm2
else
    log "PM2 already installed: $(pm2 --version)"
fi

# Check nginx
if ! command -v nginx &> /dev/null; then
    log "Installing nginx..."
    sudo apt install nginx -y
else
    log "Nginx already installed"
fi

# Step 2: Create app directory
log "Step 2: Setting up application directory..."
if [ ! -d "$APP_DIR" ]; then
    sudo mkdir -p "$APP_DIR"
    sudo chown -R $CURRENT_USER:$CURRENT_USER "$APP_DIR"
    log "Created $APP_DIR"
else
    log "Directory $APP_DIR already exists"
fi

# Step 3: Check if repository is cloned
log "Step 3: Checking repository..."
cd "$APP_DIR" || exit 1

if [ ! -d ".git" ]; then
    warn "Git repository not found. Please clone your repository:"
    warn "  cd $APP_DIR"
    warn "  git clone <your-repo-url> ."
    read -p "Press Enter after you've cloned the repository..."
fi

# Step 4: Pull latest code
log "Step 4: Pulling latest code..."
git fetch origin
git pull origin main || {
    warn "Git pull failed. Make sure repository is set up correctly."
}

# Step 5: Install backend dependencies
log "Step 5: Installing backend dependencies..."
cd "$APP_DIR/backend" || exit 1
if [ ! -f "package.json" ]; then
    error "package.json not found in backend directory"
    exit 1
fi
npm install --production

# Step 6: Install frontend dependencies and build
log "Step 6: Building frontend..."
cd "$APP_DIR/client" || exit 1
if [ ! -f "package.json" ]; then
    error "package.json not found in client directory"
    exit 1
fi
npm install
npm run build

# Step 7: Check for .env file
log "Step 7: Checking environment configuration..."
if [ ! -f "$APP_DIR/backend/.env" ]; then
    warn "⚠️  .env file not found!"
    warn "Please copy .env from your current server:"
    warn "  scp backend/.env $CURRENT_USER@13.232.37.47:$APP_DIR/backend/.env"
    warn ""
    warn "Also copy credentials.json and token.json if needed:"
    warn "  scp backend/credentials.json $CURRENT_USER@13.232.37.47:$APP_DIR/backend/credentials.json"
    warn "  scp backend/token.json $CURRENT_USER@13.232.37.47:$APP_DIR/backend/token.json"
    read -p "Press Enter after you've copied the .env file..."
fi

# Step 8: Setup PM2
log "Step 8: Setting up PM2..."
if [ -f "$APP_DIR/scripts/setup-deploy.sh" ]; then
    chmod +x "$APP_DIR/scripts/setup-deploy.sh"
    "$APP_DIR/scripts/setup-deploy.sh"
else
    warn "setup-deploy.sh not found. Creating basic PM2 config..."
    cat > "$APP_DIR/ecosystem.config.js" << 'EOF'
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

# Step 9: Configure nginx
log "Step 9: Configuring nginx..."
NGINX_CONFIG="/etc/nginx/sites-available/spotops360"

if [ ! -f "$NGINX_CONFIG" ]; then
    log "Creating nginx configuration..."
    sudo tee "$NGINX_CONFIG" > /dev/null << 'EOF'
server {
    listen 80;
    server_name 13.232.37.47;  # Will be updated to spotops360.com after DNS migration
    
    # Frontend
    location / {
        root /var/www/spotopsCRMv2/client/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket support
    location /socket.io {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

    sudo ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl reload nginx
    log "Nginx configured and reloaded"
else
    log "Nginx configuration already exists"
fi

# Step 10: Start application
log "Step 10: Starting application with PM2..."
cd "$APP_DIR" || exit 1
pm2 start ecosystem.config.js || pm2 restart spotops360-api
pm2 save

# Step 11: Health check
log "Step 11: Running health check..."
sleep 3

MAX_RETRIES=5
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
    log "✅ Application is healthy!"
else
    error "❌ Health check failed. Check logs: pm2 logs spotops360-api"
    exit 1
fi

# Step 12: Test via IP
log "Step 12: Testing via IP address..."
if curl -f http://13.232.37.47/api/health > /dev/null 2>&1; then
    log "✅ Server is accessible via IP: http://13.232.37.47"
else
    warn "⚠️  Server not accessible via IP. Check firewall and nginx configuration."
fi

# Summary
log ""
log "=========================================="
log "✅ Setup Complete!"
log "=========================================="
log ""
log "Next steps:"
log "1. Verify application is running:"
log "   pm2 status"
log "   pm2 logs spotops360-api"
log ""
log "2. Test endpoints:"
log "   curl http://13.232.37.47/api/health"
log "   curl http://13.232.37.47/"
log ""
log "3. Follow ZERO_DOWNTIME_MIGRATION.md for DNS migration steps"
log ""
log "4. After DNS migration, update nginx server_name:"
log "   sudo nano /etc/nginx/sites-available/spotops360"
log "   # Change: server_name 13.232.37.47;"
log "   # To: server_name spotops360.com www.spotops360.com;"
log "   sudo nginx -t && sudo systemctl reload nginx"
log ""
log "5. Set up SSL certificate (if using HTTPS):"
log "   sudo certbot --nginx -d spotops360.com -d www.spotops360.com"
log ""

