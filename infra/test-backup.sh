#!/usr/bin/env bash
# Runs only inside a disposable test container; no real Docker/backup access.
set -euo pipefail
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/media/avatars" "$fixture/media/recipe-photos"
echo photo > "$fixture/media/avatars/a.webp"
echo photo > "$fixture/media/recipe-photos/a.webp"
export FIXTURE_MEDIA="$fixture/media"
cat > "$fixture/bin/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *printenv*) echo disposable ;;
  *pg_dump*) echo '-- safe synthetic dump' ;;
  *'test -d'*) [[ ${BACKUP_MODE} != skip ]] ;;
  *'tar -czf'*)
    [[ ${BACKUP_MODE} != fail ]] || exit 1
    tar -czf - -C "$FIXTURE_MEDIA" "${@: -1}" ;;
  *) echo "Unexpected Docker call" >&2; exit 1 ;;
esac
STUB
chmod +x "$fixture/bin/docker"
export PATH="$fixture/bin:$PATH"
for mode in skip fail success; do
    export BACKUP_MODE="$mode" BACKUP_DIR="$fixture/$mode"
    mkdir -p "$BACKUP_DIR"
    for category in disposable avatars recipe-photos; do
        suffix=tar.gz; [[ $category != disposable ]] || suffix=sql.gz
        echo old > "$BACKUP_DIR/${category}_old.$suffix"
        touch -d '30 days ago' "$BACKUP_DIR/${category}_old.$suffix"
    done
    status=0
    bash /repo/infra/backup.sh || status=$?
    [[ ! -e "$BACKUP_DIR/disposable_old.sql.gz" ]]
    if [[ $mode == success ]]; then
        [[ $status == 0 ]]
        [[ ! -e "$BACKUP_DIR/avatars_old.tar.gz" && ! -e "$BACKUP_DIR/recipe-photos_old.tar.gz" ]]
        for category in avatars recipe-photos; do tar -tzf "$BACKUP_DIR"/"${category}"_*.tar.gz >/dev/null; done
    else
        [[ $status != 0 ]]
        [[ -e "$BACKUP_DIR/avatars_old.tar.gz" && -e "$BACKUP_DIR/recipe-photos_old.tar.gz" ]]
    fi
done
echo 'PASS: skipped/failed media preserved; successful categories pruned after replacement.'
