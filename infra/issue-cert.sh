#!/usr/bin/env bash
# First Let's Encrypt certificate for diogomota.com + www.diogomota.com (webroot,
# through the certbot container), then restarts nginx so it switches from
# nginx/bootstrap.conf to nginx/nginx.conf. Run as deploy:
#   bash /opt/diogomota/infra/issue-cert.sh [email]
# The email is optional, for Let's Encrypt account notices. Safe to re-run: an
# existing certificate is left alone (infra/renew-cert.sh renews it).
set -euo pipefail

CERT_NAME=diogomota.com
DOMAINS=(diogomota.com www.diogomota.com)

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# /etc/letsencrypt/live is readable by root only, so look from inside a container.
have_cert() {
    docker compose run --rm --entrypoint sh certbot \
        -c "test -f /etc/letsencrypt/live/$CERT_NAME/fullchain.pem"
}

if [[ $# -gt 0 ]]; then
    account=(--email "$1")
else
    account=(--register-unsafely-without-email)
fi
request=(certonly --webroot -w /var/www/certbot --cert-name "$CERT_NAME"
    --non-interactive --agree-tos --keep-until-expiring "${account[@]}")
for domain in "${DOMAINS[@]}"; do
    request+=(-d "$domain")
done

log "Starting nginx"
docker compose up -d nginx
for _ in $(seq 1 15); do
    curl -s -o /dev/null http://127.0.0.1/ && break
    sleep 1
done
curl -s -o /dev/null http://127.0.0.1/ || die "nginx does not answer on port 80; see: docker compose logs nginx"

if have_cert; then
    log "A certificate for $CERT_NAME already exists; not requesting another"
else
    log "Dry run against Let's Encrypt staging (checks DNS, port 80 and the webroot)"
    docker compose run --rm certbot "${request[@]}" --dry-run ||
        die "the dry run failed, so no real request was made. Check that ${DOMAINS[*]} resolve to this server (A and AAAA records) and that port 80 is open."

    log "Requesting the certificate"
    docker compose run --rm certbot "${request[@]}"
fi

log "Restarting nginx onto nginx.conf"
docker compose restart nginx

code=000
for _ in $(seq 1 15); do
    code=$(curl -sS -o /dev/null -w '%{http_code}' --resolve "${DOMAINS[0]}:443:127.0.0.1" \
        "https://${DOMAINS[0]}/" 2>/dev/null) && break
    sleep 1
done
[[ $code != 000 ]] || die "HTTPS on ${DOMAINS[0]} does not work; see: docker compose logs nginx"

conf=$(docker compose exec -T nginx readlink /etc/nginx/nginx.conf)
[[ $conf == */nginx.conf ]] || die "nginx is on $conf instead of nginx.conf; see: docker compose logs nginx"

docker compose run --rm certbot certificates --cert-name "$CERT_NAME"
log "Done: https://${DOMAINS[0]} answers $code with a valid certificate (502 means the app is not running yet)"
