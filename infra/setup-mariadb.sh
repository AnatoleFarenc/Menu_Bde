#!/usr/bin/env bash
# Installs and configures MariaDB for BOTH prod and staging, on the same VPS
# instance. A single MariaDB instance, two isolated databases (bde_sandwich /
# bde_sandwich_staging) with a dedicated user per database, permissions
# limited to that database only -- same separation logic as bde-app /
# bde-app-staging at the filesystem level.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "This script must be run as root (sudo)." >&2
  exit 1
fi

echo "▶ Installing mariadb-server..."
apt-get update -qq
apt-get install -y mariadb-server

echo "▶ Restricting network listening to localhost only..."
CONF="/etc/mysql/mariadb.conf.d/50-server.cnf"
if grep -q '^bind-address' "$CONF"; then
  sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' "$CONF"
else
  echo "bind-address = 127.0.0.1" >> "$CONF"
fi

systemctl enable --now mariadb
systemctl restart mariadb

echo "▶ Securing the installation (equivalent of mysql_secure_installation)..."
mysql -u root <<'SQL'
DELETE FROM mysql.global_priv WHERE User='';
DELETE FROM mysql.global_priv WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
FLUSH PRIVILEGES;
SQL

PROD_PW=$(openssl rand -base64 24)
STAGING_PW=$(openssl rand -base64 24)

echo "▶ Creating the dedicated databases and users (prod / staging)..."
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
echo "✅ MariaDB installed and configured (listening on localhost only)."
echo ""
echo "Add this line to /opt/Menu_Bde/.env (PRODUCTION):"
echo "DATABASE_URL=\"mysql://bde_app:${PROD_PW}@localhost:3306/bde_sandwich\""
echo ""
echo "Add this line to /opt/Menu_Bde-staging/.env (STAGING):"
echo "DATABASE_URL=\"mysql://bde_app_staging:${STAGING_PW}@localhost:3306/bde_sandwich_staging\""
echo ""
echo "⚠️  These passwords are only shown once: copy them now."