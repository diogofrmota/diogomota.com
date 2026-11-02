#!/usr/bin/env bash
# Deploys one image tag (a short commit SHA pushed by CI): pulls it, applies
# pending migrations, pins it as IMAGE_TAG in .env, starts the app and reloads
# nginx. Run by .github/workflows/deploy.yml after it copies the stack files here;
# by hand as deploy (e.g. a rollback while GitHub Actions is unavailable):
#   bash /opt/diogomota/infra/deploy.sh 14210eb
# Migrations only go forward: an older tag runs against the current schema.
set -euo pipefail

IMAGE=diogofrmota/diogomota-com
KEEP_OLD_IMAGES=2   # previous app images kept on disk for a quick rollback

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[[ $# -eq 1 && $1 =~ ^[0-9a-f]{7}$ ]] ||
    die "usage: bash infra/deploy.sh <tag>, a 7-character short commit SHA (e.g. 14210eb)"
tag=$1
[[ -f .env ]] || die "$ROOT/.env is missing (template: .env.production.example)"

# Wins over IMAGE_TAG in .env until the tag is written there below.
export IMAGE_TAG=$tag

log "Pulling $IMAGE:$tag"
docker compose pull app

log "Applying pending migrations"
docker compose run --rm app npm run migrate

# From here on, every `docker compose` in this directory (by hand, infra/restore.sh)
# runs this tag, so a rollback sticks.
log "Pinning IMAGE_TAG=$tag in .env"
if grep -q '^IMAGE_TAG=' .env; then
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" .env
else
    printf '\nIMAGE_TAG=%s\n' "$tag" >> .env
fi

log "Starting the app and nginx"
docker compose up -d app nginx

# up only recreates nginx when its compose config changes, so reload it to apply
# nginx/*.conf as copied by this deploy. A broken config fails here and nginx
# keeps serving the previous one.
log "Reloading nginx"
docker compose exec -T nginx nginx -t -q
docker compose exec -T nginx nginx -s reload

# Every tag stays on Docker Hub; on disk, keep the running one and the newest few.
log "Removing old app images"
docker image ls "$IMAGE" --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r | cut -f2 |
    awk -v tag="$tag" -v keep="$KEEP_OLD_IMAGES" '$0 != tag && $0 != "<none>" && ++n > keep' |
    while read -r old; do
        # Fails (and is skipped) for an image a container still uses.
        if docker image rm "$IMAGE:$old" >/dev/null; then
            echo "Removed $IMAGE:$old"
        fi
    done

docker compose ps app nginx
log "Done: $IMAGE:$tag is running"
