#!/usr/bin/env bash
# Deploys the latest version of the main branch to production (bde42perpignan.fr).
# The code is owned by the bde-app system user: file operations are therefore
# run under its identity (sudo -u bde-app).
set -euo pipefail
cd /opt/Menu_Bde

# bde-app is a --no-create-home system account: it has no writable $HOME, so
# npm needs its cache pointed elsewhere explicitly. Setting HOME on the sudo
# command line itself (`sudo -u bde-app HOME=... npm ...`) does NOT work
# here: `debian`'s restricted sudoers rule resets the environment and
# silently drops that assignment, so npm still tries (and fails) to write to
# bde-app's nonexistent /home/bde-app. A `--cache` flag sidesteps HOME
# entirely -- no environment variable for sudo to strip.
APP_HOME=/opt/Menu_Bde
NPM_CACHE="$APP_HOME/.npm-cache"

echo "▶ git pull (main)..."
sudo -u bde-app git pull origin main
echo "▶ npm install..."
sudo -u bde-app npm install --no-audit --no-fund --cache="$NPM_CACHE"
# npm install's postinstall hook already runs this, but making it explicit
# means a schema change is never silently served by a stale Prisma Client
# (e.g. new columns coming back undefined) even if that hook is ever
# skipped -- cheap to run twice.
echo "▶ Prisma generate (client)..."
sudo -u bde-app npx --cache="$NPM_CACHE" prisma generate
echo "▶ Prisma migrations (MariaDB)..."
sudo -u bde-app npx --cache="$NPM_CACHE" prisma migrate deploy
echo "▶ build..."
sudo -u bde-app npm run build --cache="$NPM_CACHE"
echo "▶ Restarting prod service..."
sudo systemctl restart bde-menu
sleep 2
sudo systemctl is-active bde-menu && echo "✅ Prod deployed: https://bde42perpignan.fr"
