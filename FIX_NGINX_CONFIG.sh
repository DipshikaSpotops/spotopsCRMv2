#!/bin/bash
# Fix existing nginx config to accept IP address

echo "=== Step 1: Viewing current nginx config ==="
cat /etc/nginx/sites-available/spotops360.conf

echo ""
echo "=== Step 2: Updating server_name to accept IP address ==="

# Backup the current config
sudo cp /etc/nginx/sites-available/spotops360.conf /etc/nginx/sites-available/spotops360.conf.backup.$(date +%Y%m%d_%H%M%S)

# Check if we need to update server_name
if grep -q "server_name spotops360.com" /etc/nginx/sites-available/spotops360.conf; then
    echo "Found server_name with domain only. Updating to include IP..."
    
    # Add IP to server_name line
    sudo sed -i 's/server_name spotops360.com www.spotops360.com;/server_name 13.232.37.47 spotops360.com www.spotops360.com;/' /etc/nginx/sites-available/spotops360.conf
    
    # Also make it default_server if not already
    if ! grep -q "default_server" /etc/nginx/sites-available/spotops360.conf; then
        sudo sed -i 's/listen 80;/listen 80 default_server;/' /etc/nginx/sites-available/spotops360.conf
        sudo sed -i 's/listen \[::\]:80;/listen [::]:80 default_server;/' /etc/nginx/sites-available/spotops360.conf
    fi
else
    echo "Checking if already configured for IP access..."
fi

echo ""
echo "=== Step 3: Updated config ==="
cat /etc/nginx/sites-available/spotops360.conf

echo ""
echo "=== Step 4: Testing nginx configuration ==="
sudo nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Nginx config is valid"
    echo ""
    echo "=== Step 5: Reloading nginx ==="
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded"
    
    echo ""
    echo "=== Step 6: Testing API endpoint ==="
    echo "Testing backend directly:"
    curl -s http://localhost:5000/api/health || echo "❌ Backend not responding"
    
    echo ""
    echo "Testing through nginx:"
    curl -s http://localhost/api/health || echo "❌ Nginx not proxying"
    
    echo ""
    echo "✅ Done! Test from your local machine:"
    echo "curl http://13.232.37.47/api/health"
else
    echo ""
    echo "❌ Nginx config has errors. Restoring backup..."
    sudo cp /etc/nginx/sites-available/spotops360.conf.backup.* /etc/nginx/sites-available/spotops360.conf
    echo "Please check the nginx error output above."
fi
