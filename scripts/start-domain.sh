#!/usr/bin/env bash
#
# Starts the BDE 42 site behind your own domain name via Cloudflare Tunnel.
#
#   ./scripts/start-domain.sh
#
# Prerequisites (one time only, see README section "Your own domain name"):
#   1. The domain is managed by Cloudflare (nameservers migrated from IONOS).
#   2. cloudflared tunnel login
#   3. cloudflared tunnel create bde42-emporium
#   4. cloudflared tunnel route dns bde42-emporium emporium.bde42perpignan.fr
#   5. The file ~/.cloudflared/config.yml exists (created by this script on
#      first run if missing, from TUNNEL_NAME/HOSTNAME/PORT).
#
# The public URL never changes as long as the tunnel and DNS stay the same.

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-5001}"
TUNNEL_NAME="${TUNNEL_NAME:-bde42-emporium}"
HOSTNAME="${HOSTNAME:-emporium.bde42perpignan.fr}"
CONFIG_FILE="$HOME/.cloudflared/config.yml"

# --- 1. Is cloudflared installed? --------------------------------------------
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared is not installed. See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

# --- 2. Authenticated with Cloudflare? ---------------------------------------
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  echo "❌ Not yet authenticated with Cloudflare."
  echo "   Run first: cloudflared tunnel login"
  exit 1
fi

# --- 3. Tunnel created and routed? -------------------------------------------
TUNNEL_ID="$(cloudflared tunnel list --output json 2>/dev/null | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  try{const arr=JSON.parse(d);const t=arr.find(x=>x.name===process.env.TUNNEL_NAME);
  process.stdout.write(t?t.id:"")}catch(e){}
})')"
if [ -z "$TUNNEL_ID" ]; then
  echo "❌ The tunnel \"$TUNNEL_NAME\" doesn't exist yet."
  echo "   Run first: cloudflared tunnel create $TUNNEL_NAME"
  echo "   Then:      cloudflared tunnel route dns $TUNNEL_NAME $HOSTNAME"
  exit 1
fi

CREDS_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"

# --- 4. Config file (created if missing) -------------------------------------
if [ ! -f "$CONFIG_FILE" ]; then
  echo "▶ Creating $CONFIG_FILE"
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
echo "  Stable public URL  : https://$HOSTNAME"
echo "  OAuth Redirect URI  : https://$HOSTNAME/api/auth/42/callback"
echo "════════════════════════════════════════════════════════════════"

if ! grep -qE "^\s*PUBLIC_APP_URL\s*=\s*https://${HOSTNAME}\s*$" .env 2>/dev/null; then
  echo "⚠  To do ONCE:"
  echo "   • in .env        → PUBLIC_APP_URL=https://$HOSTNAME   (and remove INTRA42_REDIRECT_URI)"
  echo "   • 42 OAuth app   → add the Redirect URI above"
  echo
fi

# --- 5. Build + tunnel + server ----------------------------------------------
echo "▶ Building the frontend..."
npm run build

cleanup() {
  echo
  echo "▶ Stopping the tunnel..."
  kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ Opening the Cloudflare tunnel: $HOSTNAME → localhost:$PORT ..."
cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME" &
TUNNEL_PID=$!
sleep 2

echo "▶ Server started. Ctrl+C to stop everything."
NODE_ENV=production npm run server
