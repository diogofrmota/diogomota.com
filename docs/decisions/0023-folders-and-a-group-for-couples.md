# 0023 — Home is folders; For Couples is a group of two

**Decided:** 2026-11-21, unreleased. Updates [0006](0006-shared-for-couples.md) (the space), [0014](0014-home-is-the-apps.md) (home, logged in) and [0017](0017-recipes.md) (Recipes was each user's own).

## What

**Home, logged in** (`app/page.tsx`): who is here at the top, in the middle (the profile picture, the name, "(@username)" and **Account settings**, to `/account`), then the apps in three folders in a row, like a phone's: **For Couples** (Calendar, Tasks, Recipes), **Trackers** (Shows, Books) and **Health** (Fitness). A folder is a tile of its apps' small icons with its name under it, and opens in a popup, growing out of the tile, with its apps' icons. The folder open is in the URL (`/?p=folder:couples`, [0003](0003-views-in-the-url.md)): Back closes it, and a link opens it. Each folder counts what is waiting in its apps, and each app in it its own (`lib/badges.ts`). For Couples has a lock in its top right corner, the count beside it; its popup has a gear to the group's settings. The folders are `folders` in `lib/apps.ts`, which the front page's groups read too. The Account icon is gone.

**For Couples is a group of two** ("space" in the code, "group" in what people read): the one who made it and their partner. Joining a group that has both, or making an invite in one, answers 409 "This group is full (2 people).", and its invite links say "This group already has two people." Before there is a group, For Couples' popup, its apps and its settings offer **Create a group** or **Join your partner's group**.

**Three apps and the group's settings:**

- **Calendar** is at `/calendar`, with only the calendar.
- **Tasks**, the task lists that were Calendar's Tasks tab, is an app of its own, at `/tasks`.
- **The group's settings**, which were Calendar's Settings tab (members, inviting your partner while alone, importing calendars, the calendar subscription, recent activity, leaving), are at `/couples`, from the gear.
- The old addresses redirect for good (`next.config.ts`): `/shared` and anything under it to `/calendar`, `/shared/tasks` to `/tasks`, and `/shared/settings` and `/benfica` to `/couples`, their panels (`?p=`) with them.
- The API stays at `/api/shared`; invite links (`/join/<code>`) and calendar subscriptions don't change.
- All three keep Calendar's data in the browser (QueryProvider app `shared`): what waited offline in Calendar before is still sent.

**Recipes is the group's** (`recipes.space_id`, `shopping_items.space_id`, migration 029):

- Both of you see and change the same recipes, photos, favourites and one shopping list. Without a group, Recipes offers one, and its API answers 403, as Calendar's does.
- Recipes kept before, outside a group ("parked"), come into the group when you create or join one (`lib/recipe-groups.ts`, `adoptParked`); your lines of the list go after the group's.
- Leaving keeps them with the group. The last one out deletes them, with their photos' files (a cleanup job without a user, so no profile picture goes with them).
- `user_id` is who added a recipe or a line, and outlives them (`ON DELETE SET NULL`): a partner deleting their account leaves the recipes. An account's parked recipes are deleted with it.

## Why

Home was six icons with nothing to say which belong together, and Calendar was three apps in one: a calendar, task lists and the group's settings, which belong to the group rather than to the calendar. The apps for two are what the site is about, and a couple cooks together as much as they plan together: a shared shopping list is what makes Recipes worth sharing.

A group is two people because For Couples is for a couple; up to ten was never used (0006 said so: the words and the first steps were for a couple already). Two also makes "your partner" true everywhere it is said.

## What it costs

- No flatmates or family in a group, and still one group per person.
- A shopping list merged from two is in the order each was made, one after the other, not by aisle or recipe.
- The apps are a tap further from home, in their folders.
- The URLs changed: old links cost a redirect, and the service worker's cache is new (v3), so the apps open offline again only after one visit with a connection.
- **During the deploy, or after a rollback:**
  - The previous release reads and writes recipes by `user_id`, so its new rows have no group until their user's next request in one adopts them.
  - Rolled back to, it shows each person only the recipes they added, and allows ten in a group again.
- **Later, a contract migration:** recipes and lines left with neither a group nor a user (an account deleted by a release before this one) can be deleted, and `user_id` or `space_id` made required.
