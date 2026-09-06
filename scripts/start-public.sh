#!/usr/bin/env bash
#
# Lance le site BDE 42 derrière une URL HTTPS stable via Tailscale Funnel.
#
#   ./scripts/start-public.sh
#
# Prérequis (une seule fois) :
#   1. curl -fsSL https://tailscale.com/install.sh | sh
#   2. Activer HTTPS + Funnel pour le tailnet : https://login.tailscale.com/admin/dns
#      et https://login.tailscale.com/admin/settings/funnel
#      (le premier lancement de Funnel affiche sinon un lien pour l'activer)
#
# L'URL publique ne change jamais tant que le nom de la machine et le tailnet
# restent identiques. Pour passer plus tard à ton propre nom de domaine, il
# suffira de changer PUBLIC_APP_URL dans .env (voir README).

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-5001}"
TS_HOSTNAME="${TS_HOSTNAME:-bde-42}"

# --- 1. Tailscale installé ? ---------------------------------------------------
if ! command -v tailscale >/dev/null 2>&1; then
  echo "❌ Tailscale n'est pas installé. Lance :"
  echo "     curl -fsSL https://tailscale.com/install.sh | sh"
  exit 1
fi

# --- 2. Démon tailscaled (mode userspace, adapté à WSL2) ---------------------
if ! tailscale status >/dev/null 2>&1; then
  if ! pgrep -x tailscaled >/dev/null 2>&1; then
    echo "▶ Démarrage de tailscaled (userspace networking)…"
    sudo -b sh -c 'tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state >/tmp/tailscaled.log 2>&1'
    sleep 2
  fi
  echo "▶ Connexion au tailnet (lien d'authentification affiché au 1er lancement)…"
  sudo tailscale up --hostname="$TS_HOSTNAME"
fi

# Autorise l'utilisateur courant à piloter tailscale sans sudo (funnel, status…).
if ! tailscale funnel status >/dev/null 2>&1; then
  sudo tailscale set --operator="$USER" 2>/dev/null || true
fi

# --- 3. URL publique stable --------------------------------------------------
TS_URL="$(tailscale status --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const n=(j.Self&&j.Self.DNSName||"").replace(/\.$/,"");process.stdout.write(n?"https://"+n:"")}catch(e){}})')"
if [ -z "$TS_URL" ]; then
  echo "❌ URL Tailscale introuvable. Vérifie avec : tailscale status"
  exit 1
fi

echo
echo "════════════════════════════════════════════════════════════════"
echo "  URL publique stable : $TS_URL"
echo "  Redirect URI OAuth  : $TS_URL/api/auth/42/callback"
echo "════════════════════════════════════════════════════════════════"

if ! grep -qE "^\s*PUBLIC_APP_URL\s*=\s*${TS_URL}\s*$" .env 2>/dev/null; then
  echo "⚠  À faire UNE fois :"
  echo "   • dans .env      → PUBLIC_APP_URL=$TS_URL   (et supprime INTRA42_REDIRECT_URI)"
  echo "   • app OAuth 42   → ajoute la Redirect URI ci-dessus (garde aussi celle en localhost)"
  echo
fi

# --- 4. Build + Funnel + serveur -------------------------------------------
echo "▶ Build du frontend…"
npm run build

echo "▶ Ouverture du Funnel : 443 (public) → localhost:$PORT …"
funnel_out="$(tailscale funnel --bg "$PORT" 2>&1 || true)"
[ -n "$funnel_out" ] && printf '%s\n' "$funnel_out"
if printf '%s' "$funnel_out" | grep -qiE "not enabled|to enable"; then
  echo
  echo "❌ Funnel n'est pas encore activé sur ton tailnet."
  echo "   1. Ouvre ce lien et valide l'activation :"
  printf '%s' "$funnel_out" | grep -oE 'https://login\.tailscale\.com/f/funnel\?[^ ]+' | head -1
  echo "   2. Vérifie 'HTTPS Certificates' sur https://login.tailscale.com/admin/dns"
  echo "   3. Relance : npm run start:public"
  exit 1
fi
tailscale funnel status || true

cleanup() {
  echo
  echo "▶ Fermeture du Funnel…"
  tailscale serve reset 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ Serveur démarré. Ctrl+C pour tout arrêter."
NODE_ENV=production npm run server
