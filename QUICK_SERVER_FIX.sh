#!/bin/bash
# Quick fix script for 404 error on server

echo "=== Step 1: Testing backend directly ==="
curl -v http://localhost:5000/api/health
echo ""

echo "=== Step 2: Checking nginx configuration ==="
sudo cat /etc/nginx/sites-available/spotops360 | grep -A 2 "server_name"

echo ""
echo "=== Step 3: Fixing nginx to accept IP address ==="

# Backup current config
sudo cp /etc/nginx/sites-available/spotops360 /etc/nginx/sites-available/spotops360.backup

# Update server_name to include IP
sudo sed -i 's/server_name spotops360.com www.spotops360.com;/server_name 13.232.37.47 spotops360.com www.spotops360.com;/' /etc/nginx/sites-available/spotops360

# OR make it default_server for easier testing
# Uncomment this line if you want catch-all instead:
# sudo sed -i 's/listen 80;/listen 80 default_server;/' /etc/nginx/sites-available/spotops360
# sudo sed -i 's/server_name .*/server_name _;/' /etc/nginx/sites-available/spotops360

echo "=== Step 4: Testing nginx configuration ==="
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx config is valid"
    echo "=== Step 5: Reloading nginx ==="
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded"
    echo ""
    echo "=== Step 6: Testing from server ==="
    curl http://localhost/api/health
    echo ""
    echo "✅ Done! Now test from your local machine:"
    echo "curl http://13.232.37.47/api/health"
else
    echo "❌ Nginx config has errors. Check the output above."
    echo "Restoring backup..."
    sudo cp /etc/nginx/sites-available/spotops360.backup /etc/nginx/sites-available/spotops360
fi
