#!/usr/bin/env bash
# Renews the Let's Encrypt certificate when it is due (certbot decides: within 30
# days of expiry), then reloads nginx so it serves the current files.
# Run twice daily by cron as deploy (infra/crontab); by hand:
#   bash /opt/diogomota/infra/renew-cert.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

echo "== $(date -Is) renew-cert"
docker compose run --rm certbot renew --non-interactive
docker compose exec -T nginx nginx -t -q
docker compose exec -T nginx nginx -s reload
echo "== $(date -Is) nginx reloaded"
