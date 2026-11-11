#!/usr/bin/env bash
# Dumps the database to backups/<db>_<YYYYMMDD-HHMMSS>.sql.gz and archives the
# profile pictures (the app's data volume) to backups/avatars_<YYYYMMDD-HHMMSS>.tar.gz,
# then deletes both kinds older than 14 days. Run every 3 days by cron as deploy (infra/crontab); by hand:
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
stamp=$(date +%Y%m%d-%H%M%S)
file="$BACKUP_DIR/${db}_$stamp.sql.gz"
tmp="$file.partial"
avatars="$BACKUP_DIR/avatars_$stamp.tar.gz"
trap 'rm -f "$tmp" "$avatars.partial"' EXIT

# Plain SQL without owners or grants, so it loads into any database (infra/restore.sh).
# shellcheck disable=SC2016 # $POSTGRES_* expand inside the container
docker compose exec -T postgres sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' </dev/null |
    gzip > "$tmp"
gzip -t "$tmp"
mv "$tmp" "$file"
echo "Wrote $file ($(du -h "$file" | cut -f1))"

# The profile pictures (app/lib/avatars.ts), from the running app's data volume.
# Without a running app there is nothing to read them from: a note, not a
# failure, as the dump above is the backup that matters most.
if docker compose exec -T app test -d /app/data/avatars </dev/null 2>/dev/null; then
    docker compose exec -T app tar -czf - -C /app/data avatars </dev/null > "$avatars.partial"
    gzip -t "$avatars.partial"
    mv "$avatars.partial" "$avatars"
    echo "Wrote $avatars ($(du -h "$avatars" | cut -f1))"
else
    echo "Skipped the profile pictures: the app isn't running."
fi

# Only reached after a successful dump, so failing backups never delete the old ones.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "${db}_*.sql.gz" -o -name "avatars_*.tar.gz" \) \
    -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/Deleted /'
