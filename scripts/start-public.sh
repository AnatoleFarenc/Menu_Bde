#!/usr/bin/env bash
#
# Starts the BDE 42 site behind a stable HTTPS URL via Tailscale Funnel.
#
#   ./scripts/start-public.sh
#
# Prerequisites (one time only):
#   1. curl -fsSL https://tailscale.com/install.sh | sh
#   2. Enable HTTPS + Funnel for the tailnet: https://login.tailscale.com/admin/dns
#      and https://login.tailscale.com/admin/settings/funnel
#      (the first Funnel launch otherwise shows a link to enable it)
#
# The public URL never changes as long as the machine name and tailnet stay
# the same. To switch later to your own domain name, just change
# PUBLIC_APP_URL in .env (see README).

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-5001}"
TS_HOSTNAME="${TS_HOSTNAME:-bde-42}"

# --- 1. Is Tailscale installed? ------------------------------------------------
if ! command -v tailscale >/dev/null 2>&1; then
  echo "❌ Tailscale is not installed. Run:"
  echo "     curl -fsSL https://tailscale.com/install.sh | sh"
  exit 1
fi

# --- 2. tailscaled daemon (userspace mode, suited for WSL2) ------------------
if ! tailscale status >/dev/null 2>&1; then
  if ! pgrep -x tailscaled >/dev/null 2>&1; then
    echo "▶ Starting tailscaled (userspace networking)..."
    sudo -b sh -c 'tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state >/tmp/tailscaled.log 2>&1'
    sleep 2
  fi
  echo "▶ Connecting to the tailnet (auth link shown on first launch)..."
  sudo tailscale up --hostname="$TS_HOSTNAME"
fi

# Allows the current user to drive tailscale without sudo (funnel, status...).
if ! tailscale funnel status >/dev/null 2>&1; then
  sudo tailscale set --operator="$USER" 2>/dev/null || true
fi

# --- 3. Stable public URL ----------------------------------------------------
TS_URL="$(tailscale status --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const n=(j.Self&&j.Self.DNSName||"").replace(/\.$/,"");process.stdout.write(n?"https://"+n:"")}catch(e){}})')"
if [ -z "$TS_URL" ]; then
  echo "❌ Tailscale URL not found. Check with: tailscale status"
  exit 1
fi

echo
echo "════════════════════════════════════════════════════════════════"
echo "  Stable public URL  : $TS_URL"
echo "  OAuth Redirect URI  : $TS_URL/api/auth/42/callback"
echo "════════════════════════════════════════════════════════════════"

if ! grep -qE "^\s*PUBLIC_APP_URL\s*=\s*${TS_URL}\s*$" .env 2>/dev/null; then
  echo "⚠  To do ONCE:"
  echo "   • in .env        → PUBLIC_APP_URL=$TS_URL   (and remove INTRA42_REDIRECT_URI)"
  echo "   • 42 OAuth app   → add the Redirect URI above (also keep the localhost one)"
  echo
fi

# --- 4. Build + Funnel + server -------------------------------------------
echo "▶ Building the frontend..."
npm run build

echo "▶ Opening the Funnel: 443 (public) → localhost:$PORT ..."
funnel_out="$(tailscale funnel --bg "$PORT" 2>&1 || true)"
[ -n "$funnel_out" ] && printf '%s\n' "$funnel_out"
if printf '%s' "$funnel_out" | grep -qiE "not enabled|to enable"; then
  echo
  echo "❌ Funnel is not yet enabled on your tailnet."
  echo "   1. Open this link and confirm activation:"
  printf '%s' "$funnel_out" | grep -oE 'https://login\.tailscale\.com/f/funnel\?[^ ]+' | head -1
  echo "   2. Check 'HTTPS Certificates' at https://login.tailscale.com/admin/dns"
  echo "   3. Restart: npm run start:public"
  exit 1
fi
tailscale funnel status || true

cleanup() {
  echo
  echo "▶ Closing the Funnel..."
  tailscale serve reset 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ Server started. Ctrl+C to stop everything."
NODE_ENV=production npm run server
