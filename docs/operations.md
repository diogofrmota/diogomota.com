# Operations

Runbook for the production stack. How deploys, versions and the CI pipeline work is in [README.md, Production](../README.md#production); this is what to run on the server.

Unless a step says otherwise, everything runs on the VPS as `deploy`, in `/opt/diogomota`:

```sh
ssh deploy@162.19.252.190
cd /opt/diogomota
```

The `.env` there sets `COMPOSE_FILE`, so plain `docker compose ...` uses [docker-compose.prod.yml](../docker-compose.prod.yml). `deploy` has no `sudo`; for root (reboots, apt, fail2ban) log in as `ubuntu` instead. Paths like `backups/`, `logs/` and `.env` below are in `/opt/diogomota` on the VPS, not in the repo.

- [Health and logs](#health-and-logs)
- [Restart](#restart)
- [Roll back to a previous image](#roll-back-to-a-previous-image)
- [Backups](#backups)
- [Restore a backup](#restore-a-backup)
- [Offsite backup (optional)](#offsite-backup-optional)
- [Rotate secrets](#rotate-secrets)
- [Certificates](#certificates)
- [Email (DMARC)](#email-dmarc)
- [Monthly check](#monthly-check)

## Health and logs

From anywhere:

```sh
curl -sS https://diogomota.com/api/health    # {"status":"ok"}; {"status":"error"} (503) means the app is up but can't reach Postgres
curl -sSI https://diogomota.com/ | grep -iE '^(strict-transport|x-content-type|x-frame|referrer-policy|content-security)'
```

The second line shows the security headers from [nginx/nginx.conf](../nginx/nginx.conf); all five should be there. The `/apps` title shows the live version, e.g. `apps (v1.0.0)`.

On the VPS:

```sh
docker compose ps                         # every service Up; app and postgres "(healthy)"
docker compose logs --since 1h app        # or nginx, postgres; -f follows, --tail 100 for the last lines
grep IMAGE_TAG .env                       # the deployed image tag (short commit SHA)
tail -n 20 logs/backup.log logs/renew-cert.log
ls -lt backups | head -n 5                # the newest dumps
df -h / && docker system df               # disk
free -h && uptime                         # memory, swap, time since the last reboot
```

Docker keeps up to 3 × 10 MB of logs per container, so older lines are gone. nginx's access log is in `docker compose logs nginx`. Unattended upgrades may reboot the VPS at 04:30 when an update needs it; the containers come back on their own.

What the symptoms usually mean:

- **502 or 504 from the site**: nginx is up but the app isn't answering. `docker compose ps app` and `docker compose logs --tail 100 app`.
- **app `(unhealthy)`**: its health check calls `/api/health` every 30 s. Usually the database: `docker compose logs --tail 50 postgres`.
- **No answer at all, or a certificate error**: nginx is down or the certificate expired; see `docker compose logs nginx` and [Certificates](#certificates).

## Restart

| What | Command | Effect |
|---|---|---|
| The app | `docker compose restart app` | a few seconds of 502s |
| The app, after editing `.env` | `docker compose up -d app` | recreates it with the new values |
| nginx, after a config change | `docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload` | no downtime; a broken config is refused and the old one keeps serving |
| nginx | `docker compose restart nginx` | a second or two without the site |
| Postgres | `docker compose restart postgres` | errors for a few seconds; the app reconnects on its own |
| Whatever is stopped or changed | `docker compose up -d` | starts stopped services, recreates changed ones |
| The VPS | `ssh ubuntu@162.19.252.190`, then `sudo reboot` | about a minute; the containers come back on their own |

A service stopped with `docker compose stop` stays stopped across reboots (`restart: unless-stopped`); `docker compose up -d` starts it again.

Never run `docker compose down -v`: `-v` deletes the `pgdata` volume, which is the database, and `appdata`, which has the profile pictures. `docker compose down` without `-v` keeps the data but takes the site down until `docker compose up -d`.

## Roll back to a previous image

Every deploy's image stays on Docker Hub as `diogofrmota/diogomota-com:<short SHA>` (and `:vX.Y.Z`). [infra/deploy.sh](../infra/deploy.sh) also keeps the two newest previous images on the VPS, so rolling back to one of those doesn't need a download.

1. Find the tag, on your PC in the repo (Git Bash):

   ```sh
   git fetch --tags
   git log --oneline -10                       # the tag is the first 7 characters of the hash
   git rev-parse 'v1.0.0^{commit}' | cut -c1-7 # the tag of a version
   ```

2. Deploy it: GitHub → Actions → Deploy → Run workflow, branch `main`, `image_tag` set to that tag. The run skips the build, deploys the image and goes green once `/api/health` answers 200. Without GitHub, on the VPS: `bash infra/deploy.sh <tag>`.
3. Check: `grep IMAGE_TAG .env` on the VPS shows the tag, and `/apps` shows the older version.

- Migrations only go forward, so the older image runs against the current schema. That works when the newer release only added tables or columns, as every migration so far has. If the older code really needs the old schema, [restore a dump](#restore-a-backup) from before the deploy, losing what was written since.
- The rollback holds until the next push to `main`, or a Run workflow with an empty `image_tag`, which builds and deploys `main` again.
- Only the image goes back: the run uses the compose, nginx and infra files of the current `main`. To undo a bad change to those, revert the commit and push.

## Backups

[infra/backup.sh](../infra/backup.sh) runs from cron ([infra/crontab](../infra/crontab)) at 03:00 server time (UTC) every 3 days. It writes `backups/diogomota_YYYYMMDD-HHMMSS.sql.gz`: plain SQL without owners or grants, gzipped and tested. Beside it, `backups/avatars_YYYYMMDD-HHMMSS.tar.gz` has the profile pictures (the `avatars` folder of the app's `appdata` volume, read from the running app; skipped, with a line in the log, while the app is down). Once the dump has succeeded, it deletes both kinds older than 14 days, so there are about five of each on disk. A failing backup never deletes the old ones. The offsite backup copies only the dumps: the pictures can be set again, the accounts and libraries can't.

The dumps are on the VPS's own disk: if the VPS is lost, so are they. Set up the [offsite backup](#offsite-backup-optional), or copy one to your PC now and then.

```sh
bash infra/backup.sh      # a dump now, e.g. before a risky change
ls -lh backups/
```

From your PC (PowerShell or Git Bash), to copy one into the current folder:

```sh
scp deploy@162.19.252.190:/opt/diogomota/backups/diogomota_20261102-030000.sql.gz .
```

Keep downloaded dumps private: they hold every account's email address and password hash.

## Restore a backup

[infra/restore.sh](../infra/restore.sh) replaces the database with a dump. Do a dry run first, every time.

### 1. Pick the dump

`ls -lt backups/` lists them newest first. A restore loses everything written after its dump was taken.

### 2. Dry run

```sh
bash infra/restore.sh --dry-run backups/diogomota_20261102-030000.sql.gz
```

This loads the dump into a scratch database, `diogomota_dryrun`, next to the live one (the site keeps running), prints the rows per table in the dump beside the live database's, and drops the scratch database again. It asks nothing and changes nothing:

```
==> Rows per table: the dump, and diogomota as it is now
  table                      dump       live
  event_assignees               2          2
  events                        2          3
  ...
  users                         2          2

==> Dry run done: the dump loads. diogomota was not touched; diogomota_dryrun is dropped now.
```

`-` means the table doesn't exist on that side. If the dump doesn't load, the error is printed and the script stops; the live database is untouched.

To look at the rows yourself, load the dump into a scratch database by hand and drop it afterwards (`diogomota` is `POSTGRES_USER` in `.env`):

```sh
docker compose exec postgres createdb -U diogomota diogomota_inspect
gzip -dc backups/diogomota_20261102-030000.sql.gz |
    docker compose exec -T postgres psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U diogomota -d diogomota_inspect >/dev/null
docker compose exec postgres psql -U diogomota -d diogomota_inspect    # \dt, SELECT username, created_at FROM users; then \q
docker compose exec postgres dropdb -U diogomota diogomota_inspect
```

### 3. Restore

```sh
bash infra/restore.sh backups/diogomota_20261102-030000.sql.gz
```

Type `diogomota` when it asks. Then it:

1. dumps the current database with `infra/backup.sh`, so the restore can be undone;
2. loads the dump into a scratch database, `diogomota_restore`; if that fails it stops, and nothing has changed;
3. stops the app, swaps the scratch database in (both renames in one transaction) and drops the old one;
4. applies pending migrations (the dump may be older than the code) and starts the app.

The site is down (502) from step 3 until the app is healthy again, usually well under a minute. If the database doesn't exist at all (dropped), step 1 is skipped and the dump becomes the database.

### 4. Check

```sh
docker compose ps app                    # (healthy)
curl -sS https://diogomota.com/api/health
```

Then log in and look at whatever you restored for.

**Undo**: the dump from step 1 is now the newest file in `backups/` (`ls -t backups | head -n 1`); restore it the same way.

### Profile pictures

`restore.sh` only restores the database. The pictures are files on the `appdata` volume; to put back an archive `infra/backup.sh` made (the app running):

```sh
docker compose exec -T app tar -xzf - -C /app/data < backups/avatars_20261102-030000.tar.gz
```

That replaces the pictures in the archive and leaves any newer ones. A picture whose user has none in the database (`users.avatar_updated_at`) isn't shown; a user whose picture file is missing shows their initial until they set a new one.

### Onto a new VPS

If the VPS is gone, start from a dump on your PC or [offsite](#offsite-backup-optional):

1. A fresh Ubuntu 24.04 VPS, with your SSH key (`~/.ssh/id_ed25519.pub`) in `ubuntu`'s `authorized_keys` as on the first one: [infra/setup-vps.sh](../infra/setup-vps.sh) refuses to run without it, because `deploy` gets those keys. Copy the script there and run `sudo bash setup-vps.sh` as `ubuntu`.
2. DNS at Porkbun: the `A` and `AAAA` records of `@` and `www` to the new addresses.
3. On your PC, in the repo (Git Bash), copy the stack files the way the deploy does, the env template, and the dump:

   ```sh
   tar -czf - docker-compose.prod.yml .env.production.example nginx infra db/migrations | ssh deploy@NEW_IP tar -xzf - -C /opt/diogomota
   scp diogomota_20261102-030000.sql.gz deploy@NEW_IP:/opt/diogomota/backups/
   ssh deploy@NEW_IP 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/diogomota_deploy.pub    # the CI's deploy key
   ```

4. On the VPS as `deploy`: `docker login -u diogofrmota` with a read-only Docker Hub token (see [Docker Hub tokens](#docker-hub-tokens)).
5. `cp .env.production.example .env && chmod 600 .env`, then fill it in with `nano .env`: a new `POSTGRES_PASSWORD` (`openssl rand -hex 32`), a new `AUTH_SECRET` (`openssl rand -base64 32`; everyone logs in again), and `RESEND_API_KEY` and `TMDB_READ_TOKEN` from your local `.env` or their dashboards.
6. `docker compose up -d --wait postgres`, then `bash infra/restore.sh backups/diogomota_20261102-030000.sql.gz`. The app isn't running yet, so the restore only swaps the databases. With an `avatars_*.tar.gz` too, put it back once the app is running (step 9), as in [Profile pictures](#profile-pictures).
7. `bash infra/issue-cert.sh you@example.com` (once DNS points here), then `crontab infra/crontab`.
8. GitHub → Settings → Secrets and variables → Actions: set `VPS_HOST` to the new IP and `VPS_KNOWN_HOSTS` to the output of `ssh-keyscan NEW_IP`.
9. GitHub → Actions → Deploy → Run workflow with `image_tag` set to the tag that was live, or empty to build `main`. It applies the migrations the dump lacks and starts the app.

## Offsite backup (optional)

[infra/offsite-backup.sh](../infra/offsite-backup.sh) copies the newest dump to storage of your choice outside the VPS, with [rclone](https://rclone.org/) run from its Docker image (`rclone/rclone:1.75.2`; nothing is installed on the VPS). It then deletes offsite copies older than 90 days (`OFFSITE_RETENTION_DAYS`). If the newest dump is more than 4 days old, it still copies it but deletes nothing and exits with an error, so failing backups never empty the offsite side.

The target is `OFFSITE_DEST`, at the top of the script, and the script refuses to run until it's set. Set it in the repo and commit: every deploy copies `infra/` over the VPS's copy.

### What it costs

Today's dumps are a few KB of gzipped SQL. Even at 10 MB each, 30 copies (90 days, one every 3 days) are 300 MB. List prices as of November 2026:

| Where | Price | For these dumps |
|---|---|---|
| [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) | $6.95 per TB a month; the first 10 GB are free; downloads free up to 3× what's stored | free |
| [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | 10 GB-month free, then $0.015 per GB-month; no download fees | free |
| [Hetzner Storage Box](https://www.hetzner.com/storage/storage-box/) BX11 (1 TB, SFTP) | €3.81 a month incl. VAT | €3.81 a month; worth it only if you'd use the space for more |
| Your own PC or NAS, over SFTP | nothing | free, if it's on and reachable at 03:30 |

Use a provider other than OVH, so one incident can't take the VPS and its backups together.

### Set up (Backblaze B2 as the example)

Other providers differ only in step 1 and the storage type picked in `rclone config`.

1. In Backblaze: create a private bucket (the name is global, e.g. `diogomota-backups-<something>`), then an application key restricted to that bucket, with Read and Write access. Note the keyID and the applicationKey.
2. On the VPS as `deploy`, a shortcut for rclone in Docker (lasts for this session), then rclone's setup:

   ```sh
   mkdir -p ~/.config/rclone     # first, or Docker creates it owned by root
   rclone() { docker run --rm -it --user "$(id -u):$(id -g)" -v ~/.config/rclone:/config/rclone -v /opt/diogomota/backups:/backups rclone/rclone:1.75.2 "$@"; }
   rclone config
   ```

   - `n` (new remote), name `b2`, storage `b2`; `account` is the keyID, `key` the applicationKey, `hard_delete` `true` (so pruned copies are really gone, not hidden); defaults for the rest.
   - `n` again, name `offsite`, storage `crypt`; `remote` is `b2:<bucket>/db`, filename and directory name encryption on (the defaults), and for both the password and the salt (`password2`) choose `g` to generate one.
   - `q` to quit.

   **Save both crypt passwords in your password manager now.** They are what decrypts the copies, and the only other place they exist is `~/.config/rclone/rclone.conf` on the VPS: lose the VPS without them and the offsite copies are unreadable. The dumps hold email addresses and password hashes, which is why they're encrypted before leaving the VPS, private bucket or not.
3. Try it: `OFFSITE_DEST=offsite: bash infra/offsite-backup.sh`, then `rclone lsl offsite:` lists the copy under its real name. In Backblaze's web UI, both the name and the contents are scrambled.
4. In the repo: set `OFFSITE_DEST="${OFFSITE_DEST:-offsite:}"` at the top of `infra/offsite-backup.sh` and uncomment the `offsite-backup.sh` line in `infra/crontab`. Commit and push, then on the VPS: `crontab infra/crontab` (and `crontab -l` to check).
5. After the next backup day: `tail logs/offsite-backup.log`.

Optional hardening: a key that can't delete files (in B2, no `deleteFiles` capability) together with `OFFSITE_RETENTION_DAYS=0` means even someone who takes over the VPS can't delete the offsite copies. A lifecycle rule on the bucket then expires the old ones.

### Get a dump back from offsite

With the `rclone` shortcut from step 2:

```sh
rclone lsl offsite:                                              # the copies, with their dates
rclone copy offsite:diogomota_20261102-030000.sql.gz /backups    # into /opt/diogomota/backups
```

Then [dry run and restore](#restore-a-backup) as usual. On a new VPS, run `rclone config` first: the same `b2` remote, and the `offsite` crypt remote with "type in my own password" and the two passwords you saved.

## Rotate secrets

Rotate a secret when it may have leaked (pasted somewhere, a lost laptop, an account compromised), or whenever you like. Each one is independent of the others.

| Secret | In production | Also |
|---|---|---|
| `AUTH_SECRET` | VPS `.env` | local `.env` and `app/.env.local` have their own dev value |
| `POSTGRES_PASSWORD` | VPS `.env`, and the Postgres role | the local one is a dev value |
| `RESEND_API_KEY` | VPS `.env` | local `.env` and `app/.env.local`, if the key is the same |
| `TMDB_READ_TOKEN` | VPS `.env` | local `.env` and `app/.env.local` |
| Docker Hub `github-actions` (read & write) | GitHub secret `DOCKERHUB_TOKEN` | local `.env`, `DOCKERHUB_TOKEN` |
| Docker Hub `vps-pull` (read-only) | `~/.docker/config.json` of `deploy` on the VPS | local `.env`, `DOCKERHUB_PULL_TOKEN` |
| Deploy key | GitHub secret `VPS_SSH_KEY`; its public half in `~/.ssh/authorized_keys` of `deploy` | `C:\Users\diogo\.ssh\diogomota_deploy` |

To change a value in the VPS `.env` by hand, use `nano .env`: a pasted value doesn't end up in the shell history. After any change there, `docker compose up -d app` recreates the app with the new values. The same goes for `CONTACT_EMAIL`, not a secret: the address `/privacy` links to (empty, it says to ask Diogo).

### AUTH_SECRET

It signs the session cookies (Better Auth, `app/auth.ts`), so a new one logs everyone out, you included: there is no overlap period. Password reset links aren't affected; their tokens are random and stored (hashed) in the database. The links that confirm an email are signed with it, so the ones not opened yet stop working (Account sends a new one).

```sh
sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 32)|" .env
docker compose up -d app
```

Then log in again.

### Database password

Postgres reads `POSTGRES_PASSWORD` only when it creates an empty volume, so the role's password and `.env` are changed together:

```sh
new=$(openssl rand -hex 32)    # hex only: it goes into DATABASE_URL without URL-encoding
docker compose exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres' <<SQL
ALTER ROLE CURRENT_USER PASSWORD '$new';
SQL
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$new/" .env
unset new
docker compose up -d
```

`up -d` recreates the app, whose `DATABASE_URL` is built from the password, and Postgres, whose environment changed (the data stays in the volume): a few seconds of errors. Check that `docker compose ps` shows both healthy. If the app logs `password authentication failed`, `.env` and the role disagree; run the block again, which sets both to a new value. Dumps don't contain the role, so a later restore doesn't bring the old password back.

### Resend API key

1. resend.com → API Keys → Create API key, with Sending access to the `diogomota.com` domain.
2. On the VPS: `nano .env`, replace `RESEND_API_KEY`, then `docker compose up -d app`.
3. Test: https://diogomota.com/forgot-password with your own email; the email should arrive. If it doesn't, check `docker compose logs --since 10m app`.
4. Delete the old key in Resend. If you use the same key locally, update `.env` and `app/.env.local`.

### TMDB token

Regenerating on TMDB invalidates the old token at once. Have the VPS session open first: until the app has the new token, Discover and search show errors (the library still loads from the cache).

1. themoviedb.org → Settings → API: regenerate, then copy the new API Read Access Token (the long one).
2. On the VPS: `nano .env`, replace `TMDB_READ_TOKEN`, then `docker compose up -d app`.
3. Check: this prints 200 for a valid token (401 for a bad one); then open Discover.

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(sed -n 's/^TMDB_READ_TOKEN=//p' .env)" https://api.themoviedb.org/3/authentication
   ```

4. Update the local `.env` and `app/.env.local`.

### Docker Hub tokens

Both are at hub.docker.com → Account settings → Personal access tokens. Create the new one, switch over, test, then delete the old one.

`github-actions` (Read & Write), which CI uses to push images:

1. Generate a token with Read & Write access.
2. GitHub → Settings → Secrets and variables → Actions → `DOCKERHUB_TOKEN` → Update, and paste it.
3. Test: push a commit, or Actions → Deploy → Run workflow with an empty `image_tag` (it builds `main` as the next patch version). The image job logs in with the token.
4. Delete the old token, and update `DOCKERHUB_TOKEN` in the local `.env`.

`vps-pull` (Read-only), which the VPS uses to pull the private image:

1. Generate a token with Read-only access.
2. On the VPS as `deploy`: `docker login -u diogofrmota`, and paste the token at the password prompt.
3. Test: `docker compose pull app` downloads the image, or says it's up to date.
4. Delete the old token, and update `DOCKERHUB_PULL_TOKEN` in the local `.env`.

Docker keeps the VPS login unencrypted in `~/.docker/config.json` (readable by `deploy` only), which is why that token is read-only.

### Deploy key

The SSH key GitHub Actions logs in to `deploy@VPS` with. Add the new key, switch GitHub over and test it before removing the old one, so deploys never break. On your PC in Git Bash:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/diogomota_deploy_new -N "" -C "github-actions $(date +%Y-%m)"
ssh deploy@162.19.252.190 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/diogomota_deploy_new.pub
cat ~/.ssh/diogomota_deploy_new    # the private key, BEGIN and END lines included
```

GitHub → Settings → Secrets and variables → Actions → `VPS_SSH_KEY` → Update, and paste the whole private key. Test: Actions → Deploy → Run workflow with `image_tag` set to the live tag (`ssh deploy@162.19.252.190 grep IMAGE_TAG /opt/diogomota/.env`), which redeploys the same image over SSH. Once that's green, remove the old key from the VPS and give the new one the old name:

```sh
old=$(cut -d' ' -f2 ~/.ssh/diogomota_deploy.pub) && [ -n "$old" ] &&
    ssh deploy@162.19.252.190 "grep -vF '$old' ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.new && mv ~/.ssh/authorized_keys.new ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
ssh deploy@162.19.252.190 'ssh-keygen -lf ~/.ssh/authorized_keys'    # your own key(s) and "github-actions <month>"
mv ~/.ssh/diogomota_deploy_new ~/.ssh/diogomota_deploy && mv ~/.ssh/diogomota_deploy_new.pub ~/.ssh/diogomota_deploy.pub
```

`VPS_KNOWN_HOSTS` is the server's host key and doesn't change; it only changes on a new VPS.

## Certificates

The Let's Encrypt certificate covers `diogomota.com` and `www.diogomota.com` and lasts 90 days. It lives in `/etc/letsencrypt` on the VPS, readable by root only (the certbot container reads it). [infra/renew-cert.sh](../infra/renew-cert.sh) runs at 03:17 and 15:17; certbot renews once 30 days or fewer are left, and the script then reloads nginx. Let's Encrypt no longer emails expiry reminders, so this log and the [monthly check](#monthly-check) are the warning. With HSTS, browsers won't let anyone click through an expired certificate: the site is simply unreachable until it's renewed.

From anywhere (Git Bash or the VPS), the certificate nginx is serving:

```sh
echo | openssl s_client -connect diogomota.com:443 -servername diogomota.com 2>/dev/null |
    openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

On the VPS:

```sh
docker compose run --rm certbot certificates       # domains, expiry date, days left
tail -n 20 logs/renew-cert.log                     # "not due for renewal yet" ... "(skipped)" is the normal run
docker compose run --rm certbot renew --dry-run    # a full renewal against Let's Encrypt's staging server; changes nothing
```

To renew by hand, `bash infra/renew-cert.sh` renews only if the certificate is due. To force a renewal:

```sh
docker compose run --rm certbot renew --force-renewal --cert-name diogomota.com
docker compose exec nginx nginx -s reload
```

Let's Encrypt issues at most 5 certificates a week for the same names, so don't loop that.

If renewal fails, the log says why. Renewal answers Let's Encrypt over plain HTTP on port 80, through nginx, so the usual causes are DNS no longer pointing at the VPS, nginx not running, or port 80 blocked. `curl -sI http://diogomota.com/.well-known/acme-challenge/test` should answer 404 from nginx, not time out or redirect. An already-expired certificate can still be renewed the same way. A new server gets its first one from [infra/issue-cert.sh](../infra/issue-cert.sh).

## Email (DMARC)

Emails (password resets, the links that confirm an email) go out through Resend from `no-reply@diogomota.com`, signed with DKIM (`resend._domainkey`). The `_dmarc` TXT record at Porkbun says what receivers should do with mail that claims to be from the domain but fails those checks. It is `v=DMARC1; p=none;` for now: nothing is done with it, so anyone can send mail as `@diogomota.com`.

Once a few weeks of resets and confirmations have landed in inboxes (not spam), tighten it, in Porkbun's DNS for `diogomota.com`:

1. Edit the TXT record `_dmarc` to `v=DMARC1; p=quarantine; adkim=r; aspf=r;` (TTL 600).
2. Check it: `dig +short TXT _dmarc.diogomota.com` (or nslookup) shows the new value.
3. Request a password reset for your own account and check that it lands in the inbox.

A week or two later, `p=reject` is the last step. To get the reports of who sends as the domain, add `rua=mailto:<an address you read>;` to the record.

## Monthly check

Five minutes, once a month:

```sh
ssh deploy@162.19.252.190
cd /opt/diogomota
docker compose ps                                          # all Up, app and postgres healthy
docker compose logs --since 720h app | grep -i 'schema'      # nothing: Better Auth checks the schema when it starts
ls -lt backups | head -n 3                                 # the newest is at most 3 days old
tail -n 3 logs/backup.log logs/renew-cert.log              # no ERROR (and logs/offsite-backup.log, once set up)
docker compose run --rm certbot certificates | grep -E 'Domains|Expiry'
df -h / && docker system df                                # disk use under about 80%
```

Every few months, also copy the newest dump to your PC (see [Backups](#backups)) and do a [restore dry run](#2-dry-run) with it, so you know it loads.

What grows on disk: the app images (the deployed one and two older ones), about five dumps, container logs (capped at 30 MB each) and the database. `docker image prune` removes dangling images and is always safe. `docker image prune -a` also removes the images kept for a quick rollback, which would then be downloaded again.
