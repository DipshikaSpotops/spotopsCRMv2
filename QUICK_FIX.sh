#!/bin/bash
# Quickest fix - run these 3 commands on EC2:

# 1. Discard the generated file
git restore client/bundle-report.html

# 2. Pull with rebase
git pull --rebase origin main

# 3. If conflicts appear, you'll need to resolve them manually
# Otherwise, you're done!


