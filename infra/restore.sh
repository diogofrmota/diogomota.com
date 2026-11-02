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
# If the database does not exist (dropped), 1 is skipped and 3 only renames.
#
# With --dry-run, nothing changes: it loads the dump into another scratch
# database, prints its row counts per table beside the live database's, and
# drops it again. No prompt, so it is safe to run any time:
#   bash /opt/diogomota/infra/restore.sh --dry-run /opt/diogomota/backups/diogomota_20261031-030000.sql.gz
# COMPOSE_FILE and BACKUP_DIR override the defaults, as in infra/backup.sh.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

dry_run=false
if [[ ${1:-} == --dry-run ]]; then
    dry_run=true
    shift
fi
[[ $# -eq 1 ]] || die "usage: bash infra/restore.sh [--dry-run] <dump.sql.gz>"
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
check="${db}_dryrun"
admin_psql() { pg psql -X -q -v ON_ERROR_STOP=1 -U "$user" -d postgres "$@"; }

db_exists() {
    [[ $(admin_psql -At -c "SELECT 1 FROM pg_database WHERE datname = '$1'" </dev/null) == 1 ]]
}

# (Re)creates database $1 and loads the dump into it, in one transaction. On
# failure the database is dropped again and this returns non-zero.
load_into() {
    admin_psql -c "DROP DATABASE IF EXISTS \"$1\"" -c "CREATE DATABASE \"$1\"" </dev/null || return 1
    if ! "${reader[@]}" "$dump" |
        pg psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U "$user" -d "$1" >/dev/null; then
        admin_psql -c "DROP DATABASE IF EXISTS \"$1\"" </dev/null
        return 1
    fi
}

# One "table rows" line per table of database $1, by name in C order (for join).
row_counts() {
    pg psql -X -q -At -F ' ' -v ON_ERROR_STOP=1 -U "$user" -d "$1" </dev/null -c "
        SELECT table_name, (xpath('/row/c/text()', query_to_xml(
                   format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]
          FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name COLLATE \"C\""
}

if $dry_run; then
    trap 'admin_psql -c "DROP DATABASE IF EXISTS \"$check\"" </dev/null' EXIT
    log "Dry run: loading $dump into scratch database $check"
    load_into "$check" || die "the dump did not load (see the error above); nothing changed"

    if db_exists "$db"; then
        live=$(row_counts "$db")
    else
        live=""
        echo "Database $db does not exist, so there is nothing to compare with."
    fi
    log "Rows per table: the dump, and $db as it is now"
    { echo "table dump live"
      LC_ALL=C join -a 1 -a 2 -e - -o 0,1.2,2.2 <(row_counts "$check") <(printf '%s\n' "$live" | sed '/^$/d')
    } | awk '{ printf "  %-20s %10s %10s\n", $1, $2, $3 }'

    log "Dry run done: the dump loads. $db was not touched; $check is dropped now."
    exit 0
fi

live_exists=false
if db_exists "$db"; then live_exists=true; fi

if $live_exists; then
    cat <<EOF
This REPLACES database "$db" with
  $dump ($(du -h "$dump" | cut -f1), from $(date -r "$dump" '+%Y-%m-%d %H:%M'))
Everything written since that dump is lost; a dump of the current state is taken first.
EOF
else
    cat <<EOF
Database "$db" does not exist. This creates it from
  $dump ($(du -h "$dump" | cut -f1), from $(date -r "$dump" '+%Y-%m-%d %H:%M'))
EOF
fi
read -r -p "Type the database name ($db) to continue: " answer || true
[[ ${answer:-} == "$db" ]] || die "aborted; nothing changed"
exec </dev/null   # nothing below reads the terminal

if $live_exists; then
    log "Dumping the current database first"
    bash "$ROOT/infra/backup.sh"
fi

log "Loading the dump into scratch database $scratch"
load_into "$scratch" || die "the dump did not load; $db was not touched"

app_running=false
if docker compose ps --status running --services | grep -qx app; then
    app_running=true
    log "Stopping the app"
    docker compose stop app
fi

log "Swapping $scratch in as $db"
rename_live=""
if $live_exists; then
    admin_psql -c "DROP DATABASE IF EXISTS \"$old\""
    rename_live="ALTER DATABASE \"$db\" RENAME TO \"$old\";"
fi
# One transaction: either both renames happen or neither.
if ! admin_psql -1 >/dev/null <<SQL; then
SELECT pg_terminate_backend(pid, 5000) FROM pg_stat_activity
 WHERE datname IN ('$db', '$scratch') AND pid <> pg_backend_pid();
$rename_live
ALTER DATABASE "$scratch" RENAME TO "$db";
SQL
    if $app_running; then docker compose start app; fi
    die "the swap failed; $db is unchanged (the loaded copy is in $scratch)"
fi
if $live_exists; then
    admin_psql -c "DROP DATABASE \"$old\" WITH (FORCE)" ||
        echo "Warning: could not drop $old; drop it by hand when convenient."
fi

if $app_running; then
    log "Applying pending migrations"
    docker compose run --rm app npm run migrate
    log "Starting the app"
    docker compose up -d app
else
    echo "The app was not running; start it with: docker compose up -d app"
fi

log "Done: $db restored from $dump"
