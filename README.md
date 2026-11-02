# diogomota.com

Personal site plus two small apps for friends (Shared, Shows), built with Next.js and PostgreSQL. The spec is in [plan.md](plan.md) and the build order is in [roadmap.md](roadmap.md).

## Prerequisites

- Node.js 22
- Docker Desktop (with Compose)

## Local setup

1. `cp .env.example .env` and fill in the values. Docker Compose reads this file.
2. Create `app/.env.local` with the app variables from `.env` (at least `DATABASE_URL` and `AUTH_SECRET`). Next.js and `npm run migrate` read this file. With `RESEND_API_KEY` and `MAIL_FROM` set, password reset emails are really sent; without `RESEND_API_KEY`, the dev server prints them (and their link) to its console instead.
3. `docker compose up -d` starts Postgres 16 on `localhost:5432`. Wait until `docker compose ps` shows it as healthy.
4. `cd app && npm ci && npm run migrate`
5. `npm run dev`, then open http://localhost:3000 (the health check is at `/api/health`).

Before your first e2e run, install the test browser with `npx playwright install chromium`. To start over with an empty database, run `docker compose down -v`.

## Commands (run in `app/`)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build (standalone output) |
| `npm run start` | Serves the production build locally. Next.js warns about standalone mode; that is expected, because the image runs `server.js` directly. |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generates route types, then runs `tsc` |
| `npm run test:e2e` | Playwright tests. Starts the dev server and needs Postgres running. The accounts they create (usernames starting with `e2e_`) are deleted at the end. The dev server gets `E2E_TEST_HOOKS=1`, which keeps emails in memory for the tests (`/api/test/outbox`) instead of sending them; it has no effect in production. If a dev server is already running on port 3000 the tests reuse it, so stop it first or start it with `E2E_TEST_HOOKS=1`. |
| `npm run migrate` | Applies pending `db/migrations/*.sql` |

## Migrations

Add a new file `db/migrations/NNN_name.sql`, and never edit one that has already been applied. Each file runs in its own transaction, and applied files are recorded in `schema_migrations`.

## Shared spaces

`/shared` offers creation or joining until the user has a space, then opens Calendar. Settings manages the name, members, invitations and leaving. Each space supports up to 10 members, with distinct named colors; ownership passes by join time. The last member leaving deletes the space and its data. Outstanding invites expire when ownership changes.

The authenticated JSON API uses `/api/shared/spaces`: `GET` reads your space, `POST {name}` creates one, and `POST /join {code}` joins. `GET /:id` reads a space, `PATCH /:id {name}` renames it, `POST /:id/invites {}` generates a single-use 24-hour code, and `POST /:id/leave {}` leaves. Responses contain `data` or an `error` message. Reads and mutations check current database membership; renaming and inviting require ownership. Join attempts are limited to 20 per 15 minutes per user. Migration `004_space_membership.sql` records join times and enforces unique member colors within a space.

## Shared calendar

Calendar has month, week and day views, member-colored events and a neutral Group badge. Click a date to open its day; use Add event to plan something. Week view scrolls horizontally on narrow screens. Event details use a desktop modal or mobile bottom sheet; Escape and browser Back close it.

Times are entered and displayed in `Europe/Lisbon`, regardless of the device time zone, and stored in PostgreSQL `timestamptz` as UTC instants. Events can span dates. Nonexistent spring-forward times are rejected; repeated autumn times offer first/second occurrence choices. Export calendar includes every event in the space, across all dates; each event also has an `.ics` download and an Add to Google Calendar link. Downloads use UTC timestamps, escaped text, CRLF and UTF-8 line folding per [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).

`/api/shared/events`: `GET` lists your space's events, `POST` creates one; `GET /:id`, `PATCH /:id` and `DELETE /:id` read, replace and delete an event. Create/replace accepts `{title, notes, startsAt, endsAt, isGroup, assigneeId}`; timestamps must be ISO UTC strings ending in `Z`, end must follow start, and assignee must be a current member (or `null` for a group). All space members can manage events. `GET /export` and `GET /:id/export` download calendars. Every operation checks current membership inside the same transaction as the read/write. A departing member's events remain labeled Former member until reassigned; they cannot access their previous space. No new migration is needed for Calendar.

## Docker image

From the repo root:

```sh
docker build --build-context migrations=db/migrations -t diogomota-com ./app
```

`db/migrations` is outside `./app`, so `--build-context` is how it gets into the image. Inside a container, `npm run migrate` applies the migrations and `node server.js` starts the app on port 3000. The `/apps` title shows the image's version, `apps (dev)` unless you add `--build-arg APP_VERSION=v0.6.0` (also `dev` with `npm run dev`).

## Production

The VPS runs [docker-compose.prod.yml](docker-compose.prod.yml) (Postgres, app, Nginx, Certbot) in `/opt/diogomota`. Server setup, TLS, backups and restores are scripts in [infra/](infra/).

### Deploys

Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml), one run at a time:

1. **check**: `npm ci`, lint, typecheck and build in `app/`. This is [.github/workflows/ci.yml](.github/workflows/ci.yml), which also runs on every pull request.
2. **image**: builds the image and pushes it to Docker Hub as `diogofrmota/diogomota-com:<tag>`, `:<version>` and `:latest`. The tag is the short commit SHA, its first 7 characters; the version (see [Versions](#versions)) is also shown on `/apps` and added to the commit as a git tag.
3. **deploy**: over SSH as `deploy`, copies `docker-compose.prod.yml`, `nginx/`, `infra/` and `db/migrations/` to `/opt/diogomota` and runs [infra/deploy.sh](infra/deploy.sh) `<tag>` there. That pulls the image, applies pending migrations, sets `IMAGE_TAG=<tag>` in `.env`, runs `docker compose up -d app nginx`, reloads nginx and deletes old app images (it keeps the deployed one and the two newest others). The job then waits up to 60 s for https://diogomota.com/api/health to return 200; if it doesn't, the run fails and prints the app's logs.

The app container is replaced in place, so expect a few seconds of 502s. Apart from `IMAGE_TAG`, the deploy never touches `.env`, `backups/` or `logs/` on the VPS. A changed `infra/crontab` is copied but not installed: run `crontab infra/crontab` there.

The workflow needs these repository secrets (Settings → Secrets and variables → Actions): `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (read & write), `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` and `VPS_KNOWN_HOSTS`. GitHub masks secret values in logs, so the Docker Hub username, the VPS address and the word `deploy` show up as `***`.

### Versions

Every deploy gets the next patch version, `vX.Y.Z`. `app/package.json` holds `X.Y.0`, and the image job sets the patch to one more than the newest `vX.Y.*` git tag (`0` if there is none yet). To move to a new minor (or major), e.g. when a roadmap goal starts, run `npm version 0.9.0 --no-git-tag-version` in `app/` and commit: the next deploy is `v0.9.0`, then `v0.9.1`, and so on. A version other than `X.Y.0` in `package.json` fails the image job.

A failed build doesn't use up a number, because the git tag is only added once the image is on Docker Hub. Run `git fetch --tags` to get the tags locally.

### Rollback

GitHub → Actions → Deploy → Run workflow, on `main`, with `image_tag` set to the 7-character short SHA of an older commit (`git log --oneline`, the tags on Docker Hub, or `git rev-parse --short v0.6.3` for a version). This skips check and image and deploys that existing image, using the compose, nginx and infra files of the current `main`. Migrations only go forward and are never undone, so the older image has to work with the current schema.

The rollback holds until the next push to `main`, or a run with an empty `image_tag`, which deploys the newest commit again. Without GitHub, the same thing works by hand: `ssh deploy@162.19.252.190`, then `bash /opt/diogomota/infra/deploy.sh <tag>`. To see which tag is live, check the summary of the last Deploy run, or run `grep IMAGE_TAG /opt/diogomota/.env` on the VPS.

### Logs

- **Deploys**: GitHub → Actions → Deploy → the run. The summary shows the deployed tag.
- **Containers**: on the VPS, in `/opt/diogomota`: `docker compose ps` for status and health, `docker compose logs -f app` (or `nginx`, `postgres`). Docker keeps up to 3 × 10 MB of logs per container.
- **Cron jobs**: `/opt/diogomota/logs/backup.log` and `/opt/diogomota/logs/renew-cert.log`.
