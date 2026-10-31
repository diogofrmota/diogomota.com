#!/usr/bin/env bash
# Replaces the database with a dump made by infra/backup.sh, after a confirmation
# prompt. Run as deploy:
#   bash /opt/diogomota/infra/restore.sh /opt/diogomota/backups/diogomota_20261031-030000.sql.gz
#
# 1. Dumps the current database (infra/backup.sh), so the restore can be undone.
# 2. Loads the dump into a scratch database; if that fails, nothing else changes.
# 3. Stops the app, swaps the scratch database in, drops the old one.
# 4. If the app was running: applies pending migrations (the dump may be older
#    than the code) and starts it again.
# COMPOSE_FILE and BACKUP_DIR override the defaults, as in infra/backup.sh.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[[ $# -eq 1 ]] || die "usage: bash infra/restore.sh <dump.sql.gz>"
dump=$(realpath -e -- "$1") || die "$1 does not exist"
case $dump in
    *.gz) gzip -t "$dump" || die "$dump is not a valid gzip file"
          reader=(gzip -dc) ;;
    *)    reader=(cat) ;;
esac

cd "$ROOT"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

pg() { docker compose exec -T -e PGOPTIONS='-c client_min_messages=warning' postgres "$@"; }
# exec forwards stdin to the container; keep it off the confirmation below.
db=$(pg printenv POSTGRES_DB </dev/null)
user=$(pg printenv POSTGRES_USER </dev/null)
scratch="${db}_restore"
old="${db}_replaced"
admin_psql() { pg psql -X -q -v ON_ERROR_STOP=1 -U "$user" -d postgres "$@"; }

cat <<EOF
This REPLACES database "$db" with
  $dump ($(du -h "$dump" | cut -f1), from $(date -r "$dump" '+%Y-%m-%d %H:%M'))
Everything written since that dump is lost; a dump of the current state is taken first.
EOF
read -r -p "Type the database name ($db) to continue: " answer || true
[[ ${answer:-} == "$db" ]] || die "aborted; nothing changed"
exec </dev/null   # nothing below reads the terminal

log "Dumping the current database first"
bash "$ROOT/infra/backup.sh"

log "Loading the dump into scratch database $scratch"
admin_psql -c "DROP DATABASE IF EXISTS \"$scratch\"" -c "CREATE DATABASE \"$scratch\""
if ! "${reader[@]}" "$dump" |
    pg psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U "$user" -d "$scratch" >/dev/null; then
    admin_psql -c "DROP DATABASE IF EXISTS \"$scratch\""
    die "the dump did not load; $db was not touched"
fi

app_running=false
if docker compose ps --status running --services | grep -qx app; then
    app_running=true
    log "Stopping the app"
    docker compose stop app
fi

log "Swapping $scratch in as $db"
admin_psql -c "DROP DATABASE IF EXISTS \"$old\""
# One transaction: either both renames happen or neither.
if ! admin_psql -1 >/dev/null <<SQL; then
SELECT pg_terminate_backend(pid, 5000) FROM pg_stat_activity
 WHERE datname IN ('$db', '$scratch') AND pid <> pg_backend_pid();
ALTER DATABASE "$db" RENAME TO "$old";
ALTER DATABASE "$scratch" RENAME TO "$db";
SQL
    if $app_running; then docker compose start app; fi
    die "the swap failed; $db is unchanged (the loaded copy is in $scratch)"
fi
admin_psql -c "DROP DATABASE \"$old\" WITH (FORCE)" ||
    echo "Warning: could not drop $old; drop it by hand when convenient."

if $app_running; then
    log "Applying pending migrations"
    docker compose run --rm app npm run migrate
    log "Starting the app"
    docker compose up -d app
else
    echo "The app was not running; start it with: docker compose up -d app"
fi

log "Done: $db restored from $dump"
