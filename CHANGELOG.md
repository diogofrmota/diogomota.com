# Changelog

Each deploy publishes a GitHub Release (`vX.Y.Z`) listing its commits (`.github/workflows/deploy.yml`); this file says what each minor version brought, in words. The detail is in [plan.md](plan.md)'s Build log, the decisions in [docs/decisions/](docs/decisions/).

## Unreleased

- Launcher: Account with the profile picture and Log out in a bottom bar. Both apps lose the top bar and gain Apps in their bottom navigation on mobile and desktop.
- Shared: Month and Agenda only, compact controls, full-width calendar, smaller event text, and no color legend or Today button. Events and tasks select individual people without an All shortcut.
- Tasks: multiple assignees with profile pictures; Extra options groups Who?, Due date, Repeat?, and Notes. Edit replaces Edit lists, and task entry stays above existing tasks.
- Settings: shorter invite copy and Copy link before Add to my calendar.
- Popups retain visible margins and no longer slide up on phones.
- Shows: Recommend to a friend, More like this, then Remove from library without a divider. Poster rows use visible scrollbars instead of arrows. Mobile friends have a centered Check profile; completion counts appear above hours watched.
- Migration 021 adds task assignments while keeping the legacy single-assignee column compatible with older clients and rollbacks.

## v1.2.0 — 2026-11-13

From the review in [report.md](report.md).

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

Profile pictures, names, a cleaner calendar and the Shows guide (plan.md, Build log, 2026-11-11 and 2026-11-12).

## v1.0.0 — 2026-11-02

Launch: the site, Shared and Shows.
