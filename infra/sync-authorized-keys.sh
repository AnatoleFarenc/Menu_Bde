#!/usr/bin/env bash
# Applique infra/authorized_keys au fichier ~/.ssh/authorized_keys de l'utilisateur courant.
# À lancer sur le VPS après un `git pull` sur main.
#
#   cd /opt/Menu_Bde && git pull && infra/sync-authorized-keys.sh
#
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/authorized_keys"
DEST="$HOME/.ssh/authorized_keys"

if [ ! -f "$SRC" ]; then
  echo "❌ Fichier source introuvable : $SRC"
  exit 1
fi

# Ne garde que les vraies lignes de clés (ignore commentaires et lignes vides)
CLEAN="$(grep -E '^(ssh-|ecdsa-|sk-)' "$SRC" || true)"

if [ -z "$CLEAN" ]; then
  echo "❌ Aucune clé valide dans $SRC — abandon (on ne vide pas authorized_keys)."
  exit 1
fi

COUNT="$(printf '%s\n' "$CLEAN" | wc -l)"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [ -f "$DEST" ]; then
  cp "$DEST" "$DEST.bak-$(date +%Y%m%d-%H%M%S)"
fi

printf '%s\n' "$CLEAN" > "$DEST"
chmod 600 "$DEST"

echo "✅ $COUNT clé(s) appliquée(s) dans $DEST"
echo "   Sauvegarde de l'ancienne version : $DEST.bak-*"
