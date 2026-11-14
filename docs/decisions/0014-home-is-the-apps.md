# 0014 — Home is the apps

**Decided:** unreleased (after v1.2.0), 2026-11-14, from the review in [update_UX.md](../../update_UX.md).

**Why:** `diogomota.com/` was a personal intro with one button, Check Apps, and everyone who came for the apps had to pass through it: friends opening a link, the installed app (which started on `/apps`), anyone sent to log in. The apps are what the site is for, so they are the front door, and the intro is one page further.

**What it is:**

- `/` is home: logged in, the apps' icons in a grid like a phone's home screen, each with a badge counting what is waiting in it (`lib/badges.ts`: Shared's tasks due today or before, for the user or for nobody; Shows' friend requests and recommendations not yet seen in Discover) and going back to the view last used in it on this device (a `last-view-<app>` cookie, `lib/app-views.ts`). Logged out, the front page: "Small apps for friends", Log in and Sign up, and a card per app with what it does, which opens its login prompt.
- `/apps` redirects to `/` for good (308, in `next.config.ts`), with its query: `?next=` and `?account=deleted` work as before. The web app manifest starts on `/` but keeps `id: "/apps"`, so phones that installed it keep one app.
- The intro is `/about`, unchanged (black, IBM Plex Mono, its own preview image), with See the apps.
- Every page around the apps has the same tab bar as home: Account (or Log in and Sign up) and Home, which is also the last tab of each app (in place of Apps). The top bar and the account menu are gone, and so is Back to apps. The 404 and error pages are in the apps' look; IBM Plex Mono is only on `/about`.
- Recommendations have `seen_at` (`022_recommendation_seen.sql`), set when Discover shows them (`POST /api/shows/recommendations/seen`).

**Costs:** home renders per user (a query for the badges, the cookies for the last views), so it can't be cached for everyone; the service worker keeps the last copy for offline. The last view is per device, not per account. Links to `/apps` cost a redirect. A release before this one, rolled back to, still writes recommendations without `seen_at`, which then count as new until Discover shows them.
