# Update: UX and pages

Built on 14 November 2026, everything below as written (the decisions are in [docs/decisions/0014](docs/decisions/0014-home-is-the-apps.md), what changed in [CHANGELOG.md](CHANGELOG.md)). One thing is left to you: Privacy's contact address (F9) shows once `CONTACT_EMAIL` is set in the server's `.env`.

## In short

- The apps move from `diogomota.com/apps` to `diogomota.com/`. `/apps` redirects to `/`, so old links, bookmarks and home-screen installs keep working.
- Your intro (diogo mota · devops engineer @ Richemont · currently based in Lisbon, PT) moves to `/about`, unchanged.
- Logged in, home is a compact grid of app icons with badges, and each app reopens where you left it.
- Logged out, home is a short front page that explains the apps.
- "Apps" in every tab bar becomes **Home**, with a house icon.
- Every page has the same tab bar. The old top bar and "Back to apps" are removed.
- The 404 and error pages use the apps' look.
- Account gets About and Privacy links at the bottom.
- A review of every page found 9 bugs and about 25 improvements, listed under [UI and UX review](#ui-and-ux-review). Delete the ones you don't want.

## Your answers

| Question | Answer |
| --- | --- |
| Your intro | Move it to `/about` |
| Home, logged in | Compact icon grid |
| Home, logged out | Short front page |
| Name of the Apps tab | Home, with a house icon |
| 404 and error pages | The apps' look |
| New pages | None (no What's new, Help or install hint) |
| Layout changes | One tab bar everywhere · Badges on home icons · Reopen where you left off · Links at the bottom of Account |

## Addresses

| Address | Now | After |
| --- | --- | --- |
| `/` | Your intro (black, IBM Plex Mono) | Home: the apps |
| `/apps` | The apps | Permanent redirect to `/`, keeping `?next=` and `?account=deleted` |
| `/about` | Doesn't exist | Your intro, exactly as `/` is now |

Everything that sends people to `/apps` today will send them to `/` instead:

- A logged-out visitor opening an app or `/account` goes to `/?next=…`, where they can log in and get sent back.
- After logging in or signing up (with no `next`): `/`.
- After logging out: `/`.
- After deleting the account: `/?account=deleted`.
- The installed app (on a phone's home screen) opens on `/`.

## Pages

### Home `/`, logged in

- **Tab bar:** Account · Home (current).
- The note asking you to confirm your email stays (until it's confirmed), as on `/apps` now.
- **Heading:** Apps.
- **Icon grid, like a phone's home screen:** each app's icon (64 px on a phone, 72 px on wider screens) with its name under it. 4 per row on a phone, 6 on wider screens, left-aligned in the page's column. No pictures or descriptions, though screen readers still hear the description.
- Tapping an icon shows the small spinning ring until the app has loaded, as now.
- **Badges:** a count on the icon's top-right corner. It shows "9+" above 9 and is hidden at 0. Screen readers hear it too ("Shared, 2 tasks due").
  - **Shared:** your open tasks due today or overdue that are assigned to you or to nobody. Days are in Lisbon time.
  - **Shows:** friend requests waiting for you, plus friends' recommendations you haven't seen yet. A recommendation counts as seen once you open Discover's "Recommended by Friends". This needs a small migration (see Technical notes).
  - The counts come with the page, so there's no loading state. They refresh each time you come back to home.
- **Reopen where you left off:** tapping an icon opens the view you last used in that app on this device, for example Shows → Discover or Shared → Tasks.
  - Only the view is restored. Open panels (a title, an event) aren't reopened.
  - If that view no longer exists (say you left your space), the app opens on its first view.
- **Footer**, small and grey: Version v1.x.y · Privacy · About.

### Home `/`, logged out

- **Tab bar:** Log in · Sign up · Home (current).
- After deleting an account: "Your account and everything it had here were deleted." (as now).
- **Top:** the heading "Small apps for friends", then the line "A shared calendar and task lists for couples, and a way to keep track of what you watch with your friends.", then Log in and Sign up side by side. This replaces the "One account for all apps" box.
- **One card per app:** its picture (as now), icon, name and 2–3 short lines:
  - **Shared:** A calendar for the two of you, by month or as an agenda · Task lists you both tick off, with repeats and who's doing what · Subscribe to it from Google, Apple or Outlook Calendar
  - **Shows:** Your TV shows and movies, and where you are in each · Discover what's popular and what friends recommend · See what your friends are watching
- Tapping an app opens the login prompt, as now. With `?next=`, the prompt opens for that app.
- **Footer:** Version · Privacy · About.

### About `/about` (new)

- Today's `/`, moved as it is: black, IBM Plex Mono, the four lines and the Richemont link.
- The "Check Apps" button becomes "See the apps" and goes to `/`.
- It keeps today's share picture (your intro). Its page title is "about".

### Account `/account`

- **Tab bar:** Account (current) · Home.
- **New:** "About · Privacy" in small grey text under Log out.

### Log in, Sign up, Forgot password, Reset password

- The top bar (diogomota.com) and "Back to apps" are removed, and the tab bar replaces them: Log in · Sign up · Home, with the page's own tab marked (Log in on `/login`, Sign up on `/signup`).
- Reset pages opened while logged in show Account · Home.
- Nothing else on these pages changes.

### Privacy `/privacy` and invites `/join/<code>`

- The top bar is replaced by the tab bar: Account · Home, or Log in · Sign up · Home.

### Inside Shared and Shows

- The last tab, "Apps", becomes "Home" with a house icon and goes to `/`.
- Nothing else in the apps changes.

### 404 page

- **Look:** the apps'. Your theme (Light when logged out), the tab bar, the heading "Page not found", one line and a "Go home" button to `/`.

### Error page (a page that failed to load)

- **Look:** the apps', in the Light theme, without a tab bar. When the server fails, the page can't tell who's logged in.
- The heading "Something went wrong", then Retry and Go home.

### Share previews (the picture and text in WhatsApp, iMessage…)

- **`/`:** a new picture with the `>_` icon, "diogomota.com", "Small apps for friends" and the Shared and Shows icons, in the Light theme.
- **`/about`:** today's picture, your intro.
- The description of `/` and the site becomes "Small apps for friends: Shared and Shows." Your intro stays as the description of `/about`.

## UI and UX review

On 14 November 2026 I went through every page and popup of the current site in a local test build, at phone (390 px) and desktop (1280 px) sizes, in Light and Dark. I used an account with a partner, events, tasks, a Shows library, a friend and a recommendation, and also a brand-new account to see the empty states.

The items are grouped by priority and numbered so you can refer to them. **Delete any line you don't want.** None of them change the decisions above.

### Bugs: fix in any case

- **F1. Bare letters instead of avatars.** In Shared → Settings → Recent activity, Shows → Profile → Friends' activity and a title's Friends list, people without a photo show a lone "E" in the corner instead of a round avatar: the activity feed's avatar style has a size but no circle or background. Give it the same round style as everywhere else.
- **F2. Event names broken mid-word on the phone's month view:** "Weeken d in Porto", "Conce rt", "birthda y". Cut long names with "…" instead (or see R9, which replaces the text with bars).
- **F3. The Shows guide's Next button is hidden behind the tab bar on phones.** The guide's Back/Next bar is pinned to the bottom of the screen, where the tab bar is (a tap on Next lands on the tab bar). With 40 posters on step 1, you only reach Next by scrolling to the very end. Pin the bar just above the tab bar.
- **F4. "Send it again" doesn't send.** The confirm-your-email note on `/apps` has a "Send it again" link that only goes to Account, where there's another button. Make it send the link right there and say "Sent".
- **F5. Error opening a new event from a link.** Opening `/shared?p=new-event:…` directly gives a React hydration error (the dev build shows "1 Issue"). The title field's `autoFocus` is false on the server and true in the browser. Decide the focus after the page loads (`data-autofocus` only).
- **F6. Friend popup header wraps badly.** "Rita Sousa (@username" on one line and ")" alone on the next. Put the username on its own line, without brackets.
- **F7. "Space" or "group"?** Settings says "Leave this group" while the activity says "joined the space" and the welcome says "Start your space". Use "space" everywhere: "Leave this space".
- **F8. "Recommended Popular Series 3 to Diogo Mota"** in your own activity feed. Say "to you".
- **F9. Privacy says "ask Diogo" but gives no way to reach you.** Add a contact email link (see "Decided by me", point 10).

### Recommended: everywhere

- **R1. Your site's name on desktop.** From 48rem the tab bar is the header, but nothing in it says where you are. Add the `>_` mark and "diogomota.com" on its left, linking to `/`. Phones stay as they are.
- **R2. Different icons for Log in and Sign up.** Both tabs now use the same person icon. Use an arrow into a door for Log in and a person with a + for Sign up.
- **R3. Two initials from the name in avatars without a photo** ("DM", "RS") instead of the username's first letter. Usernames often aren't the name, and two people with the same first letter look identical (in the review both members were "E").
- **R4. Phone popups as tall as their content.** New event, an event and a task are always full height, with half the popup empty below the buttons. Fit the content, keep the margins, and scroll inside only when needed.
- **R5. One rule for view titles.** Tasks has a big "Tasks" heading; Calendar, Settings, Library, Discover and Profile don't (the tab says which view it is). Drop Tasks' heading too, which brings the lists up. Pages outside the apps (Account, Privacy) keep their titles.
- **R6. A Show/Hide button in password fields** on Log in, Sign up, Reset password and Account's password popup.
- **R7. Tighter small print on Log in and Sign up.** The lines under the form look double-spaced ("We'll send you a link…"), with a large gap between "No account yet? Sign up" and "Forgot password?".

### Recommended: Account

- **R8. Password as a row** in the settings list (Password · Change ›), like Name, Username, Email and Theme. Log out stands alone below the list, with About · Privacy under it. "Update password" and "Log out" are no longer two equal buttons side by side.

### Recommended: Shared, calendar

- **R9. A month that works on a phone.** Each event becomes a short colored bar in its day (no text), and tapping a day lists its events under the month, with Add event for that day. Desktop keeps the names. This also fixes F2.
- **R10. Events over several days.** In Month, one bar across the days (today "Weekend in Porto" is repeated in each day). In Agenda, "Weekend in Porto · day 1 of 2".
- **R11. Start times in the desktop month:** "09:00 Dentist". There's room, and today you have to open an event to see when it is.
- **R12. Who? as named chips.** The picker shows two round letters, and a name only for the one selected. Show each member as a chip with their picture and first name (Diogo · Rita), still without an All option. The same applies to tasks.
- **R13. Events for two people in both colors** (a split bar), instead of the first person's color. Concert, for both of you, now looks like Rita's.
- **R14. One "Add to my calendar" button** in an event's popup, with a menu (Google Calendar · Apple or Outlook (.ics)) in the normal button style. Today these are two boxed, underlined links.

### Recommended: Shared, tasks

- **R15. "Due today" in the accent color.** Now only Overdue stands out (in red) and "Due today" looks like any other date.
- **R16. A "Today" chip before the lists:** tasks due today or overdue from every list in one place. These are the same tasks the Shared badge on home counts.
- **R17. Quicker task popup.** Today · Tomorrow · Next week buttons by the due date, a List choice to move the task to another list (not possible now), and no floating "Extra options:" label.

### Recommended: Shared, settings

- **R18. A shorter Recent activity.** It lists 30 rows, so "Leave this space" ends up far below. Show the latest 5 with Show more, and group runs: "Diogo added 9 tasks to Home and Groceries" instead of 9 rows.

### Recommended: Shows

- **R19. Tick the next episode from the card.** Watching cards get a "✓ S1 E1" button under the poster that marks the next episode watched in one tap. Today it takes opening the title or its ⋯ menu. "Not started" then reads "Next: S1 E1".
- **R20. Friends first in Discover.** Move Added by Friends up, right after Recommended by Friends; TMDB's lists come after. Watching with friends is what makes Shows different, and today Added by Friends is last of 9 sections.
- **R21. "Add a friend" instead of "Search friends…".** The field next to Send request adds people by username; it doesn't search your friends. Label it "Add a friend", with the placeholder "Their username".
- **R22. Progress first in a title's popup** when you're watching it, above Synopsis and Friends: it's what you open the popup for.

### Optional

- **O1.** Library: no status badge on posters within their own section ("Watching" on every card under the Watching heading). Discover and friends' libraries keep it.
- **O2.** Library on desktop: the grid is left-aligned under a centered TV Shows | Movies switch. Align both the same way.
- **O3.** Tasks on desktop: the list uses about half the width. Show the lists side by side, or their names as a sidebar.
- **O4.** Library: search and sort (Recently updated, A–Z) for when it holds many titles.

### Checked and fine

- **Dark theme:** contrast and colors hold up on every page checked.
- **Phone agenda:** the time column and the Today / Tomorrow labels read well.
- **Welcome pages:** the empty Shared welcome (Create space / invite code) and the Shows guide's steps are clear.
- **Title popup on desktop:** it already has a Next episode button.

## Removed

- The top bar (`AppHeader`) and the account menu (`AccountMenu`), which nothing will use any more.
- "Back to apps" on the login pages.
- The "One account for all apps" box (the front page's top replaces it).
- App pictures on the logged-in home. They stay on the logged-out front page and in the login prompt.
- `/apps` as a page (it becomes a redirect).

## Technical notes

- **Redirect:** `redirects()` in `next.config.ts` sends `/apps` to `/` permanently (308) and keeps the query string.
- **Next path:** `appsWithNext` becomes `homeWithNext` (`/?next=…`) in `lib/next-path.ts`, used by `proxy.ts`. `login`, `signup` and the account actions redirect to `/`.
- **Manifest:** `start_url` becomes `/`. `id` stays `/apps`, so phones that already installed the site keep one app instead of getting two.
- **Offline:** the service worker also keeps `/`, so the installed app opens without a connection, showing the badges' last counts. It still loads from the network first, and logging out still clears it.
- **Last view:** one cookie per app (`last-view-shared`, `last-view-shows`), written when the view changes (`hooks/useAppView.ts`). Home reads it to build each icon's link, and checks it against the app's views (`lib/app-views.ts`).
- **Badges:** one query per app when home renders. Shows' count needs migration `022_recommendation_seen.sql`, which adds `recommendations.seen_at`. The column is nullable and the migration only adds it, so it's safe to roll back.
- **Fonts:** IBM Plex Mono only on `/about` (and its share picture). `SitePage` stays for `/about` only, and `MessagePage` moves into the apps' frame.
- **Site text:** `siteDescription` in `lib/site.ts` becomes the apps' description, and the intro text moves into the about page.

## Tests and docs

- **Browser tests:** `landing.spec.ts` becomes about, `apps.spec.ts` becomes home, and the specs that open `/apps` are updated: account, app-shell, auth, password-reset, site, themes, views, shows-home and `fixtures.ts`.
- **New browser tests:** `/apps?next=…` redirects to `/?next=…`; the tab bar on the login pages; badges; reopening the last view; About.
- **Review items:** a browser test for each bug fixed (F1–F9), and for each R item kept, in the spec of the page it changes (calendar, tasks, spaces, account, auth, the Shows specs).
- **Unit tests:** `homeWithNext` and the last-view check.
- **Runs:** the affected specs on the desktop project, and the full suite only if you ask.
- **Docs:** plan.md (Pages, General UI/UX rules), README, CHANGELOG (Unreleased) and a decision record, `docs/decisions/0014-home-is-the-apps.md`.

## Decided by me: please check

1. `/about`'s button reads **"See the apps"**.
2. The logged-in home keeps the heading **"Apps"**, while the tab says Home.
3. **Home stays the last tab** in every tab bar, where Apps is now.
4. **Shared's badge** counts tasks due today or overdue, assigned to you or to nobody. Your partner's tasks don't count.
5. **Shows' badge** includes unseen recommendations, which needs the migration. Without it, the badge could count friend requests only.
6. **Badge color** is the theme's accent, not a phone's red, because red already means "delete" in the apps.
7. **The error page has no tab bar.**
8. **The installed app's offline copy includes home.**
9. **The front page's wording** (headline, line and the 2–3 lines per app) is my draft; rewrite it freely.
10. **Contact address on Privacy (F9):** set `CONTACT_EMAIL` in the server's `.env` (see `.env.production.example`); until then, Privacy says "ask Diogo" without a link.
11. **Order of work:** the bugs (F1–F9) first, then the move to `/`, then the R items you keep, then the optional ones.
