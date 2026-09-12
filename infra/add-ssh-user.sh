#!/usr/bin/env bash
# Adds a GitHub account's public SSH keys to infra/authorized_keys.
#
#   infra/add-ssh-user.sh <github-username> ["First Last - role"]
#
# The script ONLY modifies the source file infra/authorized_keys.
# Then: git add / commit / push, followed by `infra/sync-authorized-keys.sh` on the VPS.
#
# Real access control:
#   - who can edit the list   = who can push to the main branch
#   - who can apply it to the VPS = who already has SSH access to run the sync
set -euo pipefail

GH_USER="${1:-}"
if [ -z "$GH_USER" ]; then
  echo "Usage: infra/add-ssh-user.sh <github username> [\"<Name> <Surname> - role\"]"
  exit 1
fi
# pseudo GitHub : lettres, chiffres, tirets uniquement
if ! printf '%s' "$GH_USER" | grep -qE '^[A-Za-z0-9-]+$'; then
  echo "❌ Invalid GitHub username: '$GH_USER'"
  exit 1
fi

COMMENT="${2:-$GH_USER (github)}"
KEYS_URL="https://github.com/${GH_USER}.keys"
DEST="$(cd "$(dirname "$0")" && pwd)/authorized_keys"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

HTTP_CODE="$(curl -fsS --max-time 15 -o "$TMP" -w '%{http_code}' "$KEYS_URL" || true)"
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ GitHub account not found: '$GH_USER' (HTTP $HTTP_CODE). Make sure the account exists, and that you typed it correctly."
  exit 1
fi

KEYS="$(grep -E '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-|sk-ssh-ed25519|sk-ecdsa-sha2-) ' "$TMP" || true)"
if [ -z "$KEYS" ]; then
  echo "❌ The GitHub account '$GH_USER' does not have a public SSH key."
  echo "   They can add one at https://github.com/settings/keys"
  exit 1
fi

touch "$DEST"
ADDED=0
while IFS= read -r key; do
  [ -z "$key" ] && continue
  key_body="$(printf '%s' "$key" | awk '{print $2}')"
  if grep -qF -- "$key_body" "$DEST"; then
    echo "↷ key already present, no changes were made"
    continue
  fi
  printf '%s %s\n' "$key" "$COMMENT" >> "$DEST"
  ADDED=$((ADDED + 1))
done <<< "$KEYS"

echo
if [ "$ADDED" -eq 0 ]; then
  echo "ℹ️  No changes were made (all keys for '$GH_USER' have already been added)."
else
  echo "✅ $ADDED key(s) added pour '$GH_USER'."
fi
echo
echo "Next steps:"
echo "  git add infra/authorized_keys && git commit -m \"ssh: access $GH_USER\" && git push"
echo "  then on the VPS:  cd /opt/Menu_Bde && git pull && infra/sync-authorized-keys.sh"
