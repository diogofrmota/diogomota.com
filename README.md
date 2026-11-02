# diogomota.com

Personal site plus two small apps for friends (Shared, Shows), built with Next.js and PostgreSQL. The spec is in [plan.md](plan.md) and the build order is in [roadmap.md](roadmap.md).

## Prerequisites

- Node.js 22
- Docker Desktop (with Compose)

## Local setup

1. `cp .env.example .env` and fill in the values. Docker Compose reads this file.
2. Create `app/.env.local` with the app variables from `.env` (at least `DATABASE_URL`). Next.js and `npm run migrate` read this file.
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
| `npm run test:e2e` | Playwright tests. Starts the dev server and needs Postgres running. |
| `npm run migrate` | Applies pending `db/migrations/*.sql` |

## Migrations

Add a new file `db/migrations/NNN_name.sql`, and never edit one that has already been applied. Each file runs in its own transaction, and applied files are recorded in `schema_migrations`.

## Docker image

From the repo root:

```sh
docker build --build-context migrations=db/migrations -t diogomota-com ./app
```

`db/migrations` is outside `./app`, so `--build-context` is how it gets into the image. Inside a container, `npm run migrate` applies the migrations and `node server.js` starts the app on port 3000.

## Production

The VPS runs [docker-compose.prod.yml](docker-compose.prod.yml) (Postgres, app, Nginx, Certbot) in `/opt/diogomota`. Server setup, TLS, backups and restores are scripts in [infra/](infra/).
