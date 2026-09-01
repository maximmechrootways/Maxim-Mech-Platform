#!/usr/bin/env bash
# Keep GX10 local RAG + Cloudflare tunnel alive for maximmech.com Local Archive.
# Intended for cron or systemd timer every few minutes.
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/home/maximmech/gx10-local-rag}"
HEALTH_URL="${HEALTH_URL:-https://gx10.maximmech.com/health}"
LOG="${LOG:-/home/maximmech/gx10-local-rag/watchdog.log}"

cd "$COMPOSE_DIR"

mkdir -p "$(dirname "$LOG")"
ts() { date -Is; }

# Ensure compose stack is up (no-op if already running)
if ! docker compose ps --status running --services 2>/dev/null | grep -qx api; then
  echo "$(ts) api not running — docker compose up -d" >>"$LOG"
  docker compose up -d >>"$LOG" 2>&1 || true
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx cloudflared; then
  echo "$(ts) cloudflared not running — restarting" >>"$LOG"
  docker compose up -d cloudflared >>"$LOG" 2>&1 || true
  sleep 5
fi

# Probe public tunnel
code=$(curl -sS -o /tmp/gx10-health.json -w "%{http_code}" --max-time 15 "$HEALTH_URL" || echo "000")
if [[ "$code" != "200" ]]; then
  echo "$(ts) health $HEALTH_URL -> HTTP $code — bounce cloudflared+api" >>"$LOG"
  docker compose restart cloudflared api >>"$LOG" 2>&1 || docker compose up -d >>"$LOG" 2>&1 || true
fi
