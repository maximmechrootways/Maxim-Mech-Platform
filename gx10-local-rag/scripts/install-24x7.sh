#!/usr/bin/env bash
# One-time install on the GX10: Docker on boot + compose stack + 5-min tunnel watchdog.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing $ROOT/.env — copy .env.example and set CLOUDFLARE_TUNNEL_TOKEN + GX10_API_KEY first."
  exit 1
fi

chmod +x "$ROOT/scripts/keep-alive.sh"

sudo systemctl enable --now docker

sudo cp "$ROOT/gx10-local-rag.service" /etc/systemd/system/
sudo cp "$ROOT/gx10-watchdog.service" /etc/systemd/system/
sudo cp "$ROOT/gx10-watchdog.timer" /etc/systemd/system/
sudo systemctl daemon-reload

sudo systemctl enable --now gx10-local-rag.service
sudo systemctl enable --now gx10-watchdog.timer

docker compose up -d

echo ""
echo "Installed. Status:"
systemctl is-enabled docker gx10-local-rag.service gx10-watchdog.timer || true
docker compose ps
echo ""
echo "Public health (may take ~30s after tunnel connects):"
curl -sS --max-time 20 https://gx10.maximmech.com/health || echo "(not reachable yet — check Cloudflare tunnel token / hostname)"
echo ""
echo "Watchdog log: $ROOT/watchdog.log"
echo "Timer: systemctl list-timers | grep gx10"
