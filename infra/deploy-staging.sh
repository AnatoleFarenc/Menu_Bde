#!/usr/bin/env bash
# Déploie la dernière version de la branche dev sur l'environnement de test.
# Le code appartient à l'utilisateur système bde-app-staging (séparé de bde-app,
# le compte de la prod) : les opérations fichiers s'exécutent sous son identité.
set -euo pipefail
cd /opt/Menu_Bde-staging
echo "▶ git pull (dev)…"
sudo -u bde-app-staging git pull origin dev
echo "▶ npm install…"
sudo -u bde-app-staging npm install --no-audit --no-fund
echo "▶ migrations Prisma (base MariaDB)…"
sudo -u bde-app-staging npx prisma migrate deploy
echo "▶ build…"
sudo -u bde-app-staging npm run build
echo "▶ redémarrage du service staging…"
sudo systemctl restart bde-menu-staging
sleep 2
sudo systemctl is-active bde-menu-staging && echo "✅ Staging déployé : https://dev.bde42perpignan.fr"
