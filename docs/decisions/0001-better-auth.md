# 0001 — Accounts on Better Auth, on the site's own tables

**Decided:** v1.2.0, 2026-11-13. Replaces Auth.js (`next-auth@5.0.0-beta.32`, credentials, a JWT cookie).

**Why:** Auth.js v5 never left beta and is now maintained by the Better Auth team, who point new projects to Better Auth. The site needed what Better Auth ships: confirming an email, changing it through a link, deleting an account, and sessions that can be ended (a JWT can't, short of a password change).

**What it is:** `app/auth.ts`, mapped onto `users` (with the username plugin), `accounts` (the bcrypt hashes, so every existing password works), `sessions` (read on every request) and `verifications` (reset tokens, hashed). The forms stay server actions with the site's own validation and rate limits; Better Auth's same endpoints over HTTP are switched off (`disabledPaths`).

**Costs:** moving logged everyone out once. Better Auth checks the schema when it starts, so every column it doesn't write must be nullable or have a default. `users.password_hash` is kept in step by a trigger until the contract migration, so a rollback to an Auth.js image still works.
