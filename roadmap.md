# diogomota.com — Roadmap

## Done

- Node.js 22 and Docker Desktop installed
- Git repo for this folder, `main` pushed to GitHub (stray home-folder repo removed)
- Docker Hub repo `diogofrmota/diogomota-com`
- Docker Hub tokens `github-actions` (read & write) and `vps-pull` (read-only), in the local `.env`
- TMDB read token, local `AUTH_SECRET` and local Postgres password, in the local `.env`
- OVH VPS `vps-51a51d69.vps.ovh.net`: IPv4 `162.19.252.190`, IPv6 `2001:41d0:701:1100::ec4e`, Ubuntu 24.04.4 LTS
- SSH key `C:\Users\diogo\.ssh\id_ed25519` installed for `ubuntu` (key login, passwordless `sudo`)
- `ubuntu` password changed, stored in the local `.env`
- Porkbun parking records (`ALIAS` and wildcard `CNAME` to `pixie.porkbun.com`) deleted, Porkbun nameservers kept
- Porkbun `A` and `AAAA` records for `@` and `www` → `162.19.252.190` and `2001:41d0:701:1100::ec4e` (TTL 600)
- Resend account and domain `diogomota.com` (region EU)
- Resend DNS records in Porkbun: TXT `resend._domainkey`, CNAMEs `send` and `rsend`, TXT `_dmarc` (`v=DMARC1; p=none;`)
- Resend API key (sending access), in the local `.env` and `app/.env.local`
- Goal 1, scaffold: Next.js app, Postgres schema, migration runner, Dockerfile, Playwright smoke test (pushed)
- Goal 2, server config: VPS setup script, production compose, nginx, TLS, backup and restore scripts, VPS runbook (pushed; the runbook was deleted once the VPS was prepared)
- Prepare the VPS (2026-11-01): `setup-vps.sh` run and rebooted onto the new kernel; `deploy` key login works, root and password login refused; UFW 22/80/443 only; fail2ban `sshd` jail on; stack files in `/opt/diogomota`; Docker Hub login with `vps-pull`; production `.env` complete (generated `POSTGRES_PASSWORD` and `AUTH_SECRET`, plus `RESEND_API_KEY` and `TMDB_READ_TOKEN`); Postgres healthy; nginx with a Let's Encrypt certificate for `diogomota.com` and `www` (expires 2027-01-30), `www` and `http` redirect to `https://diogomota.com/`; cron jobs for certificate renewal (03:17 and 15:17) and backups (03:00 every 3 days), first backup taken. No app yet (`/api/health` is 502): the first CI deploy runs the migrations and starts it
- Goal 3, CI/CD (2026-11-02): `.github/workflows/ci.yml` (lint, typecheck, build on pull requests) and `.github/workflows/deploy.yml` (push to `main`: check, then image `diogofrmota/diogomota-com:<short SHA>` + `latest`, then copy the stack files to `/opt/diogomota` over SSH and run `infra/deploy.sh`, then wait up to 60 s for `/api/health`; Run workflow with `image_tag` rolls back). Each deploy pins `IMAGE_TAG` in the VPS `.env`. README Production section covers deploys, rollback and logs. actionlint clean, deploy script tested against a local copy of the stack (pushed)
- Docker Hub repo `diogofrmota/diogomota-com` made private (2026-11-02); the VPS still pulls with `vps-pull` (Read-only scope)
- GitHub Actions secrets set: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (Read & Write), `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (deploy-only key `C:\Users\diogo\.ssh\diogomota_deploy`, comment `github-actions`, in `/home/deploy/.ssh/authorized_keys`), `VPS_KNOWN_HOSTS` (`ssh-keyscan 162.19.252.190`)
- First deploy (2026-11-02): image `cff752c` live. The first attempt failed because the `VPS_USER` secret was missing; it worked after adding the secret and re-running the failed job. `001_initial.sql` applied, `IMAGE_TAG=cff752c` pinned in `/opt/diogomota/.env`, `/api/health` returns `{"status":"ok"}`, placeholder page loads, `https://www`, `http://` and `http://www` redirect (301) to `https://diogomota.com/`, security headers present. From now on every push to `main` deploys; rollback and logs: README.md, Production
- Goal 4, landing + app hub (2026-11-02): `/` (black; four white lines of one size, left-aligned in a block centered on the screen, like portfolio-diogomota.com; IBM Plex Mono self-hosted with `next/font/local` and applied by `components/site/SitePage`, not the root layout; Richemont link opens in a new tab; `[Check Apps]` → `/apps`; title, description, Open Graph tags and a generated preview image in the same layout). `/apps`: top bar `Login | Sign Up` → placeholder pages `/login` and `/signup`; cards for Shared and Shows from the typed list in `app/lib/apps.ts`; logged out, a card opens a login prompt (`components/site/LoginPrompt.tsx`) whose links carry `?next=/shared` or `?next=/shows`. `/shared` and `/shows` don't exist yet (404). Favicon, touch icon, styled 404. Playwright: 27 tests, axe scan clean (`f83bb71`, `19185a7` and `29890a3`, pushed)
- Sign-up policy decided: open to anyone, no sign-up code
- Goal 5, auth + account (2026-11-02): Auth.js (`next-auth@5.0.0-beta.32`, credentials provider) in `app/auth.ts`; JWT session cookie holding only user id and username. Sign up (`/signup`: username 3-20 `[a-z0-9_]`, saved lowercase; email; password 10+ characters and at most 72 bytes, bcryptjs cost 12) logs straight in; log in (`/login`) by username or email in any case. One message for wrong password or unknown account, and one for a taken username or email (sign-up can't hide existence completely without email verification). In-memory rate limits: login 10 per 15 min per IP, sign-up 5 per hour per IP, current-password checks 10 per 15 min per user; the IP is the first `X-Forwarded-For` entry, which nginx sets. `proxy.ts` (Next 16's name for middleware) guards `/shared`, `/shows`, `/account` (redirect to `/apps?next=...`, which opens that app's login prompt) and `/api/shared`, `/api/shows` (401); `next` only accepts same-site paths. `/apps` logged in: username + account menu (Account settings, Logout), cards open the apps. `/account`: change username (unique), change password (current + new + confirm), theme light/dark in `users.theme_preference`, "Forgot password" placeholder (also on `/login`), logout. `/shared` and `/shows` placeholders show "signed in as <username>" in the saved theme. `002_username_format.sql` makes the database enforce the username rule. Playwright: 47 tests (20 new for auth and account); each test sends its own `X-Forwarded-For` so rate limits don't collide, and a global teardown deletes the `e2e_` accounts. `AUTH_SECRET` copied into `app/.env.local` (`267d5d9`, pushed)
- Goal 5 live (2026-11-02): pushed `267d5d9` (also deploying Goal 4); the deploy applied `002_username_format.sql`. On https://diogomota.com: own account signed up, logout and login work, `/shared` opens, theme set in Account settings. Logged out, `/shared` redirects to `/apps?next=%2Fshared` and `/api/shared/*` returns 401; `/api/health` ok
- Goal 6, password reset (2026-11-02): "Forgot password?" on `/login` and "Reset by email" in Account settings open `/forgot-password` (email → one answer whether or not an account has it; the lookup and the email run after the response with `after()`, so the timing doesn't tell either). 32-byte random token, only its SHA-256 stored in `password_resets`, 1 hour, single use; a new request invalidates the account's earlier links. Rate limits: 5 requests per hour per IP (error message), 3 emails per hour per address (silent: same answer, nothing sent). Email through the `resend` package from `MAIL_FROM` (plain text + minimal HTML, link built on `AUTH_URL`, never the Host header); in development without `RESEND_API_KEY` it is printed to the dev server console. `/reset-password` shows "Choose a new password for <username>" (new + confirm, sign-up rules) or "link expired"; setting the password uses up the token in the same SQL statement. `003_password_changed_at.sql`: a password reset or change sets `users.password_changed_at`; each session carries the value it logged in under and `auth.ts` checks it on every read, so both log out every device, this one included, and send the user to `/login?password=changed` (a change in Account settings returns to `/account` after logging in). Test hook: with `E2E_TEST_HOOKS=1` (set by `playwright.config.ts`, ignored in production) emails go to an in-memory outbox at `/api/test/outbox` instead of being sent. Playwright: 59 tests (8 new for reset; expired links are made by moving `expires_at` in the database) (`e56745d`, pushed)
- Goal 6 live (2026-11-02): pushed (the deploy applied `003_password_changed_at.sql`). On https://diogomota.com: reset with own email worked, the email landed in the inbox (not spam). Decided: a password change in Account settings keeps logging out every device, the current one included
- Versions (2026-11-02): images are also tagged `vX.Y.Z` on Docker Hub and the `/apps` title shows it (`apps (v0.6.0)`, the version small and grey; `apps (dev)` locally). `app/package.json` holds `X.Y.0` (now `0.6.0`, one minor per finished goal, `1.0.0` at launch) and is bumped by hand; the image job sets the patch from the newest `vX.Y.*` git tag and tags the commit after the push. README.md, Versions (not committed)

- Goal 7, app shell (2026-11-02): `app/package.json` at `0.7.0`. `components/common/AppShell` takes the app's tabs (`{ id, label, icon, view }`, the first is the default) and shows a sticky top bar (`‹ Apps` back to `/apps`, the app's name, `ThemeToggle`, the same `AccountMenu` as `/apps`, its colors now from `--menu-*` variables with the site's as defaults, long usernames cut off with an ellipsis), the tabs as `Sidebar` (768 px and wider, sticky on the left) or `BottomNav` (narrower, fixed to the bottom, clear of the home indicator with `viewport-fit=cover` and safe-area insets), and the current view. Views switched away from stay mounted but hidden (React `<Activity>`). System font stack. Theme: CSS variables on the shell, switched by `data-theme`, which the server renders from `users.theme_preference`, so there is no flash on load; `<meta name="theme-color">` follows it. The toggle saves through the `setThemePreference` server action and switches back if that fails; both theme actions call `revalidatePath("/", "layout")`, so pages reached with back or forward aren't still in the old theme. `hooks/useAppView.ts`: the view and a stack of open panels are React state, each change is a `history.pushState` entry (under `appView` in `history.state`, beside Next.js's keys) and `popstate` restores it; `closePanel()` is `history.back()`; a reload starts on the default view. Next.js replaces the current entry's state when it refreshes (e.g. a server action that revalidates), so the hook stamps it again after every render; back pressed before hydration is caught with the Navigation API. Views read it with `useAppView()`. `/shared` (Calendar | Tasks | Settings) and `/shows` (Home | Discover | Profile) use the shell with placeholder views; `AppPlaceholder` removed. Test page `/test/app-shell` (test hooks only, 404 in production) has panels and a router refresh. Playwright: 74 tests (15 new in `app-shell.spec.ts`) (`b48f6ea`, pushed)

- Goal 8, Shared spaces (2026-11-02): version `0.8.0`; create/join welcome, returning Calendar, owner rename and single-use 24-hour invite codes with copy and expiry, named member colors (10-member palette), leave with ownership passing by join time and last-member deletion. Authenticated `/api/shared/spaces` checks database membership and owner permissions; transactions serialize membership changes. `004_space_membership.sql` adds join timestamps and unique colors. Playwright covers two-user lifecycle, invalid/expired/used codes, cross-space access, concurrent requests, join-order succession and mobile themes. Lint, typecheck, production build and all 80 e2e tests pass (`c460301`, pushed).

- Goal 9, Shared calendar (2026-11-02): version `0.9.0`; custom month, week and day views (no FullCalendar), styled with the app theme in light and dark, week view scrolls sideways on phones. Add, view, edit and delete events (title, start/end date and time, notes, one member or the whole group); member-colored events, group events neutral with a Group badge, a color legend. Details in a `<dialog>`: modal on desktop, bottom sheet on mobile; Escape and Back close it (`useAppView` panel). Times entered and shown in `Europe/Lisbon` whatever the device zone, stored as UTC `timestamptz`; spring-forward gaps rejected, repeated autumn times offer first/second occurrence. `.ics` per event and for the whole calendar (RFC 5545 escaping, CRLF, UTF-8 folding) and an Add to Google Calendar link per event. `/api/shared/events` checks current membership in the same transaction; a member who leaves loses their assignments (shown as Former member). No migration (uses the `events` and `event_assignees` tables from `001_initial.sql`). Playwright: 85 tests (5 new in `calendar.spec.ts`: desktop and mobile lifecycle, cross-space isolation, time zones and DST, iCalendar format). Lint, typecheck, production build and all e2e tests pass (`d66db2f`, pushed).

- Goals 7–9 live (2026-11-02): pushed; deployed as `v0.7.0` (`b48f6ea`), `v0.8.0` (`c460301`, with `004_space_membership.sql`) and `v0.9.0` (`d66db2f`). On https://diogomota.com: `/api/health` ok, `/apps` shows `v0.9.0`; logged out, `/shared` redirects to `/apps?next=%2Fshared` and `/api/shared/spaces` returns 401

- Goal 10, Shared tasks (2026-11-02): version `0.10.0`; any number of lists per space as chips (the open one remembered per device), Edit lists to create, rename, reorder and delete them (deleting asks first, and takes the tasks with it). Tasks with title, optional due date (Today/Tomorrow/Overdue, Lisbon dates) and notes, and an assignee shown with their member color and name, or unassigned; ticked-off tasks go to a collapsed Done section and come back at the end of the list. Reorder tasks and lists with dnd-kit (`@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10) by a drag handle, with mouse, touch or keyboard, announced to screen readers by name and position. Delete with a bin button where there is a mouse, by swiping left on touch screens, or from the task dialog (modal on desktop, bottom sheet on mobile, Back closes it), with 5 seconds of Undo before the delete is sent. Optimistic updates: clients choose the UUIDs of what they create, changes are sent one at a time in order, and a refused change is dropped from the pending ones, which rolls it back, with a message (and a reload on 404/409). `/api/shared/tasks` checks current membership in the same transaction, another space's ids answer 404, moves renumber positions. No migration (uses `task_lists` and `tasks` from `001_initial.sql`). Empty states for no lists, an empty list and an all-done list. Playwright: 90 tests (5 new in `tasks.spec.ts`: lists lifecycle, tasks lifecycle with mouse and keyboard reorder persisting after reload, phone touch drag and swipe with undo, optimistic rollback, API scoping and validation). Lint, typecheck, production build and all e2e tests pass (`b950208`, pushed).

- Goal 10 live (2026-11-02): pushed; deployed as `v0.10.0` (`b950208`). On https://diogomota.com: `/api/health` ok, `/apps` shows `v0.10.0`; logged out, `/shared` redirects to `/apps?next=%2Fshared` and `/api/shared/tasks` returns 401

- Phone checks (2026-11-02), on https://diogomota.com: Shared and Shows tabs, back gesture through the views and on out to `/apps`, theme switch kept after a reload, bottom bar clear of the home indicator (Goal 7); Shared with a second account: add tasks, assign one, drag one by its handle, swipe one away and undo (Goal 10)

- `TMDB_READ_TOKEN` (the v4 API Read Access Token) copied into `app/.env.local`; the VPS `.env` already had it

- Goal 11, Shows: TMDB + Discover (2026-11-02): version `0.11.0`. `lib/tmdb.ts` (server-only): Bearer `TMDB_READ_TOKEN`, 8 s timeout, typed responses checked field by field, `tmdbImageUrl` (TMDB's closest size, `w92` to `w780`); top rated and popular kept in memory 10 minutes, searches 5. Opening or adding a title upserts it into `shows` (seasons without specials, episode runtime with the latest episode's as fallback, movie runtime, TMDB rating in the new `vote_average` from `005_show_rating.sql`), fetched again once older than 7 days, the old copy kept if TMDB fails. Discover: TV Shows | Movies switch over Top Rated, Popular and Added by Friends (accepted friends' libraries, most shared first; empty state until there are friends), poster grids of 12 with Show all 20, skeleton posters while loading, errors with Retry, TMDB logo (their file) and notice at the bottom. Search: a button in the top bar of every Shows view (AppShell gained an `actions` slot and dialogs as children) and a field at the top of Discover open a search panel (full screen on phones) searching TV shows and movies together, 300 ms after typing stops. Detail panel (bottom sheet on phones, Back/Escape close it, stacks over search): overview, seasons and episodes or runtime, Add to Library as Watching or Planned. API: `/api/shows/discover/...`, `/api/shows/titles/:type/:id`, `POST /api/shows/library`; 120 requests a minute per user. Tests use an in-process fake TMDB (`lib/tmdb-mock.ts`, test hooks only, `/api/test/tmdb` logs its requests) and fake poster images in the browser, so nothing reaches TMDB. Playwright: 97 tests (7 new in `shows-discover.spec.ts`: Discover sections and skeletons, search from every view with debounce, errors and Retry, phone detail sheet and add to library with the rows checked, phone search panel, API validation and 401s, the 7-day refresh and memory caches, Added by Friends with accepted vs pending friends). Lint, typecheck, production build and all e2e tests pass (committed on main, not pushed).

## To-do

### [You] Goal 11 — Push

- [ ] Copy `TMDB_READ_TOKEN` from the root `.env` into `app/.env.local`: it isn't there yet, so `npm run dev` shows "TMDB isn't answering" in Discover (the e2e tests don't need it).
- [ ] Push. The deploy is `v0.11.0` and applies `005_show_rating.sql`. Then on your phone: Discover in both TV Shows and Movies, search from Home and Profile, open a title and add it as Watching.

---

### Goal 12 — Shows: Home

```
/goal Build the Home (library) view of the Shows app on diogomota.com. Read plan.md (App 2 — Shows Tracker: Home, UI/UX Details) and roadmap.md first.

- First bump the version: `npm version 0.12.0 --no-git-tag-version` in app/ (README.md, Versions), so this goal deploys as v0.12.x.
- TV Shows | Movies toggle filtering all sections; sections Watching (with progress like S2 E5), Planned, Completed (with rating).
- Cards: poster, title, year, status badge. Long press (mobile) or a menu (desktop) for quick status change and rating.
- Detail panel: overview, rating, seasons/episodes (TV) or runtime (movie); change status, set progress (season/episode pickers, "next episode" button), rate 1-5 stars, mark favourite, remove from library.
- Completing the last episode offers to mark the show completed.
- Empty states as in plan.md.
- Playwright tests (TMDB mocked): add, change status, progress, rate, favourite, remove, toggle filter.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

---

### Goal 13 — Shows: Profile + friends

```
/goal Build the Profile view and the friends system of the Shows app on diogomota.com. Read plan.md (App 2 — Shows Tracker: Profile, friendships table) and roadmap.md first.

- First bump the version: `npm version 0.13.0 --no-git-tag-version` in app/ (README.md, Versions), so this goal deploys as v0.13.x.
- Favourites grid from the user's library.
- Stats: titles completed (TV and movies), hours watched (episodes watched x episode runtime + completed movie runtimes).
- Friends: add by username (sends a pending request), incoming requests with accept/decline, remove friend. Only accepted friends see each other's libraries.
- Friend view: their watching/completed/favourites/stats, read-only.
- Wire "Added by Friends" in Discover to accepted friends only.
- Playwright tests with two users: request, accept, view friend library, decline, remove, a non-friend cannot read a library via the API, stats math.

Done when lint, typecheck, build and all e2e tests pass. Commit on main (do not push).
```

---

### Goal 14 — Polish

```
/goal Polish diogomota.com for launch. Read plan.md (General UI/UX Rules, Phase 5) and roadmap.md first.

- First bump the version: `npm version 0.14.0 --no-git-tag-version` in app/ (README.md, Versions), so this goal deploys as v0.14.x.
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

### Goal 15 — Launch checks

Before:
- [x] Goal 3 and First deploy done

```
/goal Prepare diogomota.com operations for launch. Read README.md (Production), docker-compose.prod.yml, infra/ and roadmap.md first. Nothing here connects to the VPS; give me the commands to run.

- First bump the version: `npm version 1.0.0 --no-git-tag-version` in app/ (README.md, Versions), so the launch deploys as v1.0.0.
- docs/operations.md: how to check health and logs, restart, roll back to a previous image tag, restore a backup (step by step, including a dry run into a scratch database), rotate secrets (AUTH_SECRET, DB password, Resend, TMDB, Docker Hub, deploy key), and renew/inspect certificates.
- Optional offsite backup: a script and cron line that copies the latest dump to an external location of my choice (leave the target as a clearly marked variable), with a note on what it costs.
- Verify the backup and restore scripts work locally against the dev compose stack: dump, drop, restore, data is back.
- Check headers on the production config (HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors) and that no secret appears in the repo or the built image (`git grep` and image history).

Done when the local backup/restore round-trip succeeds, docs/operations.md references only files that exist, and the secret scan is clean. Commit on main (do not push).
```

### [You] Launch

- [ ] Push and confirm the deploy is green.
- [ ] On the VPS: run a real backup, then the restore dry run from `docs/operations.md`.
- [ ] Do a full pass on your phone: sign up a second account, Shared with two people, Shows with a friend.
- [ ] Set a calendar reminder to check backups and `docker system df` monthly.
- [ ] Send friends the link.
