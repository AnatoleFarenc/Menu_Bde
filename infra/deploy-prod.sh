#!/usr/bin/env bash
# Deploys the latest version of the main branch to production (bde42perpignan.fr).
# The code is owned by the bde-app system user: file operations are therefore
# run under its identity (sudo -u bde-app).
set -euo pipefail
cd /opt/Menu_Bde

# bde-app is a --no-create-home system account: it has no writable $HOME, so
# npm (cache) and other tools need one pointed elsewhere. Use the app
# directory it already owns.
APP_HOME=/opt/Menu_Bde

echo "▶ git pull (main)..."
sudo -u bde-app HOME="$APP_HOME" git pull origin main
echo "▶ npm install..."
sudo -u bde-app HOME="$APP_HOME" npm install --no-audit --no-fund
# npm install's postinstall hook already runs this, but making it explicit
# means a schema change is never silently served by a stale Prisma Client
# (e.g. new columns coming back undefined) even if that hook is ever
# skipped -- cheap to run twice.
echo "▶ Prisma generate (client)..."
sudo -u bde-app HOME="$APP_HOME" npx prisma generate
echo "▶ Prisma migrations (MariaDB)..."
sudo -u bde-app HOME="$APP_HOME" npx prisma migrate deploy
echo "▶ build..."
sudo -u bde-app HOME="$APP_HOME" npm run build
echo "▶ Restarting prod service..."
sudo systemctl restart bde-menu
sleep 2
sudo systemctl is-active bde-menu && echo "✅ Prod deployed: https://bde42perpignan.fr"
