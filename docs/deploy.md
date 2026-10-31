# Deploy runbook

First-time setup of the VPS (`162.19.252.190`, `2001:41d0:701:1100::ec4e`) for diogomota.com. Run the steps in order. Each one ends with a check.

- **Local** commands: PowerShell, from the repo root. Use `curl.exe`, not `curl` (that's an alias for `Invoke-WebRequest` in Windows PowerShell).
- **VPS** commands: as `deploy` in `/opt/diogomota` from step 4 on (`ssh deploy@162.19.252.190`, then `cd /opt/diogomota`). Inside that directory `.env` sets `COMPOSE_FILE`, so plain `docker compose` uses `docker-compose.prod.yml`.

| On the VPS | What |
|---|---|
| `/opt/diogomota` | [docker-compose.prod.yml](../docker-compose.prod.yml), `.env`, [nginx/](../nginx/), [infra/](../infra/) |
| `/opt/diogomota/backups` | dumps from [infra/backup.sh](../infra/backup.sh) |
| `/opt/diogomota/logs` | cron output |
| `/etc/letsencrypt` | certificates (root only, mounted into nginx and certbot) |

**Before:** DNS is live (roadmap step 0.5). Check: `nslookup diogomota.com` and `nslookup www.diogomota.com` both return `162.19.252.190` and `2001:41d0:701:1100::ec4e`.

## 1. Copy the setup script (local)

```powershell
scp infra/setup-vps.sh ubuntu@162.19.252.190:
```

Check: `ssh ubuntu@162.19.252.190 ls -l setup-vps.sh`

## 2. Bootstrap the server (VPS, as ubuntu)

```sh
ssh ubuntu@162.19.252.190
sudo bash setup-vps.sh
```

It stops before touching SSH if `ubuntu` has no keys. Keep this session open until the checks pass.

Check, from a second local terminal:

```powershell
ssh deploy@162.19.252.190 "id; docker ps"                           # groups include docker; empty container list
ssh -o PubkeyAuthentication=no ubuntu@162.19.252.190                # Permission denied (publickey)
ssh root@162.19.252.190                                             # Permission denied (publickey)
ssh ubuntu@162.19.252.190 "sudo ufw status; sudo fail2ban-client status sshd"   # 22, 80, 443 (and v6) only; jail sshd
```

If the summary says `reboot REQUIRED`: `sudo reboot`, wait a minute, then `ssh deploy@162.19.252.190`.

## 3. Copy the stack files (local)

```powershell
scp -r docker-compose.prod.yml .env.production.example nginx infra deploy@162.19.252.190:/opt/diogomota/
```

Check (VPS):

```sh
cd /opt/diogomota && ls
grep -rlI $'\r' docker-compose.prod.yml nginx infra || echo "LF ok"   # prints "LF ok"
```

## 4. Docker Hub login, read-only token (VPS)

```sh
docker login -u diogofrmota
```

At the password prompt, paste the `vps-pull` token (`DOCKERHUB_PULL_TOKEN` in your local `.env`).

Check: `Login Succeeded`. A warning that the credential is stored unencrypted in `~/.docker/config.json` is expected (the token is read-only).

## 5. Create .env (VPS)

```sh
cp .env.production.example .env
chmod 600 .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|; s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 32)|" .env
nano .env
```

In `nano`, fill in `TMDB_READ_TOKEN`, `RESEND_API_KEY` and `SIGNUP_CODE` if you have them yet. They can stay empty until the goals that use them. After changing `.env` later, run `docker compose up -d app`.

Check:

```sh
grep -E '^(POSTGRES_PASSWORD|AUTH_SECRET)=.+' .env | cut -d= -f1   # prints both names
docker compose config --quiet && echo "compose ok"
```

## 6. Start Postgres (VPS)

```sh
docker compose up -d postgres
```

Check: `docker compose ps postgres` shows `(healthy)` within about 20 s.

## 7. Run migrations (VPS)

This needs an image on Docker Hub. Until Goal 3's first deploy there is none, so do one of these:

- **Push one now** (local, with the Read & Write token, `DOCKERHUB_TOKEN` in `.env`):

  ```powershell
  docker login -u diogofrmota
  docker build --build-context migrations=db/migrations -t diogofrmota/diogomota-com:latest ./app
  docker push diogofrmota/diogomota-com:latest
  ```

- **Or skip** steps 7 and 8, and run `docker compose up -d nginx` instead of step 8. The first CI deploy runs the migrations and starts the app.

```sh
docker compose pull app
docker compose run --rm app npm run migrate
```

Check: prints `Applied 001_initial.sql`. Running it again prints `No pending migrations.`

## 8. Start the app and nginx (VPS)

```sh
docker compose up -d app nginx
```

Check (VPS):

```sh
docker compose ps                          # app (healthy), nginx Up
docker compose logs nginx | grep start.sh  # start.sh: using bootstrap.conf
```

Check (local; proves DNS and the firewall):

```powershell
curl.exe -4 -i http://diogomota.com/   # 503 "... waiting for its TLS certificate ..."
curl.exe -6 -i http://diogomota.com/   # same; only if your network has IPv6
```

## 9. TLS certificate (VPS)

```sh
bash infra/issue-cert.sh you@example.com   # the email is optional (Let's Encrypt account notices)
```

It does a dry run against Let's Encrypt staging first, then the real request, then restarts nginx onto `nginx/nginx.conf`. If the dry run fails, fix DNS or port 80 and run it again. Dry runs don't count against the production rate limit of 5 failed validations per hour.

Check: the last line is `Done: https://diogomota.com answers 200 ...` (`502` if the app isn't running yet). Then, locally:

```powershell
curl.exe -sI https://diogomota.com/api/health                       # 200 (502 without the app)
curl.exe -sI https://www.diogomota.com/ | findstr /i "HTTP Location"   # 301, Location: https://diogomota.com/
curl.exe -sI http://diogomota.com/ | findstr /i "HTTP Location"        # 301, Location: https://diogomota.com/
```

## 10. Cron jobs (VPS)

```sh
crontab infra/crontab
crontab -l
```

This installs [infra/crontab](../infra/crontab): certificate renewal at 03:17 and 15:17, backups at 03:00 every 3 days, server time (UTC).

Check, by running each job once now:

```sh
bash infra/backup.sh && ls -lh backups/                # one diogomota_YYYYMMDD-HHMMSS.sql.gz
docker compose run --rm certbot renew --dry-run        # all simulated renewals succeeded
bash infra/renew-cert.sh                               # not yet due for renewal ... nginx reloaded
```

After the first scheduled runs: `tail logs/backup.log logs/renew-cert.log`.

## Restore a backup (VPS)

```sh
ls -lh backups/
bash infra/restore.sh backups/diogomota_YYYYMMDD-HHMMSS.sql.gz
```

It asks you to type the database name, then dumps the current database to `backups/`. It loads the file into a scratch database and swaps that in only if the load succeeded. If the app was running, it then runs pending migrations and starts the app again.

## Reference

- Edit nginx config: copy the changed file to `/opt/diogomota/nginx/`, then `docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload`.
- `infra/setup-vps.sh` and `infra/issue-cert.sh` are safe to run again. Neither removes keys, rules or certificates.
- Logs: `docker compose logs -f app` (or `nginx`, `postgres`).
