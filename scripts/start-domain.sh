#!/usr/bin/env bash
#
# Lance le site BDE 42 derrière ton propre nom de domaine via Cloudflare Tunnel.
#
#   ./scripts/start-domain.sh
#
# Prérequis (une seule fois, voir README section "Ton propre nom de domaine") :
#   1. Le domaine est géré par Cloudflare (nameservers migrés depuis IONOS).
#   2. cloudflared tunnel login
#   3. cloudflared tunnel create bde42-emporium
#   4. cloudflared tunnel route dns bde42-emporium emporium.bde42perpignan.fr
#   5. Le fichier ~/.cloudflared/config.yml existe (créé par ce script au 1er lancement
#      s'il est absent, à partir de TUNNEL_NAME/HOSTNAME/PORT).
#
# L'URL publique ne change jamais tant que le tunnel et le DNS restent identiques.

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-5001}"
TUNNEL_NAME="${TUNNEL_NAME:-bde42-emporium}"
HOSTNAME="${HOSTNAME:-emporium.bde42perpignan.fr}"
CONFIG_FILE="$HOME/.cloudflared/config.yml"

# --- 1. cloudflared installé ? -----------------------------------------------
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared n'est pas installé. Voir https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

# --- 2. Authentifié auprès de Cloudflare ? -----------------------------------
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  echo "❌ Pas encore authentifié auprès de Cloudflare."
  echo "   Lance d'abord : cloudflared tunnel login"
  exit 1
fi

# --- 3. Tunnel créé et routé ? ------------------------------------------------
TUNNEL_ID="$(cloudflared tunnel list --output json 2>/dev/null | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  try{const arr=JSON.parse(d);const t=arr.find(x=>x.name===process.env.TUNNEL_NAME);
  process.stdout.write(t?t.id:"")}catch(e){}
})')"
if [ -z "$TUNNEL_ID" ]; then
  echo "❌ Le tunnel \"$TUNNEL_NAME\" n'existe pas encore."
  echo "   Lance d'abord : cloudflared tunnel create $TUNNEL_NAME"
  echo "   Puis          : cloudflared tunnel route dns $TUNNEL_NAME $HOSTNAME"
  exit 1
fi

CREDS_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"

# --- 4. Fichier de config (créé si absent) -----------------------------------
if [ ! -f "$CONFIG_FILE" ]; then
  echo "▶ Création de $CONFIG_FILE"
  cat > "$CONFIG_FILE" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CREDS_FILE
ingress:
  - hostname: $HOSTNAME
    service: http://localhost:$PORT
  - service: http_status:404
EOF
fi

echo
echo "════════════════════════════════════════════════════════════════"
echo "  URL publique stable : https://$HOSTNAME"
echo "  Redirect URI OAuth  : https://$HOSTNAME/api/auth/42/callback"
echo "════════════════════════════════════════════════════════════════"

if ! grep -qE "^\s*PUBLIC_APP_URL\s*=\s*https://${HOSTNAME}\s*$" .env 2>/dev/null; then
  echo "⚠  À faire UNE fois :"
  echo "   • dans .env      → PUBLIC_APP_URL=https://$HOSTNAME   (et supprime INTRA42_REDIRECT_URI)"
  echo "   • app OAuth 42   → ajoute la Redirect URI ci-dessus"
  echo
fi

# --- 5. Build + tunnel + serveur --------------------------------------------
echo "▶ Build du frontend…"
npm run build

cleanup() {
  echo
  echo "▶ Arrêt du tunnel…"
  kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ Ouverture du tunnel Cloudflare : $HOSTNAME → localhost:$PORT …"
cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME" &
TUNNEL_PID=$!
sleep 2

echo "▶ Serveur démarré. Ctrl+C pour tout arrêter."
NODE_ENV=production npm run server
