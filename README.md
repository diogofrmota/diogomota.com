# diogomota.com

Personal site plus two small apps for friends (Shared, Shows), built with Next.js and PostgreSQL. The spec is in [plan.md](plan.md) and the build order is in [roadmap.md](roadmap.md).

## Prerequisites

- Node.js 22
- Docker Desktop (with Compose)

## Local setup

1. `cp .env.example .env` and fill in the values. Docker Compose reads this file.
2. Create `app/.env.local` with the app variables from `.env` (at least `DATABASE_URL` and `AUTH_SECRET`, and `TMDB_READ_TOKEN` for real data in the Shows app). Next.js and `npm run migrate` read this file. With `RESEND_API_KEY` and `MAIL_FROM` set, password reset emails are really sent; without `RESEND_API_KEY`, the dev server prints them (and their link) to its console instead.
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
| `npm run test:e2e` | Playwright tests, each run twice: on the `desktop` project (Chrome, 1280x800) and the `mobile` one (an iPhone 13's 390x844 touch screen, in Chromium); add `--project=mobile` for one. Starts the dev server and needs Postgres running. The accounts they create (usernames starting with `e2e_`) are deleted at the end. The dev server gets `E2E_TEST_HOOKS=1`, which keeps emails in memory for the tests (`/api/test/outbox`) instead of sending them, and answers TMDB requests with a fake TMDB (see [Shows: TMDB and Discover](#shows-tmdb-and-discover)); it has no effect in production. If a dev server is already running on port 3000 the tests reuse it, so stop it first or start it with `E2E_TEST_HOOKS=1`. |
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

## Shared tasks

Tasks holds any number of lists per space, shown as chips above the open list; the last list opened is remembered on the device. Edit lists (or + New list) creates, renames, reorders and deletes lists; deleting a list deletes its tasks. A task has a title, an optional due date and notes, and an assignee: a member, shown with their color and name, or nobody. Ticked-off tasks move to a collapsed Done section, and unticking one puts it back at the end of the list. Due dates are plain calendar dates, compared with today in `Europe/Lisbon`.

Drag a task (or, in Edit lists, a list) by its handle to reorder it: with a mouse, a finger (the rest of the row still scrolls the page), or the keyboard (Space or Enter to pick it up, the arrow keys, Space or Enter to drop it, Escape to cancel; each step is announced to screen readers). Delete a task with its bin button where there is a mouse, by swiping it left on a touch screen, or from its dialog. Undo is offered for 5 seconds (paused while the pointer or focus is on it), and the delete is only sent once that runs out, or when you leave the Tasks view or the page.

Changes show at once and are sent one at a time, in the order they were made. If the server refuses one or can't be reached, it is undone on screen with a message saying why; when the reason is that someone else changed the list meanwhile, Tasks reloads. Tasks also reloads whenever it is opened or the browser tab comes back into view, to show other members' changes.

`/api/shared/tasks`: `GET` returns every list of your space with its tasks, both in order. `POST /lists {id?, name}` adds a list at the end, `PATCH /lists/:id {name}` renames it, `DELETE /lists/:id` deletes it with its tasks, and `POST /lists/:id/move {beforeId}` moves it before another list (`null`: to the end). `POST /lists/:id/tasks {id?, title, notes?, dueDate?, assigneeId?, isComplete?}` adds a task at the end of a list; `PATCH /:id` changes any of those fields of a task, `DELETE /:id` deletes it, and `POST /:id/move {beforeId}` moves it before another task of the same list. Ids are UUIDs, and clients may choose the ids of what they create (one already in use is a 409), so later changes can refer to a list or task before its response arrives. List names are 1–80 characters, titles 1–200, notes up to 10,000; `dueDate` is `YYYY-MM-DD` or `null`; `assigneeId` is a current member or `null`. Every operation checks current membership inside the same transaction as the read/write, and another space's lists and tasks answer 404. A member who leaves loses their assignments. No new migration is needed for Tasks (it uses `task_lists` and `tasks` from `001_initial.sql`).

## Shows: TMDB and Discover

Discover has a TV Shows | Movies switch over three sections laid out the same way: Top Rated and Popular (page 1 of TMDB's lists, 12 shown until Show all 20) and Added by Friends (titles in the libraries of accepted friends, any status, the ones most friends have first; see [Shows: Profile and friends](#shows-profile-and-friends)). Cards show the poster, title, year and TMDB's average rating. The search button in the top bar of every Shows view, and the search field at the top of Discover, open the search panel (the whole screen on a phone): it searches TV shows and movies together, 300 ms after typing stops. A card opens the detail panel (a bottom sheet on a phone; Back or Escape closes it) with the overview, seasons and episodes or the runtime, and Add to Library as Watching or Planned. Loading sections show grey skeleton posters; a failure shows a message with Retry.

[app/lib/tmdb.ts](app/lib/tmdb.ts) is server-only: it sends `TMDB_READ_TOKEN` (the v4 API Read Access Token) as a Bearer token, gives up after 8 s, and checks every field of TMDB's answers. The browser only calls `/api/shows` and loads posters from `image.tmdb.org`, in TMDB's sizes from `w92` to `w780` (the closest for each width of next/image's srcset). Top rated and popular lists stay in memory for 10 minutes, searches for 5. Opening a title or adding it to a library upserts it into `shows`: title, year, poster path (in `poster_url`, e.g. `/abc.jpg`), overview, movie runtime, typical episode runtime (the latest episode's when TMDB has none), episode count of each regular season (no specials) and TMDB's rating (`vote_average`, added by `005_show_rating.sql`). A copy older than 7 days is fetched again the next time it is opened or added, and kept as it is if TMDB can't be reached. TMDB's [terms](https://www.themoviedb.org/api-terms-of-use) require its logo and notice, both at the bottom of Discover and of the search panel (the logo is their file, `app/public/logos/tmdb.svg`), and allow caching for at most 6 months: titles nobody opens again would keep their last copy, so loading the library also refreshes its titles older than 7 days (see [Shows: Home](#shows-home)).

The authenticated JSON API: `GET /api/shows/discover/{tv|movie}/{top-rated|popular|friends}` returns a section, `GET /api/shows/discover/search?q=` the TV shows and movies matching `q` (1–100 characters; people and collections are left out), `GET /api/shows/titles/{tv|movie}/{tmdbId}` a title's details with your library entry (or `null`), and `POST /api/shows/library {type, tmdbId, status}` adds a title as `watching` or `planned` (201, or 409 if it is already there); the rest of the library API is under [Shows: Home](#shows-home). Responses contain `data` or an `error` message; when TMDB fails they answer 502 (404 for a title TMDB doesn't have). Each user can make 120 requests a minute.

In the e2e tests no request reaches TMDB: with test hooks on, `lib/tmdb.ts` hands its requests to a fake TMDB in the same process ([app/lib/tmdb-mock.ts](app/lib/tmdb-mock.ts); `/api/test/tmdb` lists what it answered), and `e2e/fixtures.ts` answers the browser's poster requests with a placeholder. The fake's ids start above 2,100,000,000, and the teardown deletes the titles it put in `shows`.

## Shows: Home

Home is the user's library: a TV Shows | Movies switch over three sections, Watching, Planned and Completed, each listing the titles changed most recently first (12 until Show all). A card shows the poster with a status badge (and a heart for a favourite), the title and year, the progress of a TV show being watched (`S2 E5`, or Not started) and the rating of a completed title in stars. An empty library shows "Start by discovering shows!" with Go to Discover and Search; an empty section says so, with a link to Discover. Adding a title in Discover or search shows it on Home at once.

A tap or click on a card opens the detail panel. For a title in the library it has, under the overview, seasons or runtime: Favourite, the status (Watching | Planned | Completed), the progress of a TV show being watched (a season and an episode picker, and Next episode, which moves on to the next season after a season's last episode), Your rating (1–5 stars; the same star again, or Clear, removes it) and Remove from library, which asks first and then offers to add it again. Setting the progress to the last episode offers Mark as completed (or Not yet). Progress is the last episode watched, and is kept when the status changes. Quick actions, for the status and the rating only, open from the ⋯ button on a card where there is a mouse (it shows on hover or focus), from a right click, or from a long press (half a second) on a touch screen: a small menu beside the card on desktop, a sheet from the bottom on a phone. Back or Escape closes either.

Changes show at once and are sent one at a time, in the order they were made; if the server refuses one, it is undone with a message (and the library reloads after a 404 or 409, e.g. a title removed in another tab). The library loads with the app and again whenever the page becomes visible.

`GET /api/shows/library` returns the library, latest change first: each title's card fields and lengths (`runtime`, `episodeRuntime`, `episodesPerSeason`, for the stats) with its `library` entry (`status`, `rating`, `currentSeason`, `currentEpisode`, `isFavourite`). `PATCH /api/shows/library/{tv|movie}/{tmdbId} {status?, rating?, isFavourite?, currentSeason?, currentEpisode?}` changes your entry for a title and returns it: `rating` is 1–5 or `null`, and the progress (TV only) is both fields together, an episode the show has according to its cached seasons, or both `null`. `DELETE` on the same path removes it from your library. Both answer 404 for a title that isn't in your library, so nobody can change anyone else's. `006_library_updated_at.sql` adds `user_shows.updated_at`, set by every add and change, for the order. Loading the library answers with the cached copies and then, after the response, fetches the titles older than 7 days from TMDB again, one at a time, stopping at the first failure.

## Shows: Profile and friends

Profile shows, from the top: the friend requests you received, with Accept and Decline (only when there are any); Stats; Favourites (the titles marked Favourite, TV shows and movies together, latest change first, 12 until Show all, with Home's quick actions); and Friends: a field to add a friend by username (in any case, with or without an `@`), your friends, and the requests you sent (Pending, with Cancel). Removing a friend asks first. Each answer, or the reason it was refused, shows in the section it was made in; when the button pressed goes away with its row, focus moves to that message. Friend requests and answers apply to both people at once; the other person sees them the next time their Profile loads, which it does whenever it is shown and when the page becomes visible again.

Stats: hours watched, with the episodes and movies counted, and the TV shows and movies completed. Hours watched is each TV show's episodes watched times its episode runtime, plus the runtime of each completed movie, rounded to one decimal. A show being watched counts up to its current episode included (S2 E5 after a first season of 10 is 15 episodes), a completed show all of its episodes, a planned one none (even with progress from before); a movie counts once completed. Runtimes are TMDB's, from the `shows` cache; a title without one counts 0 minutes. Your own stats follow every change at once: the browser works them out from the library with `libraryStats` ([app/lib/show-types.ts](app/lib/show-types.ts)), the same function the server uses for a friend's.

A friend's name opens their profile (the whole screen on a phone; Back or Escape closes it), read-only: their stats, Watching, Completed and Favourites. Planned titles that aren't favourites are left out, of the API answer too. A card opens the title's detail panel on top, about your own library, so you can add it. Added by Friends in Discover loads again, when it is next shown, after Profile sees your friends change.

Friendships use the `friendships` table from `001_initial.sql`: one row per pair of users, `user_id` sent the request. It is pending until the other person accepts; declining, cancelling and removing delete the row, so either of them can ask again later. Asking someone who has already asked you accepts their request (in one statement, so two people asking each other at once become friends). No new migration.

The authenticated JSON API, under the same rules as the rest of `/api/shows` (changes only from this site, JSON bodies, 120 requests a minute per user): `GET /api/shows/friends` returns `{friends, incoming, outgoing}`, each a list of `{id, username}` by username. `POST /api/shows/friends {username}` sends a request, or accepts theirs (201); it answers 400 for an empty or impossible username or your own, 404 when no account has it, 409 when you are friends already or have already asked, and 429 after 20 requests in 15 minutes, because each answer tells whether a username exists. `POST /api/shows/friends/{userId}/accept` and `/decline` answer a request they sent you, `/cancel` withdraws one you sent (each with `{}`), and `DELETE /api/shows/friends/{userId}` removes a friend for both of you; these answer with the new `{friends, incoming, outgoing}`, or 404 when there is no such request or friendship. `GET /api/shows/friends/{userId}` returns a friend's profile: `{id, username, stats, items}`, where `stats` is `{tvCompleted, moviesCompleted, episodesWatched, minutesWatched}` and `items` their watching and completed titles and favourites, latest change first, each with `library: {status, rating, currentSeason, currentEpisode, isFavourite}` (no entry ids). Anyone who isn't an accepted friend (a pending request, a stranger, yourself, an id nobody has) gets 404, "Only friends can see each other's libraries."

## Phones, loading, errors and accessibility

Added to a phone's home screen (Share → Add to Home Screen on an iPhone, Install app in Chrome on Android), the site opens on `/apps` as an app of its own, without the browser's bars: [app/manifest.ts](app/app/manifest.ts) serves `/manifest.webmanifest`, linked from every page, and its icons are `app/icon.svg`'s `>_` as PNGs in `app/public/icons/` (192 and 512 px, and a full-bleed 512 px one that launchers can cut into their own shape). There is no browser back button then, so every dialog has a close button and the apps' top bar has ‹ Apps.

Both apps' dialogs are [components/common/Dialog.tsx](app/components/common/Dialog.tsx): modal, a sheet from the bottom or the whole screen on a phone, closed by Escape, Back, a tap outside them or their × button, which hands focus back to what opened them; the page behind doesn't scroll. On a phone, controls are at least 44x44 px, text fields have 16 px text (so iOS doesn't zoom in on them), and the bottom bar, sheets and the undo message stay clear of the home indicator.

Loading shows grey skeletons in Shows and a spinner in Shared. A load that fails says why, "Could not reach the server. Check your connection." when offline, with Retry; the browser's API calls all go through [lib/api-request.ts](app/lib/api-request.ts). A page that fails on the server shows [app/error.tsx](app/app/error.tsx), with Retry and Back to Apps. On `/apps`, a small ring turns beside an app's name from the tap until the app has loaded.

[e2e/views.spec.ts](app/e2e/views.spec.ts) walks through every page and every view and dialog of both apps (empty, filled and failed to load), closing each with Back, and checks each with [e2e/checks.ts](app/e2e/checks.ts): nothing scrolls sideways, at 1280x800 on the desktop project and at 390x844 and 375x812 on the mobile one, where the tap targets, text field sizes and safe area above are checked too (with an emulated home indicator); and [axe](https://github.com/dequelabs/axe-core) (`@axe-core/playwright`), in the light and the dark theme, finds nothing serious or critical. Next.js's dev tools are left out of the scan.

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
