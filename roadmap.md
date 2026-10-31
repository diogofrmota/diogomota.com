# diogomota.com — Roadmap

How to use this file:
- Work top to bottom. **[You]** blocks are manual tasks (accounts, payments, DNS, secrets). **Goal** blocks are ready-to-paste `/goal` prompts for Claude Code, run from this folder.
- Do not start a goal until every task in its "Before" list is ticked.
- Each goal ends with a local commit. Pushing to `main` deploys (from Goal 3 on), so push when you want it live.
- `plan.md` is the spec, including the technical decisions and names (repo, image).

**Current focus: local development.** Do Goal 1, then Goals 4 to 14 on your machine. Everything marked **Later** (0.4 VPS, 0.5 DNS, Goals 2 and 3, preparing the VPS, first deploy) and 0.6 Resend can wait until the VPS is bought; do them before Goal 15. Nothing is deployed until Goal 3 exists, so pushing to `main` is safe in the meantime.

---

## Overview

| # | Step | Type | Result |
|---|---|---|---|
| 0 | Accounts, purchases, keys | You | Everything external exists (local tools, repo, Docker Hub done) |
| 1 | Scaffold | Goal | Next.js + Postgres running locally, schema, tests |
| 2 | Server config | Goal | **Later.** VPS setup script, prod compose, Nginx, SSL, backups |
| — | Prepare the VPS | You | **Later.** VPS hardened, DNS live, first certificate |
| 3 | CI/CD | Goal | **Later.** Push to `main` → Docker Hub → VPS |
| — | First deploy | You | **Later.** https://diogomota.com is live |
| 4 | Landing + hub | Goal | `/` and `/apps` (logged-out) |
| 5 | Auth + account | Goal | Signup, login, account settings, protected routes |
| 6 | Password reset | Goal | Reset emails through Resend |
| 7 | App shell | Goal | Sidebar / bottom nav, SPA navigation, theme |
| 8 | Shared: spaces | Goal | Create / join / invite / leave, settings |
| 9 | Shared: calendar | Goal | Month/week/day, events, .ics export |
| 10 | Shared: tasks | Goal | Lists, drag & drop, assignees |
| 11 | Shows: TMDB + Discover | Goal | TMDB client, cache, Discover, search |
| 12 | Shows: Home | Goal | Library, status, progress, rating |
| 13 | Shows: Profile + friends | Goal | Favourites, stats, friends |
| 14 | Polish | Goal | Mobile pass, empty/loading states, e2e |
| 15 | Launch checks | Goal + You | Backup restore tested, rollback runbook, friends invited |

---

## Step 0 — [You] Accounts, purchases, keys

Do these first; some (DNS, Resend verification) take time to propagate.

Already done: Node.js 22 and Docker Desktop installed, SSH key, this folder's own git repo (the stray home-folder repo was removed; `main`, pushed to GitHub with `plan.md` and `roadmap.md`), Docker Hub repo `diogofrmota/diogomota-com` and its two tokens (`github-actions` read & write, `vps-pull` read-only; both in the local `.env`, which is git-ignored). TMDB token, local `AUTH_SECRET` and Postgres password are in `.env` too. The production `.env` on the VPS is created at deploy time with freshly generated secrets (`openssl rand -base64 32`), not the local ones. Step numbers below are unchanged because other sections refer to them.

### 0.4 OVH VPS
- [ ] Order a VPS (the smallest current range is above the "comfortable" specs in plan.md: 2+ vCPU, 4+ GB RAM, 40+ GB SSD).
- [ ] OS: **Ubuntu 24.04 LTS**. Datacenter: closest to Lisbon (Western Europe).
- [ ] Paste your **public** SSH key (`~/.ssh/id_ed25519.pub`) during the order.
- [ ] Pay, then note the **IPv4** (and IPv6 if shown) from the OVH welcome email / control panel.
- [ ] Check you can log in: `ssh ubuntu@<vps-ip>` (OVH's default user on Ubuntu images is `ubuntu`).

### 0.5 Porkbun DNS
- [ ] Porkbun → Domain Management → `diogomota.com` → DNS: **delete** the default parking records (`ALIAS`/`CNAME` to `pixie.porkbun.com` and the wildcard `*`).
- [ ] If URL forwarding is on for the domain, turn it off.
- [ ] Add `A  @    <vps-ipv4>` and `A  www  <vps-ipv4>` (TTL 600).
- [ ] If the VPS has IPv6: add `AAAA @` and `AAAA www` too.
- [ ] Check after a few minutes: `nslookup diogomota.com` returns the VPS IP.

### 0.6 Resend (email)
- [ ] Create a Resend account → Domains → Add `diogomota.com` (region: EU).
- [ ] Add every DNS record Resend shows (MX + TXT on `send`, TXT `resend._domainkey`) in Porkbun, exactly as given.
- [ ] (Recommended) Add DMARC: `TXT _dmarc  v=DMARC1; p=none;`
- [ ] Wait for **Verified** in Resend, then create an API key (Sending access, domain `diogomota.com`). Needed by Goal 6.

---

## Goal 1 — Scaffold

Before: nothing left (local tools and the git repo are done).

```
/goal Scaffold the diogomota.com project in this folder. Read plan.md and roadmap.md first.

Build:
- Next.js (current stable, App Router, TypeScript, ESLint) in app/, with output: "standalone". CSS Modules only. No pages yet beyond a placeholder for /.
- app/lib/db.ts: a pg Pool from DATABASE_URL plus a typed query helper. Raw SQL only, no ORM.
- db/migrations/001_initial.sql with the full schema from plan.md "Database Schema" (users, spaces, invites, events, event_assignees, task_lists, tasks, shows, user_shows, friendships, password_resets). Add what the plan clearly needs but does not list, and nothing else: a per-member color for the Shared app, season/episode counts and episode runtime on shows (for progress and hours watched), unique constraints (username, email, tmdb_id+type, user_id+show_id, friendship pairs), foreign keys with sensible ON DELETE, and indexes on foreign keys. Use citext or lower() uniqueness for username/email.
- A migration runner (app/scripts/migrate.mjs, plain node + pg) that applies db/migrations/*.sql in order inside transactions and records them in a schema_migrations table. Expose it as `npm run migrate`. It must also run inside the production image.
- GET /api/health returning 200 {"status":"ok"} after a successful SELECT 1.
- app/Dockerfile: multi-stage, node 22 alpine, standalone output, non-root user, includes the migration runner and db/migrations.
- docker-compose.yml for local development: postgres:16 with a named volume and healthcheck; the app runs with `npm run dev` on the host against it.
- .env.example listing every variable the project will need (DATABASE_URL, POSTGRES_*, AUTH_SECRET, AUTH_URL, RESEND_API_KEY, MAIL_FROM, TMDB_READ_TOKEN), with comments. .gitignore covering node_modules, .next, .env*, backups/, test output.
- Playwright set up in app/ with one smoke test (/ loads, /api/health is ok). Scripts: dev, build, start, lint, typecheck, test:e2e, migrate.
- README.md: prerequisites, local setup in 5 steps, the commands above. Keep it short.

Done when: `docker compose up -d` starts postgres healthy; `npm run migrate` applies 001 on an empty database and is a no-op on the second run; `npm run lint`, `npm run typecheck` and `npm run build` pass; `npm run test:e2e` passes; `docker build ./app` succeeds. Then commit everything on main with a clear message (do not push).
```

After:
- [ ] `git push` (the upstream is already set; no deploy yet, the workflow comes in Goal 3).

---

## Goal 2 — Server configuration

Before:
- [ ] Goal 1 done
- [ ] 0.4 done (VPS ordered, IP known)

```
/goal Write the production server configuration for diogomota.com. Read plan.md (Hosting, Backup Strategy, Deployment Strategy) and roadmap.md first. Nothing in this goal connects to the VPS; I run the scripts myself.

Build in infra/ (and nginx/ at the repo root as in plan.md):
- infra/setup-vps.sh: idempotent bootstrap for a fresh OVH Ubuntu 24.04 VPS, run once as root via sudo. It creates a `deploy` user (in the docker group) with the authorized_keys of the `ubuntu` user, disables SSH password and root login, enables UFW (22, 80, 443 only), installs fail2ban (sshd jail) and unattended-upgrades, adds a 2 GB swapfile if none exists, installs Docker Engine + compose plugin from Docker's official apt repo, and creates /opt/diogomota and /opt/diogomota/backups owned by deploy. Print a summary at the end.
- docker-compose.prod.yml: services postgres (16, named volume, healthcheck, not published to the host), app (image diogofrmota/diogomota-com:${IMAGE_TAG:-latest}, env_file .env, depends_on postgres healthy, healthcheck on /api/health, restart unless-stopped), nginx (ports 80/443, mounts nginx/ config, certbot webroot and /etc/letsencrypt), certbot (profile-gated, used only for issue/renew).
- nginx/nginx.conf: HTTP serves /.well-known/acme-challenge and redirects everything else to https://diogomota.com; www redirects to the apex; HTTPS proxies to app:3000 with proper forwarded headers, gzip, sensible security headers, HSTS, client_max_body_size 5m. Plus a bootstrap HTTP-only config used before the first certificate exists.
- infra/issue-cert.sh: first certificate for diogomota.com + www.diogomota.com via the certbot container (webroot), switching nginx from the bootstrap config to the full one.
- infra/renew-cert.sh + the cron line to install (twice daily): certbot renew, then nginx reload.
- infra/backup.sh + cron line: pg_dump from the postgres container every 3 days at 03:00, gzip, date-stamped in /opt/diogomota/backups, delete dumps older than 14 days. infra/restore.sh: restore a given dump into the running postgres after a confirmation prompt.
- .env.production.example: every variable the prod stack needs.
- docs/deploy.md: the exact ordered commands I run on the VPS (copy files, setup-vps.sh, docker login with the read-only token, create .env, start postgres, run migrations, start app + nginx, issue-cert.sh, install cron lines) and how to check each step. Keep it a runbook, no prose padding.

Done when: every script passes `bash -n` and shellcheck (run shellcheck via the koalaman/shellcheck Docker image); `docker compose -f docker-compose.prod.yml config` succeeds with a filled-in sample env; both nginx configs pass `nginx -t` inside an nginx container (stub the upstream and certificate paths as needed for the test only); docs/deploy.md references only files that exist. Then commit on main (do not push).
```

## [You] Prepare the VPS

Before:
- [ ] Goal 2 done, 0.5 (DNS resolves to the VPS) done

- [ ] Follow `docs/deploy.md` up to and including the certificate step. The app container can't start yet (no image on Docker Hub), so stop at nginx + certbot if the runbook says so.
- [ ] Check: `ssh deploy@<vps-ip>` works, `ssh root@…` and password login fail, `sudo ufw status` shows 22/80/443 only.
- [ ] Check: https://diogomota.com shows a valid certificate (even if it's a 502 for now).

---

## Goal 3 — CI/CD

Before:
- [ ] VPS prepared (above)
- [ ] GitHub repo → Settings → Secrets and variables → Actions → add:
  - `DOCKERHUB_USERNAME` = `diogofrmota`
  - `DOCKERHUB_TOKEN` = the Read & Write token (`DOCKERHUB_TOKEN` in your local `.env`)
  - `VPS_HOST` = VPS IPv4
  - `VPS_USER` = `deploy`
  - `VPS_SSH_KEY` = a **new** private key made only for deploys (`ssh-keygen -t ed25519 -f deploy_key -C github-actions`); add `deploy_key.pub` to `/home/deploy/.ssh/authorized_keys` on the VPS
  - `VPS_KNOWN_HOSTS` = output of `ssh-keyscan <vps-ip>`

```
/goal Create the GitHub Actions pipeline for diogomota.com. Read plan.md (Deployment Strategy), roadmap.md and docs/deploy.md first.

.github/workflows/deploy.yml:
- Trigger: push to main, plus workflow_dispatch with an optional image_tag input for rollbacks (skips the build and deploys that tag).
- Job check: npm ci, lint, typecheck, build in app/.
- Job image (needs check): docker/login-action with DOCKERHUB_USERNAME/DOCKERHUB_TOKEN, buildx with GitHub Actions cache, push diogofrmota/diogomota-com tagged with the short commit SHA and latest.
- Job deploy (needs image): using VPS_HOST, VPS_USER, VPS_SSH_KEY and VPS_KNOWN_HOSTS (strict host key checking, no third-party SSH actions unless pinned to a commit SHA), copy docker-compose.prod.yml, nginx/, db/migrations and infra/ to /opt/diogomota, then on the VPS: pull the new tag, run migrations with `docker compose run --rm app npm run migrate` (or the equivalent node command in the image), `docker compose up -d app nginx`, then poll https://diogomota.com/api/health until 200 or fail the job after 60 s.
- concurrency group so two deploys never overlap. Least-privilege permissions block.
Also a small workflow .github/workflows/ci.yml running the check job on pull requests.
Update docs/deploy.md with: how a deploy works, how to roll back (workflow_dispatch with an older SHA tag), and where to see logs.

Done when: actionlint (via its Docker image) reports no errors for both workflows; the deploy steps use only files that exist in the repo and paths that match docs/deploy.md; secrets are referenced only by the names listed in roadmap.md Goal 3. Then commit on main (do not push).
```

## [You] First deploy

- [ ] `git push`. Watch the run in GitHub → Actions.
- [ ] Check https://diogomota.com/api/health returns `{"status":"ok"}` and the placeholder page loads.
- [ ] Check https://www.diogomota.com and http://diogomota.com both redirect to https://diogomota.com.
- [ ] From now on, every push to `main` deploys.

---

## Goal 4 — Landing + app hub

Before:
- [ ] Goal 1 done (the deploy is not needed yet; develop and test locally)

```
/goal Build the landing page (/) and the app hub (/apps) for diogomota.com, logged-out state only (auth comes in the next goal). Read plan.md (Pages, General UI/UX Rules) and roadmap.md first.

- Self-host IBM Plex Mono Regular with next/font (no Google Fonts request at runtime). It is used only on / and /apps.
- /: full black background, centered text exactly as in plan.md, the Richemont link opens https://www.richemont.com/, [Check Apps] links to /apps. No navbar, no footer. Proper <title>, description and Open Graph tags.
- /apps: black background, top bar with Login | Sign Up buttons (they open placeholder routes for now), cards for Shared (/shared) and Shows (/shows) with logo (simple SVGs in public/logos), name and short description. Logged out, clicking a card opens the login prompt instead of the app. Keep the app list in one typed array so adding an app is one entry.
- Mobile-first, works from 320 px wide to desktop, keyboard focus visible, sufficient contrast.
- Favicon and a 404 page in the same style.
- Playwright tests: landing content and link targets, /apps shows both cards, clicking a card while logged out opens the login prompt, no horizontal scroll at 375 px.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

---

## Goal 5 — Auth + account

Before:
- [ ] Goal 4 done
- [ ] Decide: is sign-up **open to anyone**, or gated by a shared **sign-up code** (a `SIGNUP_CODE` env var)? Add your choice to the prompt below where it says `<SIGNUP>`.

```
/goal Add authentication and account settings to diogomota.com with NextAuth (Auth.js) credentials provider. Read plan.md (Authentication Flow, Account Settings, Pages) and roadmap.md first. Sign-up policy: <SIGNUP>.

- Sign up with username + email + password (validate: username 3-20 chars [a-z0-9_], valid email, password >= 10 chars); hash with bcrypt (bcryptjs) or argon2. Login by username or email. JWT sessions containing user id and username. Generic error messages that do not reveal whether an account exists.
- Basic rate limiting on login and sign-up (in-memory per IP is enough at this scale).
- Login and Sign Up as modals or pages reachable from the /apps top bar; after login, return to /apps or to the app the user tried to open.
- Logged-in top bar on /apps: username + account dropdown (Account settings, Logout). Cards go straight into the apps.
- Account settings (from the dropdown): change username (unique), change password (requires current password), theme preference light/dark stored in users.theme_preference, logout. Leave a clear placeholder for "Forgot password" (next goal).
- Middleware protects /shared and /shows (and their API routes): unauthenticated page requests redirect to /apps, API requests get 401.
- Placeholder pages for /shared and /shows that show "signed in as <username>".
- Any schema change goes in a new db/migrations file.
- Playwright tests: sign up, log out, log in, wrong password, protected-route redirect, change username, change password, theme preference persists after re-login.

Done when lint, typecheck, build and all e2e tests pass against the local docker compose database. Commit on main (do not push).
```

After:
- [ ] Add `AUTH_SECRET` and `AUTH_URL=https://diogomota.com` to `/opt/diogomota/.env` on the VPS, then push.

---

## Goal 6 — Password reset (Resend)

Before:
- [ ] Optional for now: 0.6 (Resend domain **Verified**, API key created). Without `RESEND_API_KEY` the reset link is logged to the server console in development, so you can build and test this goal without it.
- [ ] Put `RESEND_API_KEY` and `MAIL_FROM="diogomota.com <no-reply@diogomota.com>"` in `app/.env.local` and in `/opt/diogomota/.env` on the VPS

```
/goal Add the forgot/reset password flow to diogomota.com using Resend. Read plan.md (Authentication Flow, password_resets table) and roadmap.md first.

- "Forgot password" link in the login UI → enter email → always show the same confirmation message, whether or not the account exists.
- Generate a random token, store only its SHA-256 hash in password_resets with a 1 hour expiry; invalidate older unused tokens for that user. Rate limit requests per IP and per email.
- Send the email through the Resend API (official resend package) from MAIL_FROM: plain, minimal HTML + text version with the reset link https://<AUTH_URL>/reset-password?token=...
- /reset-password: new password + confirm, same password rules as sign-up; on success mark the token used, invalidate other sessions if feasible with JWT (e.g. a password_changed_at check), and send the user to login.
- In development, if RESEND_API_KEY is missing, log the reset link to the server console instead of sending.
- Playwright tests (using the dev console fallback or a test hook that is disabled in production): request reset, use link, log in with the new password, expired token rejected, reused token rejected.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

After:
- [ ] Push, then test the real flow on https://diogomota.com with your own email (check it doesn't land in spam).

---

## Goal 7 — App shell

```
/goal Build the shared app shell used by every app on diogomota.com. Read plan.md (Pages "/(app_name)", General UI/UX Rules) and roadmap.md first.

- components/common: AppShell with a Sidebar (desktop) and BottomNav (mobile) driven by a list of tabs, a top bar with a back-to-/apps link and the same account dropdown as /apps, ThemeToggle.
- Typography inside apps: Inter or the system font stack (not IBM Plex Mono).
- Theme: CSS variables for light and dark, applied from the user's saved preference without a flash on load; toggling saves to the database.
- SPA navigation hook (hooks/useAppView or similar): the URL stays /<app>, the current view lives in React state, history.pushState/popstate make the browser back button move between views and close open modals/panels.
- Wire /shared (Calendar | Tasks | Settings) and /shows (Home | Discover | Profile) to the shell with empty placeholder views.
- Playwright tests: tabs switch views without URL change, back button returns to the previous view, bottom nav at 375 px and sidebar at 1280 px, theme persists across reloads.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

---

## Goal 8 — Shared: spaces

```
/goal Build the Spaces system of the Shared app (/shared) on diogomota.com. Read plan.md (App 1 — Shared: Core Concept, Settings, UI/UX Details) and roadmap.md first.

- First visit with no space: "Create a Space" (name) or "Join with Code". One space per user.
- Invites: owner generates a code (short, unambiguous characters, e.g. 8 chars), expires after 24 h, single use. Joining with an invalid, expired or used code shows a clear error.
- Each member gets a distinct color from a fixed accessible palette on join.
- Settings view: edit space name (owner), members list with role (owner/member) and color, invite (show code + copy button + expiry), leave space. If the owner leaves, ownership passes to the oldest remaining member; the space is deleted when the last member leaves.
- API routes under /api/shared/spaces with server-side checks that the user belongs to the space for every operation.
- Returning users land on their space's Calendar view.
- Playwright tests with two users: create, invite, join, rename, leave, ownership transfer, expired/used code errors, a user cannot read another space's data via the API.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

---

## Goal 9 — Shared: calendar

```
/goal Build the Calendar view of the Shared app on diogomota.com. Read plan.md (App 1 — Shared: Calendar) and roadmap.md first.

- Month, week and day views, Google Calendar-like, usable on mobile (use FullCalendar's MIT-licensed plugins or a custom implementation; style it to match the app theme in light and dark).
- Add/edit/delete events: title, date, start/end time, optional notes, assignee = one member or the whole group. Event color = assignee's member color; group events use a neutral color plus a group badge/icon.
- Click an event to view, edit or delete it (modal on desktop, bottom sheet on mobile; back button closes it).
- Export: download an .ics file for a single event and for the whole calendar, and an "Add to Google Calendar" link per event. Correct time zone handling (Europe/Lisbon default, stored in UTC).
- API routes under /api/shared/events, scoped to the user's space.
- Empty state: "Nothing planned yet — add your first event!"
- Playwright tests: create personal and group events, edit, delete, switch views, .ics download contains the event, a member of another space cannot see the events.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

---

## Goal 10 — Shared: tasks

```
/goal Build the Tasks view of the Shared app on diogomota.com. Read plan.md (App 1 — Shared: Tasks) and roadmap.md first.

- Multiple lists per space (create, rename, delete, reorder lists).
- Tasks: title, optional due date and notes, assignee (member or unassigned, shown with member color), checkbox to complete. Completed tasks go to a collapsible "Done" section at the bottom.
- Drag and drop reorder within a list with dnd-kit, working with touch and keyboard; positions persisted.
- Delete by swipe on mobile and a button on desktop, with undo for a few seconds.
- Optimistic updates with rollback on API error.
- API routes under /api/shared/tasks, scoped to the user's space.
- Friendly empty states.
- Playwright tests: create list, add tasks, reorder (persists after reload), complete, delete, assign.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

After:
- [ ] Push and try the Shared app on your phone with a second account.

---

## Goal 11 — Shows: TMDB + Discover

Before:
- [ ] Copy `TMDB_READ_TOKEN` from the local `.env` into `app/.env.local` and `/opt/diogomota/.env` (it must be the long v4 **API Read Access Token**)

```
/goal Build the TMDB integration and the Discover view of the Shows app on diogomota.com. Read plan.md (App 2 — Shows Tracker: TMDB Integration, Discover, UI/UX Details) and roadmap.md first.

- lib/tmdb.ts: server-only client using TMDB_READ_TOKEN (Bearer), typed responses, timeouts, image URL helper. The token never reaches the browser.
- Caching: when a title is added to a library or opened in detail, upsert it into the shows table (including seasons, episode counts, episode runtime). Re-fetch if last_updated is older than 7 days. Cache TMDB list endpoints (top rated, popular, search) in memory for a short time.
- Discover with a TV Shows | Movies switch, identical layout for both: Top Rated, Popular, Added by Friends (titles in accepted friends' libraries; empty until friends exist). Cards: poster, title, year, average rating.
- Search bar reachable from every Shows view, debounced.
- Detail panel with "Add to Library" (Watching or Planned).
- Poster-heavy grid, skeleton loaders, TMDB attribution as required by their terms.
- Playwright tests with TMDB responses mocked at the API route level (no real TMDB calls in tests): Discover sections render, search works, add to library creates the rows.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

---

## Goal 12 — Shows: Home

```
/goal Build the Home (library) view of the Shows app on diogomota.com. Read plan.md (App 2 — Shows Tracker: Home, UI/UX Details) and roadmap.md first.

- TV Shows | Movies toggle filtering all sections; sections Watching (with progress like S2 E5), Planned, Completed (with rating).
- Cards: poster, title, year, status badge. Long press (mobile) or a menu (desktop) for quick status change and rating.
- Detail panel: overview, rating, seasons/episodes (TV) or runtime (movie); change status, set progress (season/episode pickers, "next episode" button), rate 1-5 stars, mark favourite, remove from library.
- Completing the last episode offers to mark the show completed.
- Empty states as in plan.md.
- Playwright tests (TMDB mocked): add, change status, progress, rate, favourite, remove, toggle filter.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

---

## Goal 13 — Shows: Profile + friends

```
/goal Build the Profile view and the friends system of the Shows app on diogomota.com. Read plan.md (App 2 — Shows Tracker: Profile, friendships table) and roadmap.md first.

- Favourites grid from the user's library.
- Stats: titles completed (TV and movies), hours watched (episodes watched x episode runtime + completed movie runtimes).
- Friends: add by username (sends a pending request), incoming requests with accept/decline, remove friend. Only accepted friends see each other's libraries.
- Friend view: their watching/completed/favourites/stats, read-only.
- Wire "Added by Friends" in Discover to accepted friends only.
- Playwright tests with two users: request, accept, view friend library, decline, remove, a non-friend cannot read a library via the API, stats math.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

---

## Goal 14 — Polish

```
/goal Polish diogomota.com for launch. Read plan.md (General UI/UX Rules, Phase 5) and roadmap.md first.

- Mobile pass on every view at 375x812 and 390x844 plus desktop 1280x800: no horizontal scroll, tap targets >= 44 px, safe-area insets for the bottom nav, inputs don't trigger iOS zoom.
- Every list/section has an empty state and every async load has a skeleton or spinner; errors show a friendly message with retry.
- Back button behaviour consistent in both apps (views, modals, panels).
- Light and dark mode checked on every view.
- Accessibility: labels on all inputs/icon buttons, focus management in modals, run @axe-core/playwright on main views and fix serious/critical issues.
- Add a web app manifest and icons so the site can be added to the home screen.
- Remove dead code, unused dependencies and leftover placeholders.
- Playwright: run the whole suite on a mobile and a desktop project.

Done when lint, typecheck, build and the full e2e suite pass on both projects with zero serious/critical axe violations. Commit on main (do not push).
```

---

## Goal 15 — Launch checks

Before:
- [ ] The **Later** items are done: VPS bought (0.4), DNS (0.5), Resend (0.6), Goals 2 and 3, VPS prepared, first deploy live.

```
/goal Prepare diogomota.com operations for launch. Read docs/deploy.md, infra/ and roadmap.md first. Nothing here connects to the VPS; give me the commands to run.

- docs/operations.md: how to check health and logs, restart, roll back to a previous image tag, restore a backup (step by step, including a dry run into a scratch database), rotate secrets (AUTH_SECRET, DB password, Resend, TMDB, Docker Hub, deploy key), and renew/inspect certificates.
- Optional offsite backup: a script and cron line that copies the latest dump to an external location of my choice (leave the target as a clearly marked variable), with a note on what it costs.
- Verify the backup and restore scripts work locally against the dev compose stack: dump, drop, restore, data is back.
- Check headers on the production config (HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors) and that no secret appears in the repo or the built image (`git grep` and image history).

Done when the local backup/restore round-trip succeeds, docs/operations.md references only files that exist, and the secret scan is clean. Commit on main (do not push).
```

## [You] Launch

- [ ] Push and confirm the deploy is green.
- [ ] On the VPS: run a real backup, then the restore dry run from `docs/operations.md`.
- [ ] Do a full pass on your phone: sign up a second account, Shared with two people, Shows with a friend.
- [ ] Set a calendar reminder to check backups and `docker system df` monthly.
- [ ] Send friends the link.
