# diogomota.com — Plan

The spec of the site and its two apps as built, the decisions behind them, and the full build log. Local setup, commands, the features in detail and the JSON APIs are in [README.md](README.md); running the server is in [docs/operations.md](docs/operations.md).

**Status:** live at https://diogomota.com since `v1.0.0` (commit `3150734`, 2026-11-02). New work gets an entry at the end of the [Build log](#build-log), in the same detail as the ones there, and a new version (README.md, Versions).

## Scale & Usage
- **~10 total users** (friends only)
- **Max ~2 concurrent users** at any time
- Small personal project — infrastructure and resource allocation reflect this

## Hosting, Domain and Configuration
- **VPS:** OVH `vps-51a51d69.vps.ovh.net`, IPv4 `162.19.252.190`, IPv6 `2001:41d0:701:1100::ec4e`, Ubuntu 24.04 LTS. The stack runs in `/opt/diogomota` as `deploy` (SSH key only, in the `docker` group, no `sudo`); `ubuntu` is the admin account (SSH key, passwordless `sudo`). [infra/setup-vps.sh](infra/setup-vps.sh) set it up: SSH keys only and no root login, UFW with only 22, 80 and 443 in, a fail2ban `sshd` jail, unattended security upgrades (reboot at 04:30 when one needs it), a 2 GB swapfile, Docker Engine and the Compose plugin.
- **Domain:** Porkbun, on Porkbun's nameservers. `A` and `AAAA` records for `@` and `www` → the VPS (TTL 600). `https://www`, `http://` and `http://www` redirect (301) to `https://diogomota.com/`.
- **Email:** Resend, domain `diogomota.com` (region EU), DNS records at Porkbun: TXT `resend._domainkey`, CNAMEs `send` and `rsend`, TXT `_dmarc` (`v=DMARC1; p=none;`). Sent from `diogomota.com <no-reply@diogomota.com>`; password reset emails land in the inbox, not spam.
- **TLS:** Let's Encrypt certificate for `diogomota.com` and `www.diogomota.com`, issued through the certbot container (webroot) by [infra/issue-cert.sh](infra/issue-cert.sh) on 2026-11-01 (expiring 2027-01-30 unless renewed); [infra/renew-cert.sh](infra/renew-cert.sh) runs from host cron twice a day.
- **Web server:** nginx container (`nginx:1.30-alpine`): reverse proxy to the app, TLS (Mozilla intermediate profile), gzip, and the security headers: HSTS (2 years, `includeSubDomains`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy`, and a CSP of `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`. An unknown SNI name gets its handshake refused.
- **Code:** GitHub, private repo `diogofrmota/diogomota.com` (this folder is the repo root).
- **Image:** Docker Hub, private repo `diogofrmota/diogomota-com` (Docker Hub names can't contain dots). Tokens: `github-actions` (Read & Write, for CI) and `vps-pull` (Read-only, the VPS's `docker login`).
- **CI/CD:** GitHub Actions → Docker Hub → VPS (see [Deployment Strategy](#deployment-strategy)).
- **Containerized:** Docker Compose; [docker-compose.prod.yml](docker-compose.prod.yml) runs `postgres`, `app`, `nginx` and a one-off `certbot`.
- **Database backup:** `pg_dump` every 3 days by cron, deleted after 2 weeks; an optional offsite copy (see [Backup Strategy](#backup-strategy)).
- **Secrets:** production values only in `/opt/diogomota/.env` on the VPS (template [.env.production.example](.env.production.example), `chmod 600`) and in the GitHub Actions secrets; local ones in `.env` and `app/.env.local`, never committed. Where each one lives and how to rotate it: [docs/operations.md, Rotate secrets](docs/operations.md#rotate-secrets).

## VPS Specs (Recommended Minimum)
Given the small user base (~10 users, max 2 concurrent), minimum specs are more than enough.

| Resource | Minimum | Comfortable |
|---|---|---|
| **CPU** | 1 vCPU | 2 vCPU |
| **RAM** | 2 GB | 4 GB |
| **Storage** | 20 GB SSD | 40 GB SSD |
| **OS** | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| **Bandwidth** | Unmetered / 500 GB+ | Unmetered |

## Stack
| Layer | Tech |
|---|---|
| **Framework** | Next.js 16 (App Router, `output: "standalone"`), React 19, TypeScript |
| **Database** | PostgreSQL 16 (a container on the VPS, data in the `pgdata` volume) |
| **DB Client** | pg (node-postgres) — raw, parameterised SQL; a pool of 5 |
| **Auth** | Auth.js (`next-auth@5.0.0-beta.32`), credentials provider, encrypted JWT session cookie; bcryptjs (cost 12) |
| **Email** | Resend (`resend` package) |
| **Styling** | CSS Modules, CSS variables for the light and dark themes; IBM Plex Mono (self-hosted) on `/` and `/apps`, the system font stack in the apps |
| **Drag & drop** | dnd-kit (`@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10) |
| **Schema** | SQL migrations (`db/migrations/NNN_name.sql`), applied in order on every deploy by `app/scripts/migrate.mjs` |
| **Tests** | Playwright on a desktop and a mobile project, `@axe-core/playwright`; ESLint and `tsc` |
| **Deployment** | Docker Compose (app, PostgreSQL, Nginx, Certbot) |
| **CI/CD** | GitHub Actions → Docker Hub → VPS |
| **External API** | TMDB API (v4 API Read Access Token) |

---

## Authentication Flow

Single shared account across all apps. Auth lives at the `/apps` level.

```
/ (landing — public, no auth)
  → /apps (public: app cards + Login and Sign Up)
    → /login or /signup (username + email + password)
    → /apps (logged in: username + account menu, cards open the apps)
      → /shared or /shows: straight in, no second login
```

- **Logged out:** `/apps` shows the app cards with their descriptions, and Login and Sign Up buttons in the top bar. A card opens a login prompt (`components/site/LoginPrompt.tsx`) whose links carry `?next=/shared` or `?next=/shows`, so logging in lands in that app.
- **Logged in:** the top bar shows the username and the account menu (Account settings, Logout); the cards open the apps.
- **Top bar** (`components/common/AppHeader`, the same on `/apps`, `/account` and in the apps): `diogomota.com` (→ `/`) and the apps, Shared and Shows, on the left (the open app in bold and underlined, neither on `/apps`); the open app's tabs in the middle on desktop; Login and Sign Up or the account menu on the right.
- **Session:** an Auth.js JWT cookie, encrypted with `AUTH_SECRET`, holding the user id, the username and the `password_changed_at` it logged in under. Shared by every app.
- **Sign-up:** open to anyone, no sign-up code (decided). Username 3–20 characters of `[a-z0-9_]`, saved lowercase (the database enforces it too); email; password of at least 10 characters and at most 72 bytes. Signing up logs straight in.
- **Login:** by username or email, in any case. One message for a wrong password or an unknown account, and one for a taken username or email (sign-up can't hide which one exists without email verification).
- **Rate limits** (in memory): login 10 per 15 minutes per IP, sign-up 5 per hour per IP, current-password checks 10 per 15 minutes per user, password reset requests 5 per hour per IP (with a message) and reset emails 3 per hour per address (silently: same answer, nothing sent). The IP is the first `X-Forwarded-For` entry, which nginx overwrites with the client address.
- **Protected routes:** `proxy.ts` (Next 16's name for middleware) guards `/shared`, `/shows` and `/account`, which redirect to `/apps?next=...` (opening that app's login prompt), and `/api/shared/*` and `/api/shows/*`, which answer 401. `next` only accepts same-site paths.
- **Password reset:** "Forgot password?" on `/login` and "Reset by email" in Account settings open `/forgot-password`. The answer is the same whether or not an account has the email; the lookup and the email run after the response (`after()`), so the timing doesn't tell either. The token is 32 random bytes, only its SHA-256 is stored (`password_resets`), valid for 1 hour and single use; a new request invalidates the account's earlier links. The link is built on `AUTH_URL`, never the Host header. `/reset-password` shows "Choose a new password for <username>" (new + confirm, sign-up rules) or "link expired"; setting the password uses up the token in the same SQL statement.
- **Password changes end sessions:** a reset or a change sets `users.password_changed_at`, and `auth.ts` checks it on every session read, so every device is logged out, this one included, and sent to `/login?password=changed` (a change in Account settings returns to `/account` after logging in). Decided: a change in Account settings keeps logging out the current device too.

### Account Settings (`/account`)
From the account menu on `/apps` and in both apps' top bars:
- Change username (unique)
- Change password (current + new + confirm)
- Reset by email (→ `/forgot-password`)
- Theme preference (light/dark), saved in `users.theme_preference`
- Logout

> App settings only contain **app-specific** settings (the space, friends). No account-level settings inside apps.

---

## Pages

### `/` — Landing
- Black background; four white lines of one size, left-aligned in a block centered on the screen (like portfolio-diogomota.com)
- IBM Plex Mono, self-hosted with `next/font/local` and applied by `components/site/SitePage`, not the root layout
- Content:
  - diogo mota
  - devops engineer @ Richemont (link to https://www.richemont.com/, opens in a new tab)
  - currently based in Lisbon, PT
  - A Check Apps button (white, black text, like every button on these pages) → links to `/apps`
- No navbar, no footer — minimal
- Title, description, Open Graph tags and a generated preview image (`app/opengraph-image.tsx`) in the same layout

### `/apps` — App Hub
- IBM Plex Mono and black background, consistent with the landing
- Title `apps (v1.0.0)`: the deployed version, small and grey (`apps (dev)` locally)
- **Top bar:**
  - Logged out: Login and Sign Up buttons
  - Logged in: username + account menu (Account settings, Logout); long usernames are cut off with an ellipsis
- A vertical list of app cards, one per row, from the typed list in `app/lib/apps.ts`:
  - **Shared**: "Create a shared calendar and task list with someone else."
  - **Shows**: "Track the TV shows and movies you watch."
  - Each with its logo (`public/logos/`, 48×48), name and description
  - Logged out: a card opens the login prompt
  - Logged in: a card goes straight into the app, with a small ring turning beside its name until the app has loaded

### Other pages
- `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/account` (see [Authentication Flow](#authentication-flow))
- A styled 404 (`app/not-found.tsx`), and `app/error.tsx` (Retry, Back to Apps) for pages that fail on the server
- Favicon, touch icon, and a web app manifest (`/manifest.webmanifest`, from `app/manifest.ts`): added to a phone's home screen, the site opens on `/apps` without the browser's bars, with the `>_` icon (192 and 512 px, and a maskable 512 px one, in `public/icons/`)

### `/(app_name)` — Individual App Pages
- **Protected** — redirect to `/apps?next=...` when logged out
- Each app is a **SPA** — the URL stays at `/shared` or `/shows` at all times
- Views and panels are React state (`hooks/useAppView.ts`); each change is a `history.pushState` entry and `popstate` restores it, so Back closes the open panel, then goes back through the views and finally out to `/apps`; a reload starts on the default view
- One shell, `components/common/AppShell`: the sticky top bar (`diogomota.com` and the apps on the left, the app's tabs centered in it as `HeaderTabs` at 768 px and wider, actions such as Shows' search and the account menu on the right), the tabs as `BottomNav` on narrower screens (fixed to the bottom, clear of the home indicator), and the current view across the whole width. The app's settings are a view opened from the account menu (`<App> Settings`), not a tab. Views switched away from stay mounted but hidden (React `<Activity>`)

---

## General UI/UX Rules (All Apps)
- **Design:** Minimalistic, modern, clean
- **Typography:** the system font stack inside apps. IBM Plex Mono is **only** for `/` and `/apps`
- **Theme:** Light mode + Dark mode, saved per user (`users.theme_preference`) and rendered by the server, so there is no flash on load; chosen in Account settings (and in an app's settings where it has no settings of its own, i.e. Shows); no toggle in the top bar; `<meta name="theme-color">` follows it; a failed save switches back
- **Responsive:** Mobile-first — primarily used on mobile, must work well on desktop too. Nothing scrolls sideways at 1280×800, 390×844 or 375×812; on a phone, controls are at least 44×44 px, text fields have 16 px text (so iOS doesn't zoom), and the bottom bar, sheets and the undo message stay clear of the home indicator
- **Navigation:** Bottom tab bar (mobile) / tabs in the middle of the top bar (desktop) within each app
- **Between apps:** Shared and Shows in every top bar, and `diogomota.com` back to `/` (the only way out when opened from the home screen)
- **Account access:** the same account menu in the apps' top bar as on `/apps`
- **Dialogs:** one `components/common/Dialog`: modal on desktop, a sheet from the bottom or the whole screen on a phone; closed by Escape, Back, a tap outside or its × button, which hands focus back to what opened it; the page behind doesn't scroll
- **Loading and errors:** grey skeletons in Shows, a spinner in Shared; a load that fails says why ("Could not reach the server. Check your connection." when offline) with Retry. Every browser API call goes through `lib/api-request.ts`
- **Changes:** shown at once (optimistic), sent one at a time in the order they were made, and undone with a message if the server refuses one
- **Accessibility:** axe finds nothing serious or critical, in the light and the dark theme; color is never the only label; drag-and-drop moves are announced to screen readers

---

## Apps

### App 1 — Shared (`/shared`)

A private space for a small group (e.g. couple, roommates) to share a calendar and task lists.

#### Core Concept — Spaces
- On first visit, user sees: **"Create a Space"** or **"Join with Code"**
- **One space per user** — once in a space, visiting `/shared` always opens its Calendar
- Up to **10 members**, each with a distinct named color from a 10-color palette (Blue, Rose, Green, Gold, Cyan, Purple, Silver, Orange, Teal, Ochre), always shown with its name
- **Owner:** whoever created the space; when the owner leaves, ownership passes to the member who joined earliest. Only the owner renames the space and creates invites
- **Invite system:**
  - The owner clicks "Invite" → a **single-use code**, with a copy button and its expiry
  - Code expires after **24 hours**, and outstanding codes expire when ownership changes
  - Invited user enters the code to join; joining is limited to 20 attempts per 15 minutes per user
- User can **leave a space** (from Settings), which frees them to join/create another; the last member leaving deletes the space and its data
- A member who leaves loses their task assignments; their events stay, labeled Former member, until reassigned; they can't open the space any more
- Every API call checks current membership in the database, inside the same transaction as the read or write; another space's data answers 404

#### SPA Views (bottom tab bar on mobile / top bar tabs on desktop)

**1. Calendar**
- Custom month, week and day views (no FullCalendar), in the app's light and dark themes; week view scrolls sideways on narrow screens; click a date to open its day
- Add event (Add event button):
  - Title, start and end date and time (an event can span dates), optional notes
  - **Assignee:** one member, or the **group** (applies to all members)
  - Member-colored events; group events neutral, with a **Group** badge; a color legend
- Click an event to view, edit or delete it (a modal on desktop, a bottom sheet on a phone); every member can manage every event
- Times are entered and shown in `Europe/Lisbon` whatever the device's zone, stored as UTC `timestamptz`; nonexistent spring-forward times are rejected, and repeated autumn times offer the first or second occurrence
- One toolbar over the grid (‹ Today ›, the period, the color legend, Month | Week | Day, Add event), so the grid gets the rest of the screen; no time zone line
- **Export:** per event, from its dialog: Export to Google Calendar and a `.ics` download; no whole-calendar export. UTC timestamps, escaped text, CRLF and UTF-8 line folding per RFC 5545

**2. Tasks**
- Any number of lists per space, as chips above the open list; the last list opened is remembered on the device
- Edit lists (or + New list) creates, renames, reorders and deletes lists; deleting asks first and takes the list's tasks with it
- Each list has ordered tasks:
  - Task title
  - Optional: due date (a plain date, shown as Today, Tomorrow or Overdue against today in Lisbon) and notes
  - **Assignee:** a member, shown with their color and name, or unassigned
  - Checkbox to mark complete: done tasks go to a collapsed **Done** section, and unticking one puts it back at the end of the list
  - **Drag & drop** by a handle to reorder tasks (and, in Edit lists, lists): with a mouse, a finger (the rest of the row still scrolls the page) or the keyboard (Space or Enter to pick up, the arrows, Space or Enter to drop, Escape to cancel)
- Delete: a bin button where there is a mouse, a swipe left on a touch screen, or from the task's dialog; **Undo** for 5 seconds (paused while the pointer or focus is on it), and the delete is only sent once that runs out or when leaving Tasks or the page
- Clients choose the UUIDs of what they create; when someone else changed the list meanwhile (404 or 409), Tasks reloads. It also reloads when opened and when the tab becomes visible, to show other members' changes
- Empty states for no lists, an empty list and a list with everything done

**3. Settings**
- Space name (the owner can rename it)
- Members list, with role (owner / member) and color
- **Invite people** — a single-use code (24 h expiry), with copy
- **Leave space**

#### UI/UX Details
- **First-time flow:** Click Shared → "Create a Space" or "Join with Code" screen
- **Returning user:** Click Shared → auto-loads their space's Calendar (default view)
- **Navigation:** Calendar | Tasks (bottom tab bar mobile, top bar desktop); Shared Settings from the account menu
- **Color palette:** each member's color marks their events and tasks
- **Empty states:** friendly messages when there are no events or tasks yet

---

### App 2 — Shows Tracker (`/shows`)

Minimalistic personal tracker for TV shows and movies.

#### TMDB Integration
- All media data (title, poster, overview, runtime, seasons, episodes, rating) comes from the TMDB API, through `lib/tmdb.ts` (server-only): `TMDB_READ_TOKEN` as a Bearer token, an 8 s timeout, and every field of TMDB's answers checked. The browser only calls `/api/shows` and loads posters from `image.tmdb.org`, in TMDB's sizes from `w92` to `w780`
- Top rated and popular lists stay in memory for 10 minutes, searches for 5
- Opening a title or adding it to a library upserts it into the `shows` table: title, year, poster path, overview, movie runtime, typical episode runtime (the latest episode's when TMDB has none), episode count of each regular season (no specials) and TMDB's rating
- **Data freshness:** a copy older than **7 days** is fetched again the next time it is opened or added (kept as it is if TMDB can't be reached), and loading the library refreshes its titles older than 7 days after answering, one at a time, stopping at the first failure
- TMDB's terms: their logo and notice at the bottom of Discover and of the search panel, and caching for at most 6 months (met by the refresh)
- The `/api/shows` API allows 120 requests a minute per user

#### SPA Views (bottom tab bar on mobile / top bar tabs on desktop)

**1. Home**
- **Toggle at top:** TV Shows | Movies (filters all sections below; the same switch as Discover's)
- **Sections (vertical scroll):**
  - **Watching** — currently watching, shows progress (e.g. S2 E5, or Not started)
  - **Planned** — want to watch list
  - **Completed** — finished, with optional rating (stars)
  - Each lists the titles changed most recently first, 12 until Show all, with a count
- Each card: poster, title, year, status badge, a heart for a favourite
- Click card → detail panel:
  - Overview, seasons/episodes (TV), runtime (movies)
  - Favourite
  - Status: Watching | Planned | Completed
  - Progress of a TV show being watched: a season and an episode picker, and Next episode (on to the next season after a season's last episode); reaching the last episode offers Mark as completed (or Not yet). Progress is the last episode watched and is kept when the status changes
  - Your rating: 1–5 stars (the same star again, or Clear, removes it)
  - Remove from library: asks first, then offers to add it again
- **Quick actions** (status and rating): the ⋯ button on a card where there is a mouse (shown on hover or focus), a right click, or a half-second long press on a touch screen; a small menu beside the card on desktop, a sheet from the bottom on a phone
- One library state (`components/shows/library.tsx`) serves Home, Discover, search and the panels; it loads with the app and again whenever the page becomes visible; a 404 or 409 (e.g. a title removed in another tab) reloads it

**2. Discover (TV Shows / Movies)**
- A TV Shows | Movies switch over identical layouts
- **Sections:**
  - **Top Rated** — page 1 of TMDB's list, 12 until Show all 20
  - **Popular** — the same
  - **Added by Friends** — titles in accepted friends' libraries (any status), the ones most friends have first
- Each card: poster, title, year, TMDB's average rating
- Grey skeleton posters while loading; a failed section shows a message with Retry
- Click card → detail panel (a bottom sheet on a phone) with "Add to Library" as Watching or Planned
- Search field at the top of Discover

**3. Profile**
- **Friend requests** received, with Accept and Decline (only when there are any)
- **Stats** — hours watched (each TV show's episodes watched × its episode runtime, plus each completed movie's runtime, to one decimal), with the episodes and movies counted, and the TV shows and movies completed. A show being watched counts up to its current episode, a completed one all its episodes, a planned one none; a movie counts once completed. The browser and the server use the same function (`libraryStats` in `lib/show-types.ts`), so your own stats follow every change at once
- **Favourite Shows/Movies** — the titles marked Favourite, TV shows and movies together, latest change first, 12 until Show all, with Home's quick actions
- **Friends List:**
  - **Add friend** — by username, in any case, with or without an `@`; limited to 20 requests per 15 minutes per user (each answer tells whether a username exists)
  - Your friends, and the requests you sent (Pending, with Cancel); removing a friend asks first
  - Click friend → their profile (the whole screen on a phone), read-only: stats, Watching, Completed and Favourites. Planned titles that aren't favourites are left out, of the API answer too. A card opens the title's panel for your own library, so you can add it
  - Only accepted friends see each other's libraries; anyone else gets 404
- Friendships: one row per pair, pending until accepted; declining, cancelling and removing delete it, so either can ask again; asking someone who already asked you accepts their request (one statement, so two people asking each other at once become friends)

#### UI/UX Details
- **First-time flow:** Click Shows → Home (empty state: "Start by discovering shows!", with Go to Discover and Search)
- **Poster-heavy design** — visual grid of posters, Netflix/Letterboxd-inspired
- **Quick actions:** ⋯ button, right click or long press on a card to change status or rate
- **Search:** a search button in the top bar of every Shows view opens the search panel (the whole screen on a phone): TV shows and movies together, 300 ms after typing stops
- **Loading states:** Skeleton loaders for TMDB API calls
- **Empty states:** friendly messages per section, with a link to Discover

---

## Database Schema

As in `db/migrations/` (`001_initial.sql` to `006_library_updated_at.sql`). Ids are `uuid` (`gen_random_uuid()`); usernames and emails are `citext`, so case doesn't matter.

### Single shared `users` table (across all apps)
| Table | Key Fields |
|---|---|
| `users` | id, username (unique, `^[a-z0-9_]{3,20}$`), email (unique), password_hash, space_id (nullable), space_color (`#rrggbb`, unique within a space), space_joined_at, theme_preference (light/dark, default dark), password_changed_at, created_at |

### Shared App tables
| Table | Key Fields |
|---|---|
| `spaces` | id, name, created_by (the owner), created_at |
| `invites` | id, space_id, code (unique), expires_at, used |
| `events` | id, space_id, title, notes, starts_at, ends_at (UTC `timestamptz`, end ≥ start), is_group |
| `event_assignees` | event_id, user_id |
| `task_lists` | id, space_id, name, position |
| `tasks` | id, list_id, title, notes, due_date (`date`), assignee_id (nullable), is_complete, position |

### Shows Tracker tables
| Table | Key Fields |
|---|---|
| `shows` | id, tmdb_id, type (tv/movie; unique together with tmdb_id), title, poster_url (TMDB's path, e.g. `/abc.jpg`), year, overview, runtime (movie), episode_runtime (TV), episodes_per_season (`integer[]`), vote_average (0–10), last_updated |
| `user_shows` | id, user_id, show_id, status (watching/planned/completed), rating (1–5), current_season, current_episode, is_favourite, updated_at |
| `friendships` | id, user_id (sent the request), friend_id, status (pending/accepted), created_at; one row per pair |

### Auth tables
| Table | Key Fields |
|---|---|
| `password_resets` | id, user_id, token_hash (SHA-256 of the emailed token), expires_at, used |

### Migrations
| File | What it does |
|---|---|
| `001_initial.sql` | the full schema above, minus the later columns |
| `002_username_format.sql` | the database enforces the username rule |
| `003_password_changed_at.sql` | `users.password_changed_at`, for ending sessions on a password change |
| `004_space_membership.sql` | `users.space_joined_at`, unique member colors within a space |
| `005_show_rating.sql` | `shows.vote_average` |
| `006_library_updated_at.sql` | `user_shows.updated_at`, for the latest-change-first order |

`schema_migrations` records the applied files. Never edit a migration that has been applied; add the next `NNN_name.sql`.

---

## Backup Strategy
- **`pg_dump` every 3 days** via cron on the VPS, as `deploy`: [infra/backup.sh](infra/backup.sh) at 03:00 (UTC)
- Plain SQL without owners or grants, gzipped and tested, in `/opt/diogomota/backups/` as `diogomota_YYYYMMDD-HHMMSS.sql.gz`
- Retain backups for **2 weeks**: dumps older than 14 days are deleted, only after a successful dump

```bash
# infra/crontab (installed with: crontab /opt/diogomota/infra/crontab)
17 3,15 * * * bash /opt/diogomota/infra/renew-cert.sh >> /opt/diogomota/logs/renew-cert.log 2>&1
0 3 */3 * * bash /opt/diogomota/infra/backup.sh >> /opt/diogomota/logs/backup.log 2>&1
#30 3 */3 * * bash /opt/diogomota/infra/offsite-backup.sh >> /opt/diogomota/logs/offsite-backup.log 2>&1
```

- **Restore:** [infra/restore.sh](infra/restore.sh) `--dry-run` first: it loads the dump into a scratch database, prints its rows per table beside the live database's, and drops it again. A real restore dumps the current database first, loads the dump into a scratch database, stops the app, swaps the databases in one transaction, applies pending migrations and starts the app; it also works when the database was dropped
- **Offsite (optional, not set up yet):** [infra/offsite-backup.sh](infra/offsite-backup.sh) copies the newest dump to an rclone remote (encrypted with a crypt remote), keeps offsite copies 90 days, and its cron line is commented out until `OFFSITE_DEST` is set. At these sizes it fits Backblaze B2's or Cloudflare R2's free 10 GB
- Steps, checks and costs: [docs/operations.md](docs/operations.md#backups)

---

## Deployment Strategy
```
Developer pushes to GitHub (main branch)
  → GitHub Actions, Deploy workflow (one run at a time, never cancelled midway):
    1. check: npm ci, lint, typecheck and build in app/ (ci.yml, which also runs on every pull request)
    2. image: build the Docker image, push it to Docker Hub (private repo) as
       diogofrmota/diogomota-com:<short SHA>, :vX.Y.Z and :latest; tag the commit vX.Y.Z
    3. deploy: SSH into the VPS as deploy, copy docker-compose.prod.yml, nginx/, infra/
       and db/migrations/ to /opt/diogomota, then run infra/deploy.sh <short SHA>:
       pull the image, apply pending migrations, pin IMAGE_TAG in .env,
       docker compose up -d app nginx (a few seconds of 502s), reload nginx,
       delete old app images (keeping the deployed one and the two newest others)
    4. wait up to 60 s for https://diogomota.com/api/health to return 200;
       otherwise the run fails and prints the app's logs
```

- **Trigger:** push to `main` branch only
- **Versions:** `app/package.json` holds `X.Y.0`, bumped by hand (one minor per finished goal, `1.0.0` at launch); the image job sets the patch to one more than the newest `vX.Y.*` git tag, and a version other than `X.Y.0` fails it. The tag is only added once the image is on Docker Hub, so a failed build doesn't use up a number
- **Rollback:** GitHub → Actions → Deploy → Run workflow on `main` with `image_tag` set to an older short SHA: it skips check and image and deploys that image with the current `main`'s stack files. Migrations only go forward, so the older image runs on the current schema. It holds until the next push or a run with an empty `image_tag`. Without GitHub: `bash /opt/diogomota/infra/deploy.sh <tag>` on the VPS
- **Repository secrets:** `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (Read & Write), `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (the deploy-only key `C:\Users\diogo\.ssh\diogomota_deploy`, comment `github-actions`, in `/home/deploy/.ssh/authorized_keys`), `VPS_KNOWN_HOSTS` (`ssh-keyscan 162.19.252.190`)
- The deploy never touches `.env` (apart from `IMAGE_TAG`), `backups/` or `logs/` on the VPS; a changed `infra/crontab` is copied but not installed

---

## Operations
[docs/operations.md](docs/operations.md) is the runbook: health and logs, restarts, rolling back, backups and restoring (dry run, undo, onto a new VPS), the offsite backup, rotating every secret, certificates, and a monthly check (calendar reminder set).

### Known limits and decisions
- Rate limits are kept in the app's memory, so a restart or deploy resets them
- The CSP only covers framing, `base-uri` and plugins: a script policy for Next.js needs per-request nonces, which belongs in the app
- Sign-up tells whether a username or email is taken (no email verification)
- A new `AUTH_SECRET` logs everyone out: next-auth only reads `AUTH_SECRET`, so there is no overlap period
- Migrations only go forward; a rollback runs the older image on the current schema
- Until the offsite backup is set up, the dumps are only on the VPS's own disk

---

## Project Structure
```
diogomota.com/                            # repo root (this folder)
├── plan.md                               # this file: spec, decisions, build log
├── README.md                             # setup, commands, features and APIs, production
├── docs/
│   └── operations.md                     # runbook for the VPS
├── .github/
│   └── workflows/
│       ├── ci.yml                        # lint, typecheck, build (pull requests, and before every deploy)
│       └── deploy.yml                    # push to main: check → image → deploy; Run workflow rolls back
├── docker-compose.yml                    # local dev (PostgreSQL on 127.0.0.1:5432)
├── docker-compose.prod.yml               # VPS (app, PostgreSQL, Nginx, Certbot)
├── .env.example                          # template for the local .env and app/.env.local
├── .env.production.example               # template for the VPS .env
├── infra/
│   ├── setup-vps.sh                      # one-time server bootstrap
│   ├── deploy.sh                         # run by the Deploy workflow (or by hand to roll back)
│   ├── issue-cert.sh                     # first Let's Encrypt certificate
│   ├── renew-cert.sh                     # renewal (cron), then nginx reload
│   ├── backup.sh                         # pg_dump (cron)
│   ├── restore.sh                        # restore a dump, --dry-run first
│   ├── offsite-backup.sh                 # optional offsite copy (rclone)
│   └── crontab                           # deploy's crontab
├── nginx/
│   ├── nginx.conf                        # HTTPS, reverse proxy, security headers
│   ├── bootstrap.conf                    # HTTP only, until the first certificate exists
│   └── start.sh                          # picks one of the two on every start
├── db/
│   └── migrations/                       # 001_initial.sql = full schema, later changes as 002_..., 003_...
└── app/                                  # Next.js
    ├── Dockerfile                        # standalone server + migration runner
    ├── auth.ts                           # Auth.js config
    ├── proxy.ts                          # route guard (Next 16's middleware)
    ├── playwright.config.ts
    ├── scripts/migrate.mjs               # applies db/migrations
    ├── app/
    │   ├── page.tsx                      # landing (/), with opengraph-image.tsx
    │   ├── apps/                         # app hub (/apps)
    │   ├── login/ signup/ forgot-password/ reset-password/ account/
    │   ├── shared/page.tsx               # Shared SPA (protected)
    │   ├── shows/page.tsx                # Shows Tracker SPA (protected)
    │   ├── manifest.ts icon.svg apple-icon.png favicon.ico error.tsx not-found.tsx
    │   ├── fonts/                        # IBM Plex Mono
    │   ├── test/                         # test-only pages (404 in production)
    │   └── api/
    │       ├── auth/[...nextauth]/       # Auth.js endpoints
    │       ├── health/                   # /api/health
    │       ├── shared/                   # spaces/, events/, tasks/
    │       ├── shows/                    # discover/, titles/, library/, friends/
    │       └── test/                     # outbox/, tmdb/ (test hooks only)
    ├── components/
    │   ├── site/                         # SitePage, TopBar, AppList, LoginPrompt, Form, MessagePage
    │   ├── auth/                         # AuthPage, LoginForm, SignUpForm, ForgotPasswordForm, ResetPasswordForm
    │   ├── account/                      # AccountMenu, AccountSettings
    │   ├── common/                       # AppShell, AppHeader, HeaderTabs, BottomNav, Dialog, Spinner, icons
    │   ├── shared/                       # SharedApp, SpaceWelcome, SpaceSettings, Calendar, EventDialog,
    │   │                                 # Tasks, TaskItem, TaskDialogs, Sortable, useTasks
    │   └── shows/                        # ShowsApp, Home, Discover, Profile, Stats, TitleGrid, LibraryGrid,
    │                                     # TitleDialog, SearchDialog, QuickActions, FriendDialog, library
    ├── lib/                              # db, tmdb (and tmdb-mock), email, password, password-reset,
    │                                     # rate-limit, users, spaces, events, calendar, tasks, shows,
    │                                     # friends, show-types, api-request, apps, test-hooks, ...
    ├── hooks/                            # useAppView (views, panels, Back), useTheme
    ├── e2e/                              # Playwright specs, checks.ts, fixtures, teardown
    └── public/
        ├── logos/                        # shared.svg, shows.svg, tmdb.svg
        └── icons/                        # home screen icons (192, 512, maskable 512)

Not in the repo: .env and app/.env.local (gitignored), and backups/ and logs/ in /opt/diogomota on the VPS.
```

---

## Build order

The order planned before building, all done. Each step lists where it happened in the [Build log](#build-log).

| # | Step | Done in |
|---|---|---|
| | **Phase 0 — Accounts** | |
| 1 | **GitHub** — own git repo for this folder + private GitHub repo | Git repo, `main` pushed |
| 2 | **Docker Hub** — private repo + access tokens (read/write for GitHub Actions, read-only for the VPS) | Docker Hub repo and tokens; made private 2026-11-02 |
| 3 | **OVH** — order and pay for the VPS (Ubuntu 24.04, SSH key) | OVH VPS, SSH key for `ubuntu` |
| 4 | **Porkbun** — remove parking records, point `diogomota.com` and `www` A records to VPS IP | Porkbun records (`A` and `AAAA`) |
| 5 | **Resend** — verify `diogomota.com` (DNS records in Porkbun), create API key | Resend account, domain, DNS, API key |
| 6 | **TMDB** — register for an API key at themoviedb.org | TMDB read token |
| | **Phase 1 — Infrastructure** | |
| 7 | **VPS** — OS setup, firewall (UFW), SSH hardening, fail2ban | Goal 2, Prepare the VPS |
| 8 | **Docker** — install Docker + Compose on VPS | Goal 2, Prepare the VPS |
| 9 | **Nginx** — Nginx + Certbot containers: reverse proxy + SSL via Let's Encrypt, renewal via host cron | Goal 2, Prepare the VPS |
| 10 | **PostgreSQL** — Docker container + migrations (`db/migrations`, runner applied on every deploy) | Goal 1, Goal 2, First deploy |
| 11 | **Backups** — `pg_dump` cron job every 3 days, deleted after 2 weeks | Goal 2, Prepare the VPS; Goal 15 |
| 12 | **CI/CD** — GitHub Actions pipeline (build → push to Docker Hub → deploy to VPS) | Goal 3, First deploy, Versions |
| | **Phase 2 — Auth + Portfolio** | |
| 13 | **NextAuth** — setup at `/apps` level (credentials-based, signup with username + email + password) | Goal 5 |
| 14 | **Password reset** — forgot password flow via email with Resend (reset token, expiry) | Goal 6 |
| 15 | **Account settings** — username, password, theme preference (accessible from `/apps` top bar) | Goal 5 |
| 16 | **Landing page** — build `/` (black page, centered text, IBMPlexMono) | Goal 4 |
| 17 | **Apps hub** — build `/apps` (logged-out/logged-in states, app cards, account dropdown) | Goals 4 and 5 |
| 18 | **Protected routes** — `/shared` and `/shows` redirect to `/apps` if not authenticated | Goal 5 |
| | **Phase 3 — Shared App** | |
| 19 | **Space system** — create space, join with code, invite flow (24h expiry) | Goal 8 |
| 20 | **Calendar** — month/week/day views, add/edit/delete events, assignees, export .ics | Goal 9 |
| 21 | **Tasks** — lists, drag & drop reorder, assignees, complete/delete | Goal 10 |
| 22 | **Settings** — space management, members, invite, leave | Goal 8 |
| | **Phase 4 — Shows Tracker** | |
| 23 | **TMDB integration** — API client, search, top rated, popular, data caching + 7-day refresh | Goals 11 and 12 |
| 24 | **Home** — library view (watching/planned/completed), TV/movie toggle | Goal 12 |
| 25 | **Discover** — browse TMDB, "added by friends" section | Goals 11 and 13 |
| 26 | **Profile** — favourites, stats (total watched, hours watched), friends list, add friend, view friend library | Goal 13 |
| | **Phase 5 — Polish** | |
| 27 | **Light/dark mode** — system-wide toggle, persist per user in DB | Goals 5 and 7 |
| 28 | **Mobile responsive** — test and optimize all views (mobile-first priority) | Goal 14, phone checks |
| 29 | **Empty states & loading** — skeleton loaders, friendly empty messages | Goals 11–14 |
| 30 | **Back button support** — `history.pushState` within SPAs | Goal 7 |
| 31 | **Testing** — end-to-end on live domain | Phone checks, Launch |
| 32 | **Deploy** — push to main → GitHub Actions → live | First deploy, every "live" entry, Launch |

---

## Build log

Everything done, in the order it happened (moved here from the former `roadmap.md`).

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

- Goal 11, Shows: TMDB + Discover (2026-11-02): version `0.11.0`. `lib/tmdb.ts` (server-only): Bearer `TMDB_READ_TOKEN`, 8 s timeout, typed responses checked field by field, `tmdbImageUrl` (TMDB's closest size, `w92` to `w780`); top rated and popular kept in memory 10 minutes, searches 5. Opening or adding a title upserts it into `shows` (seasons without specials, episode runtime with the latest episode's as fallback, movie runtime, TMDB rating in the new `vote_average` from `005_show_rating.sql`), fetched again once older than 7 days, the old copy kept if TMDB fails. Discover: TV Shows | Movies switch over Top Rated, Popular and Added by Friends (accepted friends' libraries, most shared first; empty state until there are friends), poster grids of 12 with Show all 20, skeleton posters while loading, errors with Retry, TMDB logo (their file) and notice at the bottom. Search: a button in the top bar of every Shows view (AppShell gained an `actions` slot and dialogs as children) and a field at the top of Discover open a search panel (full screen on phones) searching TV shows and movies together, 300 ms after typing stops. Detail panel (bottom sheet on phones, Back/Escape close it, stacks over search): overview, seasons and episodes or runtime, Add to Library as Watching or Planned. API: `/api/shows/discover/...`, `/api/shows/titles/:type/:id`, `POST /api/shows/library`; 120 requests a minute per user. Tests use an in-process fake TMDB (`lib/tmdb-mock.ts`, test hooks only, `/api/test/tmdb` logs its requests) and fake poster images in the browser, so nothing reaches TMDB. Playwright: 97 tests (7 new in `shows-discover.spec.ts`: Discover sections and skeletons, search from every view with debounce, errors and Retry, phone detail sheet and add to library with the rows checked, phone search panel, API validation and 401s, the 7-day refresh and memory caches, Added by Friends with accepted vs pending friends). Lint, typecheck, production build and all e2e tests pass (`09a30c1`, pushed).

- Goal 12, Shows: Home (2026-11-02): version `0.12.0`. Home is the library: TV Shows | Movies switch (shared with Discover) over Watching, Planned and Completed, each with the latest change first (12 until Show all) and a count; empty library shows "Start by discovering shows!" (Go to Discover, Search), empty sections link to Discover. Cards: poster, status badge, heart for favourites, title, year, `S2 E5`/Not started for TV being watched, stars for rated completed titles. Quick actions (status and rating) from a ⋯ button shown on hover/focus with a mouse, a right click, or a half-second long press on touch (menu beside the card on desktop, bottom sheet on phones; Back/Escape close it; the finger lifting doesn't close it). Detail panel: Favourite, status, progress (season and episode pickers, Next episode across seasons), 1–5 stars (same star or Clear removes), Remove from library (asks first, then offers to add again); reaching the last episode offers Mark as completed / Not yet. One library state (`components/shows/library.tsx`) for Home, Discover, search and the panels, with optimistic changes sent in order and undone with a message if refused (Tasks' model). API: `GET /api/shows/library`, `PATCH`/`DELETE /api/shows/library/{type}/{tmdbId}` (validated: statuses, 1–5, booleans, episodes the cached show has, no progress for movies; 404 outside your library). `006_library_updated_at.sql` adds `user_shows.updated_at`. Loading the library refreshes titles older than 7 days from TMDB after answering (`after()`), as Goal 11 left to do. Shows e2e helpers moved to `e2e/shows.ts`. Playwright: 103 tests (6 new in `shows-home.spec.ts`: welcome, add from Discover and the switch; detail panel status, progress, last-episode offer, rating, favourite, remove; quick actions with ⋯, right click and a refused change undone; phone long press and bottom sheets; API validation and ownership; the stale-title refresh). Lint, typecheck, production build and all e2e tests pass (`9af0ff3`, pushed).

- Goal 13, Shows: Profile + friends (2026-11-02): version `0.13.0`. Profile: friend requests received with Accept/Decline at the top (only when there are any), Stats, Favourites (TV and movies together, latest change first, Home's quick actions), Friends (add by username in any case, with or without `@`; friends list; sent requests with Cancel; Remove asks first). Messages in the section acted in, focus moved to them when the button left with its row. Stats: hours watched (episodes watched × episode runtime + completed movies' runtimes, one decimal) with the episode and movie counts, TV shows and movies completed; a show being watched counts up to its current episode, a completed one in full, a planned one none; `libraryStats` in `lib/show-types.ts` serves the browser (own stats follow every change at once, from library items that now carry their runtimes) and the server (a friend's). Friend profile: a panel (full screen on phones, Back closes it), read-only stats, Watching, Completed and Favourites (planned non-favourites left out, of the API too, no entry ids); cards open the title panel on top for your own library. Friendships in the existing `friendships` table (no migration): pending until accepted, decline/cancel/remove delete the row, asking someone who asked you accepts in one `INSERT … ON CONFLICT` statement. API `/api/shows/friends` (`GET`, `POST {username}`, `POST /{id}/accept|decline|cancel`, `DELETE /{id}`, `GET /{id}` for a friend's profile, 404 for anyone else); friend requests limited to 20 per 15 minutes per user. Added by Friends loads again after Profile sees the friends change. `PlaceholderView` removed (Profile was the last one). Playwright: 108 tests (5 new in `shows-profile.spec.ts`: stats math and favourites; request, accept, friend library and remove with two people; decline, cancel, a withdrawn request, asking each other; the API refusing non-friends, every check and the rate limit; phone layout); the Added by Friends test now makes friendships through the API. Lint, typecheck, production build and all e2e tests pass (`80b9b93`, pushed).

- Goals 11–13 live (2026-11-02): pushed; deployed as `v0.11.0` (`09a30c1`, with `005_show_rating.sql`), `v0.12.0` (`c0703f4`, with `006_library_updated_at.sql`) and `v0.13.0` (`80b9b93`). On https://diogomota.com: `/api/health` ok, `/apps` shows `v0.13.0`; logged out, `/shows` redirects to `/apps?next=%2Fshows` and `/api/shows/friends` returns 401

- Phone checks, Shows (2026-11-02), on https://diogomota.com: Discover (TV Shows and Movies, search from Home and Profile, add a title as Watching); Home (welcome on an empty library, long-press quick actions for status and rating, Next episode, last episode then Mark as completed, favourite, remove, Movies); Profile with a second account (friend request by username, accept, each other's profiles and Back, Added by Friends, remove the friend)

- Goal 14, Polish (2026-11-02): version `0.14.0`. Playwright runs every test on two projects, `desktop` (Chrome, 1280x800) and `mobile` (an iPhone 13's 390x844 touch screen in Chromium); the few tests about a mouse or touch follow the device (the bin button or the task dialog, the ⋯ button or the keyboard), and the mouse-anchored quick actions menu test skips the phone. New `e2e/views.spec.ts` walks through every page and every view and dialog of both apps (empty, filled, failed to load), closes each with Back, and checks each (`e2e/checks.ts`): no sideways scrolling; on the phone at 390x844 and 375x812, tap targets of 44 px, 16 px text fields and the bottom bar, sheets and toast clear of an emulated home indicator (CDP safe-area insets); `@axe-core/playwright` in both themes with no serious or critical findings. Fixed what they found: calendar day buttons and poster cards whose labels didn't contain their visible text (cards now keep only the poster and title in the button, which covers the facts beside it), an `aria-label` on role-less divs (calendar view switcher and legend), the Next episode button's faded text, 44 px for the `×`, `‹ ›`, Done toggle, short usernames' account button and the auth pages' links. Both apps' dialogs are one `components/common/Dialog` (Shared's now close with a tap outside too, and a new event starts in its title). Browser API calls go through `lib/api-request.ts`: Shared said "Failed to fetch" or a JSON error when offline, now "Could not reach the server. Check your connection." with Retry, also on Settings (was "Reopen Settings"); spinners for Shared's loads; the quick actions menu shows a library load error with Retry; `app/error.tsx` (Retry, Back to Apps) for pages that fail on the server, tested through `/test/error` (test hooks only); a spinner on an /apps card until its app loads (`useLinkStatus`). Hover styles only where there is hover in Shared. Web app manifest (`app/manifest.ts`, opens `/apps` standalone) with 192/512 and maskable icons in `public/icons/`, and the iPhone home screen title. Leftover "placeholder" comments updated (no dead code, unused dependencies or placeholder pages found). README: Phones, loading, errors and accessibility. Playwright: 114 tests (6 new), 228 runs: 227 pass, 1 skipped. Lint, typecheck, production build and the e2e suite pass (`0aa075f`, pushed).

- Goal 14 live (2026-11-02): pushed; deployed as `v0.14.0` (`0aa075f`, no migration). On https://diogomota.com: `/api/health` ok, `/apps` shows `v0.14.0`

- Phone checks, polish (2026-11-02), on https://diogomota.com: Add to Home Screen from `/apps` (`>_` icon and its name, opens without browser bars on `/apps`), dialogs in both apps close with their × and with a tap outside; in airplane mode every Shared and Shows view says it can't reach the server and offers Retry, which works once back online

- Goal 15, Launch checks (2026-11-02): version `1.0.0`, so the next deploy is `v1.0.0`. `docs/operations.md` (linked from README, Production): health and logs, restarts, rollback to an image tag, backups, restore step by step (dry run, inspecting a dump by hand, undo, onto a new VPS), the optional offsite backup with costs, rotating `AUTH_SECRET`, the database password, Resend, TMDB, both Docker Hub tokens and the deploy key, certificates, a monthly check. `infra/restore.sh --dry-run` loads a dump into `<db>_dryrun`, prints its rows per table beside the live database's and drops it again; a restore now also works when the database was dropped. Optional `infra/offsite-backup.sh`: the newest dump to an rclone remote (the `rclone/rclone:1.75.2` image), target `OFFSITE_DEST` at the top (refuses to run while `CHANGE-ME`), offsite copies kept 90 days, an error and no pruning when the newest dump is over 4 days old; a commented-out cron line at 03:30 in `infra/crontab`. Checked locally: on the dev stack, rows in every table, dump, dry run, then rows deleted and a table dropped → restore, and the whole database dropped → restore: every table's rows (md5) and the schema identical each time; a truncated or failing dump refused with the live data untouched; the dev data put back as it was. On a local copy of the production stack (own project name, self-signed certificate): a restore with the app running (stopped, swapped, migrated, started), an older dump getting `006` applied again, the database password and `AUTH_SECRET` procedures from the doc; headers on every kind of response (pages, API, 401, 404, static assets, nginx's error page, redirects): HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy` and a CSP with `frame-ancestors 'none'` once each, no `X-Powered-By` or nginx version. The offsite script against an encrypted crypt remote. Secret scan clean: none of the local secret values in the working tree, any commit (all refs) or commit message, or the image's history, config or any of its 10 layers; no key- or token-shaped strings. shellcheck clean (committed on main, not pushed)

- Launch (2026-11-02): pushed `3150734`; deployed as `v1.0.0` (no migration), the Deploy run green. On https://diogomota.com: `/api/health` ok, `/apps` shows `v1.0.0`. On the VPS: a real backup, then the restore dry run from `docs/operations.md`. A full pass on the phone: a second account signed up, Shared with two people, Shows with a friend. A calendar reminder set for the monthly check in `docs/operations.md`. Friends sent the link. `roadmap.md` merged into this file and deleted
- White buttons (2026-11-03): every button on the site's own pages is now a white box with black text (`.button` in `components/site/site.module.css`, a light grey on hover) instead of a `[Label]` link; the `Brackets` component is gone. That is Check Apps on `/`, Login and Sign Up in the `/apps` top bar (no more `|` between them) and in its login prompt, Log in / Sign up and the other form buttons, Back to Apps, Retry, and Reset by email and Logout on `/account`. The negative margins that lined the `[` up with the text are gone. Checked locally: screenshots of `/`, `/apps`, the login prompt and `/login` on desktop and phone; typecheck and lint clean; `landing`, `apps` and `site` e2e specs pass (the landing style test now expects Check Apps black on white). Not checked: the database-backed specs and `/account`, Docker wasn't running (not committed)

- Header and calendar (2026-11-05): one top bar everywhere (`components/common/AppHeader`): `diogomota.com` on the left (→ `/`, replacing `‹ diogo mota` / `‹ Apps` and the page name), then Shared and Shows, the open app in bold and underlined (neither on `/apps` or `/account`); a hidden bold copy of each label keeps its width, so the bar doesn't move between pages. The sidebar is gone: on desktop the app's tabs are in the middle of the top bar (`HeaderTabs`), on phones still the bottom bar, and the views have the whole width. Shared's Settings tab is gone: Shared Settings opens from the username's menu, like Shows Settings (`AppShell`'s `settings` prop), and the Settings page is a centered column. The theme toggle is gone from the top bar (`ThemeToggle` and the sun and moon icons deleted); the theme is chosen in Account settings, or Shows Settings. On narrow phones the bar's text is 15 px (14 px under 360 px) and the username is cut off before anything overlaps. Calendar: one toolbar row on desktop (‹ Today ›, the period, the legend, Month | Week | Day, + Add event; on phones ‹ period › over Today, the switcher and +), no space name or visible title (the tab names it; the h1 is for screen readers), no `Europe/Lisbon` line and no Export calendar: export is per event, Export to Google Calendar and Download event .ics, moved above Edit and Delete in the event's dialog; `GET /api/shared/events/export` now answers 404. Checked locally: screenshots at 1280, 768, 600, 390, 375 and 320 px wide, logged in and out (nothing overlaps, no sideways scroll); e2e tests updated for the new header and settings flow (theme now picked in Shows Settings), with new tests for the top bar (bold and underline on the open app, same widths on every page, no theme button) and tabs centered in it

## To-do

- [ ] Optional: the offsite backup (`docs/operations.md`, Offsite backup): pick a provider, `rclone config`, save the crypt passwords, set `OFFSITE_DEST` in `infra/offsite-backup.sh`, uncomment its line in `infra/crontab`, push, then `crontab infra/crontab` on the VPS
- [ ] Every month: the check in `docs/operations.md` (Monthly check)
