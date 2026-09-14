#!/usr/bin/env bash
# Deploys the latest version of the dev branch to the staging environment.
# The code is owned by the bde-app-staging system user (separate from bde-app,
# the production account): file operations run under its identity.
set -euo pipefail
cd /opt/Menu_Bde-staging

# bde-app-staging is a --no-create-home system account: it has no writable
# $HOME, so npm (cache) and other tools need one pointed elsewhere. Use the
# app directory it already owns.
APP_HOME=/opt/Menu_Bde-staging

echo "▶ git pull (dev)..."
sudo -u bde-app-staging HOME="$APP_HOME" git pull origin dev
echo "▶ npm install..."
sudo -u bde-app-staging HOME="$APP_HOME" npm install --no-audit --no-fund
echo "▶ Prisma migrations (MariaDB)..."
sudo -u bde-app-staging HOME="$APP_HOME" npx prisma migrate deploy
echo "▶ build..."
sudo -u bde-app-staging HOME="$APP_HOME" npm run build
echo "▶ Restarting staging service..."
sudo systemctl restart bde-menu-staging
sleep 2
sudo systemctl is-active bde-menu-staging && echo "✅ Staging deployed: https://dev.bde42perpignan.fr"
