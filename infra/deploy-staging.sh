#!/usr/bin/env bash
# Deploys the latest version of the dev branch to the staging environment.
# The code is owned by the bde-app-staging system user (separate from bde-app,
# the production account): file operations run under its identity.
set -euo pipefail
cd /opt/Menu_Bde-staging
echo "▶ git pull (dev)..."
sudo -u bde-app-staging git pull origin dev
echo "▶ npm install..."
sudo -u bde-app-staging npm install --no-audit --no-fund
echo "▶ Prisma migrations (MariaDB)..."
sudo -u bde-app-staging npx prisma migrate deploy
echo "▶ build..."
sudo -u bde-app-staging npm run build
echo "▶ Restarting staging service..."
sudo systemctl restart bde-menu-staging
sleep 2
sudo systemctl is-active bde-menu-staging && echo "✅ Staging deployed: https://dev.bde42perpignan.fr"
