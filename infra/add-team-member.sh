#!/usr/bin/env bash
# Crée un compte pour un nouveau membre de l'équipe et lui donne un accès SSH.
#
#   sudo infra/add-team-member.sh <username> <pseudo-github> [ops|admin]
#
# - Doit être lancé via `sudo` par quelqu'un qui a DÉJÀ les droits admin
#   (groupe `sudo`) — un membre `bde-ops` ou le compte de déploiement `debian`
#   ne peuvent pas l'exécuter (leurs droits sudo sont trop restreints pour ça).
# - rôle "ops" (par défaut) : accès limité — build/déploiement du STAGING
#   uniquement, lecture seule (statut/logs) sur la prod. Aucun accès root.
# - rôle "admin" : accès complet (groupe `sudo`, mot de passe requis).
# - Importe la/les clé(s) SSH publique(s) du compte GitHub indiqué.
# - Génère un mot de passe temporaire fort, affiché UNE SEULE FOIS, à changer
#   obligatoirement à la première connexion.
# - Journalise l'action (qui, quand, pour qui, quel rôle) — jamais le mot de passe.
set -euo pipefail

AUDIT_LOG="/var/log/bde-team-changes.log"

# --- 0. Doit tourner en root (donc via sudo, par un admin) ---
if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Ce script doit être lancé avec sudo, par un compte du groupe 'sudo'." >&2
  exit 1
fi
ADMIN="${SUDO_USER:-}"
if [ -z "$ADMIN" ]; then
  echo "❌ Impossible d'identifier l'administrateur à l'origine de l'action (lance via sudo, pas en root direct)." >&2
  exit 1
fi

# --- 1. Arguments ---
USERNAME="${1:-}"
GH_USER="${2:-}"
ROLE="${3:-ops}"

if [ -z "$USERNAME" ] || [ -z "$GH_USER" ]; then
  echo "Usage : sudo infra/add-team-member.sh <username> <pseudo-github> [ops|admin]"
  exit 1
fi
if [ "$ROLE" != "ops" ] && [ "$ROLE" != "admin" ]; then
  echo "❌ Rôle invalide : '$ROLE' (attendu : ops ou admin)"
  exit 1
fi
if ! printf '%s' "$USERNAME" | grep -qE '^[a-z][a-z0-9_-]{2,31}$'; then
  echo "❌ Nom d'utilisateur invalide : '$USERNAME' (minuscules/chiffres/tirets, 3-32 caractères, commence par une lettre)"
  exit 1
fi
if id "$USERNAME" &>/dev/null; then
  echo "❌ Le compte '$USERNAME' existe déjà."
  exit 1
fi
if ! printf '%s' "$GH_USER" | grep -qE '^[A-Za-z0-9-]+$'; then
  echo "❌ Pseudo GitHub invalide : '$GH_USER'"
  exit 1
fi

# --- 2. Récupérer les clés SSH publiques depuis GitHub ---
KEYS_URL="https://github.com/${GH_USER}.keys"
TMP_KEYS="$(mktemp)"
trap 'rm -f "$TMP_KEYS"' EXIT

HTTP_CODE="$(curl -fsS --max-time 15 -o "$TMP_KEYS" -w '%{http_code}' "$KEYS_URL" || true)"
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Récupération impossible pour '$GH_USER' (HTTP $HTTP_CODE)."
  exit 1
fi
KEYS="$(grep -E '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-) ' "$TMP_KEYS" || true)"
if [ -z "$KEYS" ]; then
  echo "❌ Le compte GitHub '$GH_USER' n'a aucune clé SSH publique."
  echo "   Il doit en ajouter une dans https://github.com/settings/keys"
  exit 1
fi

# --- 3. Créer le compte ---
useradd -m -s /bin/bash -c "BDE team member - github $GH_USER" "$USERNAME"

mkdir -p "/home/$USERNAME/.ssh"
printf '%s\n' "$KEYS" > "/home/$USERNAME/.ssh/authorized_keys"
chown -R "$USERNAME:$USERNAME" "/home/$USERNAME/.ssh"
chmod 700 "/home/$USERNAME/.ssh"
chmod 600 "/home/$USERNAME/.ssh/authorized_keys"

if [ "$ROLE" = "admin" ]; then
  usermod -aG sudo "$USERNAME"
else
  usermod -aG bde-ops "$USERNAME"
fi

# --- 4. Mot de passe temporaire, à changer obligatoirement à la 1ère connexion ---
TEMP_PASSWORD="$(openssl rand -base64 30 | tr -d '\n')"
echo "${USERNAME}:${TEMP_PASSWORD}" | chpasswd
chage -d 0 "$USERNAME"

# --- 5. Journal d'audit (jamais le mot de passe) ---
echo "$(date -Is) admin=${ADMIN} action=create_user target=${USERNAME} github=${GH_USER} role=${ROLE}" >> "$AUDIT_LOG"

echo
echo "✅ Compte '$USERNAME' créé (rôle : $ROLE)."
echo
echo "   Mot de passe temporaire (à transmettre à la personne EN DEHORS de ce terminal,"
echo "   ex. message chiffré/en main propre — il ne sera plus jamais affiché) :"
echo
echo "     $TEMP_PASSWORD"
echo
echo "   Il devra le changer obligatoirement à sa première connexion sudo."
echo "   Connexion : ssh -p 2231 ${USERNAME}@149.202.57.96"
