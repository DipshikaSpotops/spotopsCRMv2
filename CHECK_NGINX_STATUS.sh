#!/bin/bash
# Check nginx status and configuration

echo "=== Checking if nginx is installed ==="
nginx -v 2>&1 || echo "❌ Nginx not installed"

echo ""
echo "=== Checking nginx service status ==="
sudo systemctl status nginx | head -10

echo ""
echo "=== Checking if config file exists ==="
if [ -f /etc/nginx/sites-available/spotops360 ]; then
    echo "✅ File exists"
    echo "File size:"
    ls -lh /etc/nginx/sites-available/spotops360
    echo ""
    echo "File contents:"
    cat /etc/nginx/sites-available/spotops360
else
    echo "❌ File does NOT exist"
fi

echo ""
echo "=== Checking enabled nginx sites ==="
ls -la /etc/nginx/sites-enabled/

echo ""
echo "=== Checking default nginx config ==="
if [ -f /etc/nginx/sites-enabled/default ]; then
    echo "⚠️  Default config is enabled"
    cat /etc/nginx/sites-enabled/default
else
    echo "✅ Default config not enabled"
fi

echo ""
echo "=== Checking nginx.conf includes ==="
grep -A 5 "include.*sites-enabled" /etc/nginx/nginx.conf || echo "No sites-enabled include found"

echo ""
echo "=== Testing nginx configuration ==="
sudo nginx -t
