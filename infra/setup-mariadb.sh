#!/usr/bin/env bash
# Installe et configure MariaDB pour la prod ET le staging, sur la même instance
# VPS. Une seule instance MariaDB, deux bases isolées (bde_sandwich /
# bde_sandwich_staging) avec un utilisateur dédié par base, à droits limités à
# cette seule base -- même logique de séparation que bde-app / bde-app-staging
# au niveau du système de fichiers.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être lancé en root (sudo)." >&2
  exit 1
fi

echo "▶ Installation de mariadb-server..."
apt-get update -qq
apt-get install -y mariadb-server

echo "▶ Restriction de l'écoute réseau à localhost uniquement..."
CONF="/etc/mysql/mariadb.conf.d/50-server.cnf"
if grep -q '^bind-address' "$CONF"; then
  sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' "$CONF"
else
  echo "bind-address = 127.0.0.1" >> "$CONF"
fi

systemctl enable --now mariadb
systemctl restart mariadb

echo "▶ Sécurisation de l'installation (équivalent mysql_secure_installation)..."
mysql -u root <<'SQL'
DELETE FROM mysql.global_priv WHERE User='';
DELETE FROM mysql.global_priv WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
FLUSH PRIVILEGES;
SQL

PROD_PW=$(openssl rand -base64 24)
STAGING_PW=$(openssl rand -base64 24)

echo "▶ Création des bases et des utilisateurs dédiés (prod / staging)..."
mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS bde_sandwich CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS bde_sandwich_staging CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'bde_app'@'localhost' IDENTIFIED BY '${PROD_PW}';
CREATE USER IF NOT EXISTS 'bde_app_staging'@'localhost' IDENTIFIED BY '${STAGING_PW}';

GRANT ALL PRIVILEGES ON bde_sandwich.* TO 'bde_app'@'localhost';
GRANT ALL PRIVILEGES ON bde_sandwich_staging.* TO 'bde_app_staging'@'localhost';

FLUSH PRIVILEGES;
SQL

echo ""
echo "✅ MariaDB installé et configuré (écoute localhost uniquement)."
echo ""
echo "Ajoute cette ligne dans /opt/Menu_Bde/.env (PRODUCTION) :"
echo "DATABASE_URL=\"mysql://bde_app:${PROD_PW}@localhost:3306/bde_sandwich\""
echo ""
echo "Ajoute cette ligne dans /opt/Menu_Bde-staging/.env (STAGING) :"
echo "DATABASE_URL=\"mysql://bde_app_staging:${STAGING_PW}@localhost:3306/bde_sandwich_staging\""
echo ""
echo "⚠️  Ces mots de passe ne sont affichés qu'une seule fois : copie-les maintenant."
