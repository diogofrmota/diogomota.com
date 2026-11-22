# 0024 — A top bar with ‹ Home; tabs only for an app's own views

**Decided:** 2026-11-22, unreleased, from a review of how you move around the site as a web app on an iPhone. Updates [0008](0008-tabs-at-the-bottom-on-phones.md) (the tab bar) and [0014](0014-home-is-the-apps.md) (Home, then Apps, as the last tab).

## What

**A top bar** (`TopBar` in `components/common/HeaderTabs.tsx`, from `AppFrame`) on every page in the apps' frame except home logged in and the error page (`bare`):

- **‹ Home** on the left, to `/`: logged in, the profile and the folders; logged out, the front page.
- The **app's name** in the middle, in an app. The pages around the apps (Account, the group's settings, Privacy, Report a bug, the login pages, an invite, the 404) have none: their heading is just under it.
- The user's **picture** on the right, named Account, to `/account`. It is left out on `/account` itself, and when logged out.
- On a **friend's profile** (`/shows/profile/<id>`, `/books/profile/<id>`), **‹ Back** instead of ‹ Home. It goes back in the history when the profile was opened from another page of the site, and to your own profile in that app (`/shows/profile`, `/books/profile`) when the page was loaded there (a link from elsewhere, a reload).

**The tab bar has only an app's own views**, and only when it has more than one: Library · Discover · Profile in Shows and Books, Recipes · Favourites · Shopping in Recipes, Today · Workouts · Progress in Fitness. **Apps** is gone from it. Calendar and Tasks, with one view each, have no tab bar, and neither do For Couples' apps before there is a group. The pages around the apps have no tab bar either. Logged out, Log in and Sign up are no longer tabs: the two pages link to each other.

**On a phone** the top bar is sticky at the top, 48 px plus the safe area, and the tabs stay fixed along the bottom (`--bottom-bar` is 0 without them). **From 48rem** it is one header: ‹ Home and the app's name on the left, the tabs in the middle, Account on the right. There is no >_ mark in it: that is the website's (`SiteHeader`).

## Why

Added to an iPhone's home screen, the site has no browser bar and no Back, so the bars are the only way around, and they didn't make sense:

- **Apps** was the last tab of every app. It looked like one of the app's views, but it left the app for home, which is your profile and folders, not a list of apps.
- **Calendar** and **Tasks** showed "Calendar · Apps": a tab for the only view, which did nothing.
- `/account` and For Couples' apps before a group showed "Apps" alone.
- Logged out, "Apps" went to the front page, the website.
- **On a computer** the bar had no name for the app you were in, and no Account.
- From a friend's profile there was no way back to where you had opened it.

Going back up to home is what a phone app's back does, top left. You do it less often than you switch tabs, so the top of the screen is fine for it (the reason for [0008](0008-tabs-at-the-bottom-on-phones.md) still holds for the tabs).

## What it costs

- 48 px at the top of a phone's screen in every app. Calendar and Tasks get back the 60 px of the tab bar they no longer have.
- Switching from one app to another is still through home: ‹ Home, the folder, the app.
- `TopBar` holds the tab bar as well, so on a phone a fixed element sits inside a sticky one. Nothing on the top bar may become its containing block: no transform, filter or backdrop-filter.
- ‹ Back on a friend's profile decides by whether the page was the one the browser loaded (`performance.getEntriesByType("navigation")`). After going back to that profile with the browser, it goes to your profile instead of further back.
