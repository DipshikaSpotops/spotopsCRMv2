#!/bin/bash
# Copy and paste these commands on EC2 one by one:

# 1. Go to root
cd /var/www/spotopsCRMv2

# 2. Discard generated file
git restore client/bundle-report.html

# 3. Discard other local changes to match remote exactly
git restore client/package.json client/vite.config.js package.json package-lock.json

# 4. Pull latest from remote
git pull origin main

# 5. Rebuild
cd client
npm install
npm run build


