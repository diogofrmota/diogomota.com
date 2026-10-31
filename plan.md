# diogomota.com — Planning Notes

## Scale & Usage
- **~10 total users** (friends only)
- **Max ~2 concurrent users** at any time
- Small personal project — infrastructure and resource allocation reflect this

## Hosting, Domain and Configuration
- VPS Provider: OVH
- Domain: Porkbun
- SSL: Let's Encrypt + Certbot container (renewal via host cron)
- Web server: Nginx container (reverse proxy)
- Code: GitHub, private repo `diogofrmota/diogomota.com` (this folder is the repo root)
- Image: Docker Hub, private repo `diogofrmota/diogomota-com` (Docker Hub names can't contain dots)
- CI/CD: GitHub Actions → build Docker image → push to Docker Hub → pull on VPS
- Containerized: Docker Compose
- DNS: A record → VPS IP
- Database backup: `pg_dump` cron job every 3 days, deleted after 2 weeks

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
| **Framework** | Next.js (App Router) |
| **Database** | PostgreSQL 16 (self-hosted on VPS) |
| **DB Client** | pg (node-postgres) — raw SQL |
| **Auth** | NextAuth.js (Auth.js) |
| **Styling** | CSS Modules |
| **Deployment** | Docker Compose (app, PostgreSQL, Nginx, Certbot) |
| **Schema** | SQL migrations (`db/migrations/NNN_name.sql`), applied in order on every deploy |
| **CI/CD** | GitHub Actions → Docker Hub → VPS |
| **External API** | TMDB API |

---

## Authentication Flow

Single shared account across all apps. Auth lives at the `/apps` level.

```
/ (landing — public, no auth)
  → /apps (public: browse apps + Login/Sign Up button)
    → user logs in or signs up (username + email + password)
    → /apps (logged-in: access apps + account menu at top)
      → click any app → directly inside, no second login
```

- **Logged out:** User can see app cards with descriptions. Top bar shows `Login | Sign Up` buttons.
- **Logged in:** Top bar shows username + account dropdown (account settings, logout). App cards are clickable and go straight into the app.
- **Session:** Shared across all apps — log in once, access everything.
- **Protected routes:** `/shared` and `/shows` redirect to `/apps` if not authenticated.
- **Password reset:** Forgot password flow via email link (reset token, expiry).

### Account Settings (at `/apps` level)
Accessible from the top bar account dropdown on `/apps` or within any app:
- Change username
- Change password
- Forgot password / reset password
- Theme preference (light/dark) — persisted per user
- Logout

> Individual app settings only contain **app-specific** settings (space management, friends, etc.). No account-level settings inside apps.

---

## Pages

### `/` — Landing
- Full black background
- Centered text, IBMPlexMono-Regular font
- Content:
  - diogo mota
  - devops engineer @ Richemont (hyperlink to https://www.richemont.com/)
  - currently based in Lisbon, PT
  - `[Check Apps]` → links to `/apps`
- No navbar, no footer — minimal

### `/apps` — App Hub
- IBMPlexMono-Regular font (consistent with landing)
- Black background, consistent with landing
- **Top bar:**
  - Logged out: `Login | Sign Up` buttons
  - Logged in: username + account dropdown (account settings, logout)
- Grid or vertical list layout
- Each app card:
  - **Logo** (image/icon)
  - **Name**
  - **Short description**
  - Logged out: clickable but redirects to login prompt
  - Logged in: clickable → goes straight into the app

### `/(app_name)` — Individual App Pages
- **Protected** — redirects to `/apps` if not logged in
- Each app is a **SPA** — URL stays at `/(app_name)` at all times
- Internal navigation handled by React state (tabs, modals, panels)
- Use `history.pushState` for browser back button support within the SPA
- No visible URL changes when clicking around inside the app

---

## General UI/UX Rules (All Apps)
- **Design:** Minimalistic, modern, clean
- **Typography:** Clean sans-serif inside apps (e.g. Inter, system font stack). IBMPlexMono-Regular is **only** for `/` and `/apps`
- **Theme:** Light mode + Dark mode (toggle in account settings, persist per user)
- **Responsive:** Mobile-first — primarily used on mobile, must work well on desktop too
- **Navigation:** Bottom tab bar (mobile) / sidebar (desktop) within each app
- **Back to hub:** Small link/icon to return to `/apps` from any app
- **Account access:** Account dropdown accessible from top bar in any app (consistent with `/apps`)

---

## Apps

### App 1 — Shared (`/shared`)

A private space for a small group (e.g. couple, roommates) to share a calendar and task lists.

#### Core Concept — Spaces
- On first visit, user sees: **"Create a Space"** or **"Join with Code"**
- **One space per user** — once in a space, visiting `/shared` always loads their space
- **Invite system:**
  - Space owner clicks "Invite" → generates a **temporary code**
  - Code expires after **24 hours**
  - Invited user enters code to join the space
- User can **leave a space** (from Settings), which frees them to join/create another

#### SPA Views (bottom tab bar on mobile / sidebar on desktop)

**1. Calendar**
- Google Calendar-style layout
- Views: **month**, **week**, **day**
- Add event:
  - Title, date, start/end time
  - **Assignee:** single person (e.g. "Diogo — Gym") or **group** (applies to all members)
  - Color coding per person
  - Optional: notes
- Click event to view/edit/delete
- **Export to Google Calendar** — generate `.ics` file or Google Calendar link per event or full calendar
- Visual indicators: personal events vs group events (icon or badge)

**2. Tasks**
- Google Tasks-style interface
- **Lists:** user can create multiple lists (e.g. "House", "Trip Planning", "Groceries")
- Each list has ordered tasks:
  - Task title
  - Optional: due date, notes
  - **Assignee:** assign to a specific person or unassigned
  - Checkbox to mark complete
  - **Drag & drop** to reorder tasks within a list
- Completed tasks move to bottom or separate "Done" section
- Swipe or click to delete

**3. Settings**
- Space name (editable)
- Members list (with role: owner / member)
- **Invite people** — generate temp code (24h expiry)
- **Leave space**

#### UI/UX Details
- **First-time flow:** Click Shared → "Create a Space" or "Join with Code" screen
- **Returning user:** Click Shared → auto-loads their space's Calendar (default view)
- **Navigation:** Calendar | Tasks | Settings (bottom tab bar mobile, sidebar desktop)
- **Color palette:** Each space member gets an assigned color for events/tasks
- **Empty states:** Friendly messages when no events/tasks exist yet ("Nothing planned yet — add your first event!")

---

### App 2 — Shows Tracker (`/shows`)

Minimalistic personal tracker for TV shows and movies.

#### TMDB Integration
- All media data (title, poster, overview, runtime, seasons, episodes) pulled from TMDB API
- When a user adds a show/movie, data is cached locally in `shows` table
- **Data freshness:** cached show data is refreshed from TMDB every **7 days** (cron job or on-view check: if `last_updated` > 7 days, re-fetch from TMDB)

#### SPA Views (bottom tab bar on mobile / sidebar on desktop)

**1. Home**
- **Toggle at top:** TV Shows | Movies (filters all sections below)
- **Sections (vertical scroll):**
  - **Watching** — currently watching, shows progress (e.g. S2 E5)
  - **Planned** — want to watch list
  - **Completed** — finished, with optional rating
- Each card: poster, title, year, status badge
- Click card → detail panel/modal:
  - Overview, rating, seasons/episodes (TV), runtime (movies)
  - Change status and rate (1-5 stars)
  - Remove from library

**2. Discover (TV Shows / Movies)**
- Separate but identical layout for TV Shows and Movies
- **Sections:**
  - **Top Rated** — pulled from TMDB API
  - **Popular** — pulled from TMDB API
  - **Added by Friends** — shows/movies that friends have in their library
- Each card: poster, title, year, average rating
- Click card → detail panel with "Add to Library" button (choose: Watching / Planned)
- Search bar at top — search TMDB for any show/movie

**3. Profile**
- **Favourite Shows/Movies** — user-marked favourites from their library
- **Stats** — total shows watched, hours watched
- **Friends List:**
  - List of friends with their username
  - **Add friend** — by username
  - Click friend → see their public library (what they're watching/completed/stats/favourites)

#### UI/UX Details
- **First-time flow:** Click Shows → Home (empty state: "Start by discovering shows!")
- **Poster-heavy design** — visual grid of posters, Netflix/Letterboxd-inspired
- **Quick actions:** Long press or swipe on a card to change status or rate
- **Search:** Global search bar accessible from any view
- **Loading states:** Skeleton loaders for TMDB API calls
- **Empty states:** Friendly messages per section ("No shows planned yet — explore Discover!")

---

## Database Schema

### Single shared `users` table (across all apps)
| Table | Key Fields |
|---|---|
| `users` | id, username, email, password_hash, space_id (nullable), theme_preference, created_at |

### Shared App tables
| Table | Key Fields |
|---|---|
| `spaces` | id, name, created_by, created_at |
| `invites` | id, space_id, code, expires_at, used |
| `events` | id, space_id, title, notes, start, end, is_group |
| `event_assignees` | event_id, user_id |
| `task_lists` | id, space_id, name, position |
| `tasks` | id, list_id, title, notes, due_date, assignee_id, is_complete, position |

### Shows Tracker tables
| Table | Key Fields |
|---|---|
| `shows` | id, tmdb_id, title, type (tv/movie), poster_url, year, overview, runtime, last_updated |
| `user_shows` | id, user_id, show_id, status (watching/planned/completed), rating, current_season, current_episode, is_favourite |
| `friendships` | id, user_id, friend_id, status (pending/accepted), created_at |

### Auth tables
| Table | Key Fields |
|---|---|
| `password_resets` | id, user_id, token, expires_at, used |

---

## Backup Strategy
- **`pg_dump` every 3 days** via cron job on VPS
- Dump stored locally at `/backups/` with date-stamped filenames
- Retain backups for **2 weeks** (auto-delete older ones)

```bash
# Example cron (runs at 3:00 AM every 3 days)
0 3 */3 * * docker exec postgres pg_dump -U user diogomota > /backups/diogomota_$(date +\%Y\%m\%d).sql && find /backups -name "*.sql" -mtime +14 -delete
```

---

## Deployment Strategy
```
Developer pushes to GitHub (main branch)
  → GitHub Actions triggers:
    1. Build Next.js app
    2. Build Docker image
    3. Push image to Docker Hub (private repo)
    4. SSH into VPS
    5. Pull latest image
    6. docker compose up -d (restart, a few seconds of downtime)
```

- **Trigger:** push to `main` branch only
- **Rollback:** pull previous image tag if needed

---

## Project Structure
```
diogomota.com/                            # repo root (this folder)
├── plan.md
├── roadmap.md
├── .github/
│   └── workflows/
│       └── deploy.yml                    # GitHub Actions CI/CD pipeline
├── docker-compose.yml                    # local dev (PostgreSQL)
├── docker-compose.prod.yml               # VPS (app, PostgreSQL, Nginx, Certbot)
├── infra/                                # VPS setup, certificate and backup scripts
├── nginx/
│   └── nginx.conf                        # reverse proxy + SSL (Let's Encrypt)
├── app/                                  # Next.js
│   ├── app/
│   │   ├── page.tsx                            # landing (/)
│   │   ├── apps/
│   │   │   └── page.tsx                        # app hub (/apps) — auth UI lives here
│   │   ├── shared/
│   │   │   └── page.tsx                        # Shared SPA (protected)
│   │   ├── shows/
│   │   │   └── page.tsx                        # Shows Tracker SPA (protected)
│   │   └── api/
│   │       ├── auth/                           # NextAuth endpoints (login, signup, session)
│   │       ├── account/                        # account settings, password reset
│   │       ├── shared/
│   │       │   ├── spaces/                     # create, join, leave, invite
│   │       │   ├── events/                     # CRUD calendar events
│   │       │   └── tasks/                      # CRUD task lists + tasks
│   │       └── shows/
│   │           ├── library/                    # user's shows CRUD
│   │           ├── discover/                   # TMDB proxy (top rated, popular, search)
│   │           └── friends/                    # friend requests, friend list
│   ├── components/
│   │   ├── auth/                               # Login, SignUp, ResetPassword components
│   │   ├── account/                            # AccountDropdown, AccountSettings
│   │   ├── shared/                             # Shared app components
│   │   │   ├── Calendar.tsx
│   │   │   ├── TaskList.tsx
│   │   │   ├── InviteModal.tsx
│   │   │   └── SpaceSettings.tsx
│   │   ├── shows/                              # Shows app components
│   │   │   ├── ShowCard.tsx
│   │   │   ├── DiscoverGrid.tsx
│   │   │   ├── ShowDetail.tsx
│   │   │   └── FriendsList.tsx
│   │   └── common/                             # Shared UI (ThemeToggle, Sidebar, etc.)
│   │       ├── ThemeToggle.tsx
│   │       ├── Sidebar.tsx
│   │       └── BottomNav.tsx
│   ├── lib/
│   │   ├── db.ts                               # pg pool + query helpers
│   │   └── tmdb.ts                             # TMDB API client
│   ├── hooks/
│   │   └── useTheme.ts                         # light/dark mode hook
│   ├── public/
│   │   └── logos/                              # app logos/icons
│   ├── Dockerfile
│   └── package.json
├── db/
│   └── migrations/                             # 001_initial.sql = full schema, later changes as 002_..., 003_...
├── backups/                                    # pg_dump backups every 3 days (gitignored)
└── .env                                        # DB creds, TMDB API key, NextAuth secret, Resend API key
```

---

## To-Do

Step-by-step order, manual tasks and `/goal` prompts are in `roadmap.md`.

### Phase 0 — Accounts
1. **GitHub** — own git repo for this folder + private GitHub repo
2. **Docker Hub** — private repo + access tokens (read/write for GitHub Actions, read-only for the VPS)
3. **OVH** — order and pay for the VPS (Ubuntu 24.04, SSH key)
4. **Porkbun** — remove parking records, point `diogomota.com` and `www` A records to VPS IP
5. **Resend** — verify `diogomota.com` (DNS records in Porkbun), create API key
6. **TMDB** — register for an API key at themoviedb.org

### Phase 1 — Infrastructure
7. **VPS** — OS setup, firewall (UFW), SSH hardening, fail2ban
8. **Docker** — install Docker + Compose on VPS
9. **Nginx** — Nginx + Certbot containers: reverse proxy + SSL via Let's Encrypt, renewal via host cron
10. **PostgreSQL** — Docker container + migrations (`db/migrations`, runner applied on every deploy)
11. **Backups** — `pg_dump` cron job every 3 days, deleted after 2 weeks
12. **CI/CD** — GitHub Actions pipeline (build → push to Docker Hub → deploy to VPS)

### Phase 2 — Auth + Portfolio
13. **NextAuth** — setup at `/apps` level (credentials-based, signup with username + email + password)
14. **Password reset** — forgot password flow via email with Resend (reset token, expiry)
15. **Account settings** — username, password, theme preference (accessible from `/apps` top bar)
16. **Landing page** — build `/` (black page, centered text, IBMPlexMono)
17. **Apps hub** — build `/apps` (logged-out/logged-in states, app cards, account dropdown)
18. **Protected routes** — `/shared` and `/shows` redirect to `/apps` if not authenticated

### Phase 3 — Shared App
19. **Space system** — create space, join with code, invite flow (24h expiry)
20. **Calendar** — month/week/day views, add/edit/delete events, assignees, export .ics
21. **Tasks** — lists, drag & drop reorder, assignees, complete/delete
22. **Settings** — space management, members, invite, leave

### Phase 4 — Shows Tracker
23. **TMDB integration** — API client, search, top rated, popular, data caching + 7-day refresh
24. **Home** — library view (watching/planned/completed), TV/movie toggle
25. **Discover** — browse TMDB, "added by friends" section
26. **Profile** — favourites, stats (total watched, hours watched), friends list, add friend, view friend library

### Phase 5 — Polish
27. **Light/dark mode** — system-wide toggle, persist per user in DB
28. **Mobile responsive** — test and optimize all views (mobile-first priority)
29. **Empty states & loading** — skeleton loaders, friendly empty messages
30. **Back button support** — `history.pushState` within SPAs
31. **Testing** — end-to-end on live domain
32. **Deploy** — push to main → GitHub Actions → live