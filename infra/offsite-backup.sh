#!/usr/bin/env bash
# Optional: copies the newest dump in backups/ (made by infra/backup.sh) to storage
# outside the VPS with rclone, run from its Docker image (nothing to install), then
# deletes the offsite copies older than OFFSITE_RETENTION_DAYS. Setup, encryption
# and costs: docs/operations.md, "Offsite backup". Run by cron as deploy after each
# backup (the commented-out line in infra/crontab); by hand:
#   bash /opt/diogomota/infra/offsite-backup.sh
# BACKUP_DIR and RCLONE_CONFIG_DIR override the defaults (e.g. to test it locally).
set -euo pipefail

# ==== OFFSITE TARGET: SET THIS ================================================
# Where the dumps go, as an rclone destination "remote:path". The remote is a name
# from deploy's ~/.config/rclone/rclone.conf, e.g. "offsite:" (an encrypting crypt
# remote, as docs/operations.md sets up) or "b2:my-bucket/diogomota".
# Set it here and commit: every deploy copies infra/ over the copy on the VPS.
# The script refuses to run while it starts with CHANGE-ME.
OFFSITE_DEST="${OFFSITE_DEST:-CHANGE-ME:}"
# ==============================================================================

OFFSITE_RETENTION_DAYS=90   # offsite copies older than this are deleted; 0 keeps all
MAX_DUMP_AGE_DAYS=4         # backup.sh runs every 3 days; an older newest dump is an error
RCLONE_IMAGE=rclone/rclone:1.75.2

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RCLONE_CONFIG_DIR="${RCLONE_CONFIG_DIR:-$HOME/.config/rclone}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

echo "== $(date -Is) offsite-backup"
[[ $OFFSITE_DEST != CHANGE-ME* ]] ||
    die "set OFFSITE_DEST at the top of infra/offsite-backup.sh first (docs/operations.md, Offsite backup)"
[[ -f $RCLONE_CONFIG_DIR/rclone.conf ]] ||
    die "$RCLONE_CONFIG_DIR/rclone.conf is missing; create the remote first (docs/operations.md, Offsite backup)"

# As deploy, so files rclone writes (a refreshed token in rclone.conf) stay deploy's.
rclone() {
    docker run --rm --user "$(id -u):$(id -g)" \
        -v "$RCLONE_CONFIG_DIR:/config/rclone" \
        -v "$BACKUP_DIR:/backups:ro" \
        "$RCLONE_IMAGE" "$@"
}

# Named like infra/backup.sh's dumps, so never the .partial file of a running dump.
pattern='*_????????-??????.sql.gz'
newest=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$pattern" -printf '%T@ %f\n' |
    sort -n | tail -n 1 | cut -d' ' -f2-)
[[ -n $newest ]] || die "no dumps in $BACKUP_DIR"
age_days=$(( ($(date +%s) - $(stat -c %Y "$BACKUP_DIR/$newest")) / 86400 ))

echo "Copying $newest ($(du -h "$BACKUP_DIR/$newest" | cut -f1), $age_days day(s) old) to $OFFSITE_DEST"
# Skips a file that is already there with the same size and time.
rclone copy --no-traverse "/backups/$newest" "$OFFSITE_DEST"

# Like backup.sh: while backups are failing, keep every old copy.
(( age_days <= MAX_DUMP_AGE_DAYS )) ||
    die "the newest dump is $age_days days old; is infra/backup.sh failing? (logs/backup.log). Nothing was deleted offsite."

if (( OFFSITE_RETENTION_DAYS > 0 )); then
    expired=(--min-age "${OFFSITE_RETENTION_DAYS}d" --include "$pattern")
    mapfile -t old < <(rclone lsf --files-only "${expired[@]}" "$OFFSITE_DEST")
    if (( ${#old[@]} > 0 )); then
        rclone delete "${expired[@]}" "$OFFSITE_DEST"
        printf 'Deleted offsite: %s\n' "${old[@]}"
    fi
fi
rclone size --include "$pattern" "$OFFSITE_DEST" | sed 's/^/Offsite: /'
