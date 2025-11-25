# Git Pull Resolution Steps for EC2 Server

## Situation:
- Branch has diverged (65 local commits vs 1 remote commit)
- Local changes to `client/bundle-report.html` and other files blocking pull
- `bundle-report.html` is likely a generated build file

## Option 1: Stash Changes, Pull, Then Reapply (Recommended)

```bash
# 1. Stash your local changes
git stash

# 2. Pull the remote changes
git pull

# 3. If you need your stashed changes back
git stash pop

# 4. If there are conflicts after stash pop, resolve them
# Then commit if needed
```

## Option 2: Discard bundle-report.html and Pull

```bash
# 1. Discard changes to the generated file
git restore client/bundle-report.html

# 2. Pull with rebase to avoid merge commit
git pull --rebase

# OR pull with merge
git pull
```

## Option 3: Commit Your Changes First, Then Pull

```bash
# 1. Add and commit your local changes
git add client/package.json client/vite.config.js package.json package-lock.json
git commit -m "Update dependencies and config"

# 2. Discard bundle-report.html (it's generated)
git restore client/bundle-report.html

# 3. Pull with rebase
git pull --rebase

# OR pull with merge (will create merge commit)
git pull
```

## Option 4: Force Pull (Use with Caution - Loses Local Changes)

```bash
# WARNING: This will discard ALL local changes
# Only use if you're sure you don't need them

# 1. Reset to match remote exactly
git fetch origin
git reset --hard origin/main

# 2. Clean any untracked files
git clean -fd
```

## Recommended Approach for Your Situation:

Since `bundle-report.html` is a generated file and you have other important changes:

```bash
# 1. Discard the generated file
git restore client/bundle-report.html

# 2. Check what other changes you have
git diff client/package.json client/vite.config.js

# 3. If you want to keep the other changes, commit them
git add client/package.json client/vite.config.js package.json package-lock.json
git commit -m "Update package dependencies and config"

# 4. Pull with rebase to keep history clean
git pull --rebase origin main

# 5. If there are conflicts during rebase, resolve them
# Then continue:
git rebase --continue
```

## If Rebase Has Conflicts:

```bash
# 1. See which files have conflicts
git status

# 2. Resolve conflicts in the files
# Edit the conflicted files, remove conflict markers

# 3. After resolving, stage the files
git add <resolved-files>

# 4. Continue the rebase
git rebase --continue

# 5. If you want to abort the rebase
git rebase --abort
```

## After Successful Pull:

```bash
# Rebuild if needed
cd client
npm install
npm run build

# The bundle-report.html will be regenerated
```


