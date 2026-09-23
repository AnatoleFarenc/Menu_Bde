#!/usr/bin/env bash
# Daily local backup of the MariaDB databases (prod + staging): a compressed
# mysqldump per database, timestamped, with old ones pruned automatically.
# Local-only by design (see SECURITY.md "Known limitations") -- protects
# against a bad migration, a bug, or an accidental delete, NOT against the
# VPS itself being lost. Meant to be run as root from a cron job (root's
# `mysql -u root` needs no password, same unix_socket auth setup-mariadb.sh
# relies on):
#
#   0 4 * * * /opt/Menu_Bde/infra/backup-db.sh >> /var/log/bde-backup.log 2>&1
#
# The dumps contain personal data (student logins/names/emails, order
# history, CGU acceptance records) -- the backup directory and every file in
# it are kept root-only (700/600), same posture as the app's own .env files.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "This script must be run as root (sudo)." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/bde-menu}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATABASES=(bde_sandwich bde_sandwich_staging)

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

for db in "${DATABASES[@]}"; do
  if ! mysql -u root -e "USE ${db}" >/dev/null 2>&1; then
    echo "⏭  ${db}: database absent, skipping."
    continue
  fi
  dest="${BACKUP_DIR}/${db}_${TIMESTAMP}.sql.gz"
  echo "▶ Dumping ${db} -> ${dest}"
  mysqldump -u root --single-transaction --routines --events "$db" | gzip > "$dest"
  chmod 600 "$dest"
done

echo "▶ Pruning dumps older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete

echo "✅ Backup done: $(du -sh "$BACKUP_DIR" | cut -f1) total in ${BACKUP_DIR}"
