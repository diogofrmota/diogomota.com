# Changelog

Each deploy publishes a GitHub Release (`vX.Y.Z`) listing its commits (`.github/workflows/deploy.yml`); this file says what each minor version brought, in words. The decisions are in [docs/decisions/](docs/decisions/).

## Unreleased

- **A new icon, and folders that open like a phone's.** The site's icon (the browser tab, the Home Screen, link previews) is a bubbly "dm" on a coral-to-pink tile, in the apps' icons' style, in place of `>_`. A folder on home grows out of its tile into its popup and shrinks back into it, with its apps there from the start rather than coming in one by one. In Safari, a folder's small icons sat too low, and For Couples' third ran off the bottom of its tile; they now sit two to a row from the top, the same distance from every edge. On the front page, **How to add to Home Screen** is **Add to Home Screen**, and a few lines are shorter.

- **A top bar with ‹ Home** ([docs/decisions/0024](docs/decisions/0024-a-top-bar-with-home.md)). The apps and the pages around them have a bar at the top: ‹ Home on the left (to your profile and folders, or the front page logged out), the app's name in the middle, and your picture on the right, the way to Account. The bottom bar on a phone has only the app's own tabs, and **Apps** is gone from it. Calendar and Tasks, with one view each, have no bottom bar and fill the screen. Account, the group's settings, Privacy, Report a bug and the login pages have only the top bar. On a computer it is one header: ‹ Home and the app's name, the tabs in the middle, Account on the right. A friend's profile has **‹ Back**, to where you opened it from.

- **Home is folders, and For Couples is a group of two** ([docs/decisions/0023](docs/decisions/0023-folders-and-a-group-for-couples.md)). Logged in, home shows your picture, name and (@username) with **Account settings**, over three folders in a row, For Couples, Trackers and Health, each opening in a popup with its apps (`/?p=folder:couples`) and counting what's waiting in them. For Couples has a lock, and a gear to the group's settings. **Tasks** is an app of its own (`/tasks`), Calendar is at `/calendar` with only the calendar, and the group's settings (members, invite, import, subscription, activity, leaving) are at `/couples`; `/shared`, `/shared/tasks`, `/shared/settings` and `/benfica` redirect. A group holds two people. **Recipes is the group's**: both of you share its recipes, photos and one shopping list; recipes you had come into the group when you create or join one, and stay with it if you leave. An invite now opens home with For Couples open. Migration 029 adds `space_id` to `recipes` and `shopping_items` (only added and loosened: the previous release keeps working). The service worker's cache is new (v3).

- **The front page, simpler** ([docs/decisions/0016](docs/decisions/0016-the-front-page-is-a-website.md)): the apps in three groups (For Couples, Trackers, Health), each with its apps' small icons and a few lines; How it works with each number beside its title, bigger; How to add to Home Screen, step by step on an iPhone, in place of Questions; less room under the last band; on a phone, the menu's links before the apps. **Shared is called Calendar** (its address stays `/shared`). **Report a bug** (`/report-bug`, from home's footer) emails Diogo what went wrong, with the version and browser. **Remember me** on Log in: unticked, the session ends when the browser closes.

- **Faster checks** ([docs/decisions/0022](docs/decisions/0022-small-deploy-gate.md)): a deploy now waits for formatting, lint, typecheck, unit and integration tests and about 30 `@smoke` browser tests on a production build, in parallel jobs, while the image is built and scanned beside them, instead of the whole browser suite before the build. `npm run test:affected` runs only what an uncommitted change can break, fastest first. The browser suite has 142 tests instead of 188 (duplicates merged, axe once per view), and runs faster: cheap password hashing with test hooks on, a production build with four workers, the longest tests first.

- **2.0.0 remediation:** pending offline changes survive app switching, reloads and releases; simultaneous tabs use separate journals, and unsupported queues offer recovery downloads. Books owner views reopen offline, and successful account transitions clear private cached data across tabs.
- Shared task patches preserve concurrent edits, recurring completions identify their occurrence, calendar imports serialize, and exports/feeds keep membership authorization through their reads. Account deletion is atomic with retryable media cleanup (additive migration 028).
- Photo uploads accept the advertised limit through nginx and Next.js. Logs redact bearer links, failed media backups retain older archives, and the main deployment gate runs isolated integration, full behavioral and production-mode regressions. See [rollout and rollback instructions](docs/operations.md#remediation-rollout-and-media-cleanup).

- **Benfica is no longer an app**: its games are imported into Shared's calendar from Shared's Settings (Import calendars), which is where `/benfica` now redirects. Home, the front page, About, Privacy and Download my data no longer have it, and its API (`/api/benfica/*`) is gone. Its table, `benfica_fixtures`, stays until a contract migration drops it.
- **Books looks and works as Shows does**: Library has Currently Reading, Want to Read and Finished as grids of covers, with each book's progress on its card and cover, quick actions (⋯, a long press or a right click) for the shelf and the pages read, and a search past 6 books. Discover has a search field and Open Library's lists as rows that scroll sideways, with + on each cover to put it on a shelf. A book has a panel of its own, like a show's: its cover, author, first publication, subjects and description from Open Library (`/api/books/works/:id`), its shelf, its progress with Pages read, Edit details and Remove from shelves with Undo. Search finds books as you type, and Add a book yourself is there for one Open Library doesn't have. Open Library requests are limited to 60 a minute per user (from 20).
- Recipes: a new recipe's form no longer asks how many it serves: it serves 4, which its page scales and Edit recipe changes.

- Social is gone as an app: Shows and Books each have a **Profile** tab with your profile for that app, your friends' activity there (watching in Shows, reading in Books) and Friends (search, requests, removal with Undo). A friend's profile is `/shows/profile/<id>` or `/books/profile/<id>`, inside the app. Old `/social` links redirect to Shows' Profile. Friend requests now count on Shows' home icon.
- Shared: Settings has **Import calendars**, for now with Benfica games: Benfica's upcoming games from football-data.org, added to the calendar as two-hour events for the whole space, never twice. The calendar opens on the month, on a phone too.

- Books has a Discover tab with Trending, Popular today and Top rated lists from Open Library, with shelf selection when adding a book and Added indicators across lists. No additional API key is required.

- **Benfica**, the sixth app: private home fixtures with Lisbon kickoff times, attendance plans, ticket status and calendar reminders. Stadium days shows Going and Maybe plans by month. Export one match or upcoming plans as `.ics` with reminder alarms for calendar apps. Includes search, edits, removal with Undo, home and front-page integration, Privacy and Download my data. Migration 026 adds `benfica_fixtures`.

- **Books**, the fifth app: `/books` searches Open Library or adds books manually, with Want to Read, Currently Reading and Finished shelves. Page progress is saved per account; reaching the last page finishes a book. Removal offers Undo. Books joins the home screen, front page, Privacy and Download my data. Migration 025 adds the private `books` table.

- **Fitness**, the fourth app ([docs/decisions/0018](docs/decisions/0018-fitness.md)): `/fitness` plans workouts and tracks fitness, hydration and body weight, each yours alone. **Today** is a day of the log (‹ and › to the days before): its workouts and runs, water against a daily goal (a glass or a bottle a tap away), steps and body weight typed in (with the change since the last weigh-in), and supplements ticked off. **Workouts** has gym routines (exercises with sets × reps; Start and Edit) and the history of workouts and runs by month. A workout lists each exercise's last time and its sets (kg, reps, a tick), starts at the last time's weights, and marks a personal record with a trophy. **Progress** has the last 7 days, personal records (heaviest set, estimated one-rep max, longest run, fastest pace) and charts of strength, body weight, steps and water, each with a table. It works offline as Recipes does. Home counts the supplements left to take today; the front page, About, Privacy and Download my data have it. Migration 024 adds six `fitness_*` tables (only added: the previous release keeps working).
- Logged in, `/` is "Diogo’s Apps" (the first word of your name, or your username without one), with no header or tab bar: its icons are the way to everything, Account among them. Three icons to a row on a phone, four wider. Its footer is Version · Privacy (About is gone from it). Home is called Apps everywhere: the last tab of every tab bar, with a grid icon. On `/account` the tab bar is only Apps.
- Popups on iPhones (a new event, a task, a show's details, a recipe) were an empty white box: Safari sized them from their content's flex basis of 0. The content is now as tall as what is in it (a basis of auto), scrolling inside past the popup's max-height.
- The front page's introduction is Share your calendar and register your shows watchlist!, and under Sign up and Login there is nothing more: no Have an account? Log in, and no pictures of the apps. The apps' sections keep their pictures from 48rem; a phone has only their words. The website's footer is on the page's own gray, not a white band.
- `/about`: DevOps engineer based in Lisbon, Portugal; This site is in Diogo's own words; Get in touch is a form (name, email, message) that emails `CONTACT_EMAIL` with Reply-To the sender, so the address is no longer on any page (`/privacy` links to the form instead).

- **Recipes**, the third app ([docs/decisions/0017](docs/decisions/0017-recipes.md)): `/recipes` keeps the recipes you want to cook again, each yours alone. A recipe has its ingredients and steps (a line each, pasted lists tidied), photos (up to 10, the first the cover, made smaller on the server), where it came from, tags, notes and how many it serves. Recipes has a search, a sort and the tags as chips; Favourites, the ones with a heart; a recipe's page scales its ingredients to the servings chosen (fractions, decimals and ranges written as they were) and adds them to the shopping list, unticking what's in the cupboard. Shopping is a list typed in or from recipes, ticked off in the shop, with Clear ticked. It works offline as Shows does (photos need the connection). Home counts what's left to buy; the front page, its header and footer, About and Privacy have it; Download my data has the recipes and the list, and deleting the account deletes the photos. Migration 023 adds `recipes`, `recipe_photos` and `shopping_items` (only added: the previous release keeps working). The photos are files on the `appdata` volume, archived by `infra/backup.sh` as `recipe-photos_*.tar.gz`; nginx lets 21 MB through to their upload.

- The front page is a website ([docs/decisions/0016](docs/decisions/0016-the-front-page-is-a-website.md)), for whoever comes from a link and doesn't know the site: logged out, `diogomota.com/` has a header (the `>_` mark, Apps with a menu of them, How it works, About; Log in and Sign up; on a phone, Sign up and a menu with the rest), the headline Small apps for the things you share with people, the apps in browser windows, a section per app (its headline, what it does, Open), How it works, Questions, Sign up once more, and a footer of links with the year and the version. `/about` is in the same look, black and monospace no more, without See the apps (IBM Plex Mono is gone), and so is `/privacy` logged out. The link previews and the site's description say what the site is.
- Account: Data / Privacy page is the last of the settings' rows (Manage), with the Privacy page, Download my data and Delete my account; Your data under Log out is gone.
- Shared: the calendar's toolbar is all together in the middle, and Month comes before Agenda.
- A new email is confirmed once the link sent to it is opened, also for an account that never confirmed its first (since Better Auth 1.7.18 it stayed "not confirmed").

From a UX review:

- Home is the apps ([docs/decisions/0014](docs/decisions/0014-home-is-the-apps.md)): `diogomota.com/` is what `/apps` was, and `/apps` redirects there. Logged in, Home, in the middle, over the apps' icons, big, in a grid like a phone's home screen (two to a row on a phone, four wider), each with a badge of what is waiting (Shared: your tasks due today or before; Shows: friend requests and new recommendations) and going back to the view last used in it. Version · Privacy · About are at the bottom of the page. Logged out, the website's front page (below); the intro is `/about`.
- One tab bar everywhere: Account (or Log in and Sign up, each its own icon) and Home, which is also each app's last tab, in place of Apps. The top bar, the account menu and Back to apps are gone. The header is only the tabs. The 404 and error pages are in the apps' look.
- Account: its title in the middle; Password is a row like the others, and Log out stands alone, as wide as the rows, in the accent with its icon. Data / Privacy page is the last row (below). Password fields have Show/Hide. Confirm your email's Send it again sends from home.
- Avatars without a photo show two initials from the name. The activity feeds' avatars are round again; their recommendations to you say "to you", and Shared's shows the latest 5 with Show more, a run of one thing as one line.
- Popups on phones are as tall as what is in them. The login pages' small print is no longer double-spaced.
- Shared: on a phone, the month is bars per day, and a tap on a day lists its events under it, with Add event; on a wide screen, an event of several days is one bar across them and timed events start with their time. Events for two people are in both colors; the agenda says which day of several it is. Who? is chips with each person's picture and first name. An event's exports are one Add to my calendar button. The calendar's toolbar stays where it is between Agenda and Month. Tasks has Due today in the accent, Today/Tomorrow/Next week in a task's popup, a List choice that moves a task, and the lists as a column on wide screens; its heading is gone, as in the other views. Leave this space, not group.
- Shows: Added by Friends right after Recommended by Friends in Discover. Watching cards tick their next episode in one tap (the button turns green, then the next episode comes in), and Library's posters no longer repeat their section's status; past 6 titles, Library has a search and a sort. A show being watched has its progress first in its panel. The friend field is Add a friend. The guide's Next is no longer under the tab bar on phones, and opening a new event from a link no longer causes a hydration error.
- Migration 022 adds `recommendations.seen_at` (only added: the previous release keeps working). `CONTACT_EMAIL` puts an email link on Privacy.

- One branch, `main`, and no Dependabot ([docs/decisions/0015](docs/decisions/0015-only-main.md)): its seven pull requests are closed and updates are made by hand. Next.js 16.4.5, React 19.3.1, Better Auth 1.7.18, TanStack Query 5.106.1, Playwright 1.65, ESLint 10, Vitest 5, `docker/login-action` 4.8.0. Not yet: TypeScript 7, Node 25, `@types/node` 26.

- Launcher and Account: one tab bar with Account (the profile picture) and Apps, the current one marked; Log out is on Account, which has no top bar or Back to apps. Both apps lose the top bar and gain Apps in their tab bar. On a phone the tab bar is along the bottom; on a wider screen it is the header, at the top.
- Shared: Month and Agenda only, compact controls, full-width calendar, smaller event text, and no color legend or Today button. The toolbar has ‹ the month and year › together, then Agenda | Month (both shown) and Add event. The agenda lists every event from today on, 20 at a time with Show more, in a centered column with margins; the month keeps the whole width. Events and tasks select individual people without an All shortcut.
- Tasks: multiple assignees with profile pictures; a task's row is the title, the pictures, the due date and the rest in one line that wraps; Extra options groups Who?, Due date, Repeat?, and Notes. Edit replaces Edit lists, and task entry stays above existing tasks.
- Settings: shorter invite copy and Copy link before Add to my calendar. The calendar link is blurred until Show.
- Popups retain visible margins and no longer slide up on phones.
- Shows: Recommend to a friend, More like this, then Remove from library without a divider. Poster rows use visible scrollbars instead of arrows. Mobile friends have a centered Check profile; completion counts appear above hours watched.
- Migration 021 adds task assignments while keeping the legacy single-assignee column compatible with older clients and rollbacks.
- Motion, one system ([docs/decisions/0013](docs/decisions/0013-motion-system.md)): popups grow in from what opened them and go back into it; Agenda | Month, TV Shows | Movies, a title's status and the tab bar's underline slide (and stretch) between options; list rows come in one after another; icons crossfade; a ticked task leaves on an arc; a title added flies into Library; the All day switch's knob stretches and its color fills from it; dragging past an edge rubber-bands. No bounce on everyday parts, exits quicker than entrances, nothing with reduced motion.
- Type and layout: tighter headings, readable line lengths, no widows, tabular numbers in counts, and no sideways jump when a dialog opens.
- Invite codes are shown in two groups of four, and read with spaces, dashes or as the whole pasted link.

## v1.2.0 — 2026-11-13

From the v1.2.0 review.

**Accounts**

- Better Auth in place of Auth.js: database sessions, ended at once by logging out, a password change or deleting the account. Everyone logs in once more after the deploy; passwords stay the same.
- Signing up sends a link to confirm the email; password resets only go to a confirmed one, and the newest reset link is the only one that works.
- Changing the email sends a link to the new address; it changes once the link is opened.
- Account: Download my data and Delete my account. A Privacy page says what is kept.

**Both apps**

- Each view and open panel is in the URL: a reload keeps them, and links open them.
- On a phone, the tabs are along the bottom of the screen.
- Undo instead of "are you sure?" for deleting and leaving.
- Two themes, Light and Dark.
- The apps open without a connection (in production), and changes made offline go out once it's back.
- Log in first, Sign up filled, everywhere.

**Shared**

- For couples: the welcome and `/apps` say so; a new space asks to invite your partner.
- Invite links (with the phone's share sheet), from any member.
- Calendar: the agenda (the default on a phone), three days for a week on a phone, swipe between periods, a line at the time it is now, events dragged with the mouse, events for two people or more, the whole calendar as a subscription for Google, Apple or Outlook Calendar. Events have no notes.
- Tasks: repeating tasks; what the other member changes shows up while Tasks is open.
- Settings: recent activity.

**Shows**

- The Watchlist is Library.
- A title's panel: its genres, the friends who have it, More like this, Recommend to a friend.
- Discover: Recommended by Friends; sections load as they come near; the TV Shows | Movies choice is remembered.
- A friend's profile: what you both want to watch. Profile: your friends' activity.
- TMDB's logo and notice are back.

**Behind the scenes**

- Node 24, Prettier, unit tests, and every Playwright test in CI; the image is scanned before it's pushed; Dependabot every week; rate limits in nginx; migrations expand and contract.

## v1.1.0

Profile pictures, names, a cleaner calendar and the Shows guide (2026-11-11 and 2026-11-12).

## v1.0.0 — 2026-11-02

Launch: the site, Shared and Shows.
