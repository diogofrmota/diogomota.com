# 0006 — Shared is for couples; one space per user

**Decided:** v1.0.0; the wording for couples, v1.2.0.

**Why:** Shared is a calendar and task lists for the two people in a home. Up to 10 can join (flatmates, family), but the words, the first-run invite and the welcome are for a couple.

**What it is:** `users.space_id` holds one space per user. Any member invites (a single-use link for 24 hours); the owner only decides who inherits the space.

**Costs:** someone with a partner and flatmates can't be in both; a `space_members` table would be the change, best made while there is little data.

**Update, 2026-11-21:** the app is called Calendar now (what people look for on the front page and on home); its address is still `/shared`, as are its API (`/api/shared`), its subscription feed and invite links, so nothing that was bookmarked, subscribed to or shared breaks.

**Update, 2026-11-21 (later):** a space is a **group of two** now ([0023](0023-folders-and-a-group-for-couples.md)): joining a full one, or inviting into it, is refused. It is called a group in everything people read, and holds For Couples' three apps: Calendar (`/calendar`), Tasks (`/tasks`, Calendar's Tasks tab before) and Recipes, with its settings at `/couples`. `/shared` redirects; the API, the invite links and the subscription feed keep their addresses.
