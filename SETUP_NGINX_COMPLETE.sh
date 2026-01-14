#!/bin/bash
# Complete nginx setup script for spotops360

echo "=== Step 1: Checking nginx installation ==="
if ! command -v nginx &> /dev/null; then
    echo "❌ Nginx not installed. Installing..."
    sudo apt update
    sudo apt install -y nginx
else
    echo "✅ Nginx is installed"
    nginx -v
fi

echo ""
echo "=== Step 2: Checking nginx directories ==="
if [ ! -d /etc/nginx/sites-available ]; then
    echo "Creating sites-available directory..."
    sudo mkdir -p /etc/nginx/sites-available
fi

if [ ! -d /etc/nginx/sites-enabled ]; then
    echo "Creating sites-enabled directory..."
    sudo mkdir -p /etc/nginx/sites-enabled
fi

echo ""
echo "=== Step 3: Listing existing nginx configs ==="
echo "sites-available:"
ls -la /etc/nginx/sites-available/ 2>/dev/null || echo "  (empty)"
echo ""
echo "sites-enabled:"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo "  (empty)"

echo ""
echo "=== Step 4: Creating nginx configuration ==="
sudo tee /etc/nginx/sites-available/spotops360 > /dev/null << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;  # Accept any domain/IP
    
    # --- Security ---
    location ~ /\. { deny all; }
    
    # --- API proxy ---
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_intercept_errors off;
    }
    
    # --- WebSocket / Socket.IO ---
    location /socket.io/ {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_pass http://127.0.0.1:5000;
    }
    
    # --- Frontend (React Vite build) ---
    root /var/www/spotopsCRMv2/client/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

echo "✅ Configuration file created at /etc/nginx/sites-available/spotops360"

echo ""
echo "=== Step 5: Enabling the site ==="
sudo ln -sf /etc/nginx/sites-available/spotops360 /etc/nginx/sites-enabled/spotops360

echo "=== Step 6: Removing default config (if exists) ==="
sudo rm -f /etc/nginx/sites-enabled/default

echo ""
echo "=== Step 7: Verifying frontend directory exists ==="
if [ ! -d /var/www/spotopsCRMv2/client/dist ]; then
    echo "⚠️  Warning: Frontend directory /var/www/spotopsCRMv2/client/dist does not exist"
    echo "   You may need to build the frontend first:"
    echo "   cd /var/www/spotopsCRMv2/client && npm run build"
else
    echo "✅ Frontend directory exists"
fi

echo ""
echo "=== Step 8: Testing nginx configuration ==="
sudo nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Nginx config is valid"
    echo ""
    echo "=== Step 9: Reloading nginx ==="
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded"
    
    echo ""
    echo "=== Step 10: Checking nginx status ==="
    sudo systemctl status nginx --no-pager | head -5
    
    echo ""
    echo "=== Step 11: Testing API endpoint locally ==="
    echo "Testing backend directly:"
    curl -s http://localhost:5000/api/health || echo "❌ Backend not responding on port 5000"
    
    echo ""
    echo "Testing through nginx:"
    curl -s http://localhost/api/health || echo "❌ Nginx not proxying correctly"
    
    echo ""
    echo "=== ✅ Setup Complete! ==="
    echo ""
    echo "Test from your local machine:"
    echo "curl http://13.232.37.47/api/health"
else
    echo ""
    echo "❌ Nginx config has errors. Please check the output above."
    echo "Common issues:"
    echo "  - Frontend directory doesn't exist (see Step 7)"
    echo "  - Backend not running on port 5000"
fi
