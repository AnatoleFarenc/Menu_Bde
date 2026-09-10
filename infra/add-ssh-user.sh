#!/usr/bin/env bash
# Ajoute les clés SSH publiques d'un compte GitHub à infra/authorized_keys.
#
#   infra/add-ssh-user.sh <pseudo-github> ["Prénom Nom - rôle"]
#
# Le script NE modifie QUE le fichier source infra/authorized_keys.
# Ensuite : git add / commit / push, puis sur le VPS `infra/sync-authorized-keys.sh`.
#
# Contrôle d'accès réel :
#   - qui peut modifier la liste  = qui a le droit de push sur la branche main
#   - qui peut l'appliquer au VPS = qui a déjà un accès SSH pour lancer le sync
set -euo pipefail

GH_USER="${1:-}"
if [ -z "$GH_USER" ]; then
  echo "Usage : infra/add-ssh-user.sh <pseudo-github> [\"Prénom Nom - rôle\"]"
  exit 1
fi
# pseudo GitHub : lettres, chiffres, tirets uniquement
if ! printf '%s' "$GH_USER" | grep -qE '^[A-Za-z0-9-]+$'; then
  echo "❌ Pseudo GitHub invalide : '$GH_USER'"
  exit 1
fi

COMMENT="${2:-$GH_USER (github)}"
KEYS_URL="https://github.com/${GH_USER}.keys"
DEST="$(cd "$(dirname "$0")" && pwd)/authorized_keys"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

HTTP_CODE="$(curl -fsS --max-time 15 -o "$TMP" -w '%{http_code}' "$KEYS_URL" || true)"
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Récupération impossible pour '$GH_USER' (HTTP $HTTP_CODE) — le compte GitHub existe-t-il ?"
  exit 1
fi

KEYS="$(grep -E '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-|sk-ssh-ed25519|sk-ecdsa-sha2-) ' "$TMP" || true)"
if [ -z "$KEYS" ]; then
  echo "❌ Le compte GitHub '$GH_USER' n'a aucune clé SSH publique."
  echo "   Il doit en ajouter une dans https://github.com/settings/keys"
  exit 1
fi

touch "$DEST"
ADDED=0
while IFS= read -r key; do
  [ -z "$key" ] && continue
  key_body="$(printf '%s' "$key" | awk '{print $2}')"
  if grep -qF -- "$key_body" "$DEST"; then
    echo "↷ clé déjà présente, ignorée"
    continue
  fi
  printf '%s %s\n' "$key" "$COMMENT" >> "$DEST"
  ADDED=$((ADDED + 1))
done <<< "$KEYS"

echo
if [ "$ADDED" -eq 0 ]; then
  echo "ℹ️  Rien ajouté (toutes les clés de '$GH_USER' étaient déjà là)."
else
  echo "✅ $ADDED clé(s) ajoutée(s) pour '$GH_USER'."
fi
echo
echo "Étapes suivantes :"
echo "  git add infra/authorized_keys && git commit -m \"ssh: accès $GH_USER\" && git push"
echo "  puis sur le VPS :  cd /opt/Menu_Bde && git pull && infra/sync-authorized-keys.sh"
