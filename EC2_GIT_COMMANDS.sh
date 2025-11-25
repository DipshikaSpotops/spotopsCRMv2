#!/bin/bash
# Quick Git Resolution Commands for EC2
# Copy and paste these commands one by one on your EC2 server

# Step 1: Discard the generated bundle-report.html file
git restore client/bundle-report.html

# Step 2: Check what other changes you have (review this output)
git diff client/package.json client/vite.config.js package.json package-lock.json

# Step 3A: If you want to KEEP your other changes, commit them first:
# git add client/package.json client/vite.config.js package.json package-lock.json
# git commit -m "Update dependencies and config"

# Step 3B: If you want to DISCARD all other changes too:
# git restore client/package.json client/vite.config.js package.json package-lock.json

# Step 4: Pull with rebase (cleaner history)
git pull --rebase origin main

# OR Step 4 Alternative: Pull with merge (creates merge commit)
# git pull origin main

# Step 5: If rebase has conflicts, resolve them then:
# git add <resolved-files>
# git rebase --continue

# Step 6: After successful pull, rebuild if needed
# cd client && npm install && npm run build


