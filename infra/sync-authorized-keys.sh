#!/usr/bin/env bash
# Applies infra/authorized_keys to the current user's ~/.ssh/authorized_keys file.
# Run this on the VPS after a `git pull` on main.
#
#   cd /opt/Menu_Bde && git pull && infra/sync-authorized-keys.sh
#
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/authorized_keys"
DEST="$HOME/.ssh/authorized_keys"

if [ ! -f "$SRC" ]; then
  echo "❌ Source file not found: $SRC"
  exit 1
fi

# Only keep actual key lines (ignore comments and blank lines)
CLEAN="$(grep -E '^(ssh-|ecdsa-|sk-)' "$SRC" || true)"

if [ -z "$CLEAN" ]; then
  echo "❌ No valid ssh key found in $SRC. Aborting. (do not empty authorized_keys)."
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

echo "✅ $COUNT key(s) applied to $DEST"
echo "   Old version backup: $DEST.bak-*"
