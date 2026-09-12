#!/usr/bin/env bash
# Déploie la dernière version de la branche main sur la prod (bde42perpignan.fr).
# Le code appartient à l'utilisateur système bde-app : les opérations sur les
# fichiers sont donc exécutées sous son identité (sudo -u bde-app).
set -euo pipefail
cd /opt/Menu_Bde
echo "▶ git pull (main)..."
sudo -u bde-app git pull origin main
echo "▶ npm install..."
sudo -u bde-app npm install --no-audit --no-fund
echo "▶ build..."
sudo -u bde-app npm run build
echo "▶ Restarting prod service..."
sudo systemctl restart bde-menu
sleep 2
sudo systemctl is-active bde-menu && echo "✅ Prod deployed : https://bde42perpignan.fr"
