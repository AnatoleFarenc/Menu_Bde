#!/usr/bin/env bash
# Deploys the latest version of the main branch to production (bde42perpignan.fr).
# The code is owned by the bde-app system user: file operations are therefore
# run under its identity (sudo -u bde-app).
set -euo pipefail
cd /opt/Menu_Bde
echo "▶ git pull (main)..."
sudo -u bde-app git pull origin main
echo "▶ npm install..."
sudo -u bde-app npm install --no-audit --no-fund
echo "▶ Prisma migrations (MariaDB)..."
sudo -u bde-app npx prisma migrate deploy
echo "▶ build..."
sudo -u bde-app npm run build
echo "▶ Restarting prod service..."
sudo systemctl restart bde-menu
sleep 2
sudo systemctl is-active bde-menu && echo "✅ Prod deployed: https://bde42perpignan.fr"
