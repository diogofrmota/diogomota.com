#!/bin/sh
# Command of the nginx container (docker-compose.prod.yml), run on every start:
# uses nginx.conf once the Let's Encrypt certificate exists, bootstrap.conf before,
# so nginx can start (and answer the ACME challenge) before the first certificate.
# The chosen file is linked to /etc/nginx/nginx.conf, so `nginx -t` and
# `nginx -s reload` inside the container need no -c flag.
set -eu

site=/etc/nginx/site
cert=/etc/letsencrypt/live/diogomota.com/fullchain.pem

if [ -f "$cert" ]; then
    conf=nginx.conf
else
    conf=bootstrap.conf
fi

ln -sf "$site/$conf" /etc/nginx/nginx.conf
echo "start.sh: using $conf" >&2
exec nginx -g 'daemon off;'
