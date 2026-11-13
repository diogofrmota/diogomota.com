# 0005 — Two themes, Light and Dark

**Decided:** v1.2.0. Replaces six themes (Light mode, Neutral, Warm, Graphite, Ocean, Space).

**Why:** each theme multiplied what had to be checked by eye and by axe, and five migrations had only changed the theme list. Light (Neutral's colors, id `minimal-neutrals`) and Dark (Graphite's, id `graphite`) are the two kept.

**What it is:** `lib/themes.ts` and `themes.module.css`; the database takes any id and the app shows Light for one it doesn't know, so themes come and go without a migration.

**Costs:** accounts on a removed theme moved to the closest (`015`). There is no "match the device" choice yet.
