# 0004 — Migrations expand, then contract a release later

**Decided:** v1.2.0, from migration `015`.

**Why:** `deploy.sh` runs a release's migrations while the previous release still serves, and a rollback runs an older image on the current schema. `012` and `014` dropped columns the previous image read, which broke both.

**What it is:** a migration only adds what its release needs. Dropping or renaming a column or table, changing a type or adding NOT NULL waits for a later release, with `-- contract: <what>, unread since vX.Y.Z`. `scripts/check-migrations.mjs` (in CI) refuses one that doesn't.

**Costs:** unused columns stay for a release (now `events.notes`, `users.password_hash`, `password_changed_at`, `password_resets`, `user_shows.rating`), and someone has to write the contract migration (plan.md, To-do).
