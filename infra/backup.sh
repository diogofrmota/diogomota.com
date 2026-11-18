#!/usr/bin/env bash
# Dumps the database to backups/<db>_<YYYYMMDD-HHMMSS>.sql.gz and archives the
# files on the app's data volume: the profile pictures to
# backups/avatars_<YYYYMMDD-HHMMSS>.tar.gz and the recipes' photos to
# backups/recipe-photos_<YYYYMMDD-HHMMSS>.tar.gz; then deletes each kind older
# than 14 days. Run every 3 days by cron as deploy (infra/crontab); by hand:
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
trap 'rm -f "$tmp" "$BACKUP_DIR"/*_"$stamp".tar.gz.partial' EXIT

# Plain SQL without owners or grants, so it loads into any database (infra/restore.sh).
# shellcheck disable=SC2016 # $POSTGRES_* expand inside the container
docker compose exec -T postgres sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' </dev/null |
    gzip > "$tmp"
gzip -t "$tmp"
mv "$tmp" "$file"
echo "Wrote $file ($(du -h "$file" | cut -f1))"

# Only prune a category after its verified replacement was installed. Always
# exclude that replacement, even if the host clock or file times are unusual.
prune() {
    local pattern=$1 replacement=$2
    find "$BACKUP_DIR" -maxdepth 1 -type f -name "$pattern" ! -name "$(basename "$replacement")" \
        -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/Deleted /'
}
prune "${db}_*.sql.gz" "$file"

# A folder of the running app's data volume, as backups/<folder>_<stamp>.tar.gz:
# the profile pictures (app/lib/avatars.ts) and the recipes' photos
# (app/lib/recipe-photos.ts). Without a running app there is nothing to read
# them from, and a folder nothing has been written to yet isn't there: a note,
# not a failure, as the dump above is the backup that matters most.
archive() {
    local folder=$1 what=$2
    local out="$BACKUP_DIR/${folder}_$stamp.tar.gz"
    if docker compose exec -T app test -d "/app/data/$folder" </dev/null 2>/dev/null; then
        if ! docker compose exec -T app tar -czf - -C /app/data "$folder" </dev/null > "$out.partial" ||
           ! tar -tzf "$out.partial" >/dev/null; then
            echo "FAILED $what: retained previous archives."
            return 1
        fi
        mv "$out.partial" "$out" || return 1
        echo "Wrote $out ($(du -h "$out" | cut -f1))"
        prune "${folder}_*.tar.gz" "$out"
    else
        echo "DEGRADED: skipped $what; retained previous archives (app unavailable or directory absent)."
        return 1
    fi
}
degraded=0
archive avatars "the profile pictures" || degraded=1
archive recipe-photos "the recipes' photos" || degraded=1
exit "$degraded"
