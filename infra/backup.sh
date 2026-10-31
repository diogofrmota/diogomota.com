#!/usr/bin/env bash
# Dumps the database to backups/<db>_<YYYYMMDD-HHMMSS>.sql.gz, then deletes dumps
# older than 14 days. Run every 3 days by cron as deploy (infra/crontab); by hand:
#   bash /opt/diogomota/infra/backup.sh
# COMPOSE_FILE and BACKUP_DIR override the defaults (e.g. to test against the dev stack).
set -euo pipefail

RETENTION_DAYS=14

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"

echo "== $(date -Is) backup"
umask 077
mkdir -p "$BACKUP_DIR"

# </dev/null: exec forwards stdin, which a caller (infra/restore.sh) may still need.
db=$(docker compose exec -T postgres printenv POSTGRES_DB </dev/null)
file="$BACKUP_DIR/${db}_$(date +%Y%m%d-%H%M%S).sql.gz"
tmp="$file.partial"
trap 'rm -f "$tmp"' EXIT

# Plain SQL without owners or grants, so it loads into any database (infra/restore.sh).
# shellcheck disable=SC2016 # $POSTGRES_* expand inside the container
docker compose exec -T postgres sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' </dev/null |
    gzip > "$tmp"
gzip -t "$tmp"
mv "$tmp" "$file"
echo "Wrote $file ($(du -h "$file" | cut -f1))"

# Only reached after a successful dump, so failing backups never delete the old ones.
find "$BACKUP_DIR" -maxdepth 1 -type f -name "${db}_*.sql.gz" -mtime +"$RETENTION_DAYS" \
    -print -delete | sed 's/^/Deleted /'
