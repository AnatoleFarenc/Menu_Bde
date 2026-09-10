#!/usr/bin/env bash
# Déploie la dernière version de la branche dev sur l'environnement de test.
# Le code appartient à l'utilisateur système bde-app : les opérations sur les
# fichiers sont donc exécutées sous son identité (sudo -u bde-app).
set -euo pipefail
cd /opt/Menu_Bde-staging
echo "▶ git pull (dev)…"
sudo -u bde-app git pull origin dev
echo "▶ npm install…"
sudo -u bde-app npm install --no-audit --no-fund
echo "▶ build…"
sudo -u bde-app npm run build
echo "▶ redémarrage du service staging…"
sudo systemctl restart bde-menu-staging
sleep 2
sudo systemctl is-active bde-menu-staging && echo "✅ Staging déployé : https://dev.bde42perpignan.fr"
