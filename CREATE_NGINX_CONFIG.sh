#!/bin/bash
# Create nginx configuration file

echo "=== Creating nginx configuration ==="

sudo tee /etc/nginx/sites-available/spotops360 > /dev/null << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;  # Accept any domain/IP for now
    
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

echo "✅ Configuration file created"

echo ""
echo "=== Enabling the site ==="
sudo ln -sf /etc/nginx/sites-available/spotops360 /etc/nginx/sites-enabled/spotops360

echo "=== Removing default config (if exists) ==="
sudo rm -f /etc/nginx/sites-enabled/default

echo ""
echo "=== Testing nginx configuration ==="
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx config is valid"
    echo ""
    echo "=== Reloading nginx ==="
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded"
    echo ""
    echo "=== Testing API endpoint ==="
    curl http://localhost/api/health
    echo ""
    echo ""
    echo "✅ Done! Test from your local machine:"
    echo "curl http://13.232.37.47/api/health"
else
    echo "❌ Nginx config has errors. Please check the output above."
fi
