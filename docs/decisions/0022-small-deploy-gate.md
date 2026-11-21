# 0022 - A small deploy gate; the rest of the tests run for what a change touches

**Decided:** 2026-11-21. Updates [0021](0021-offline-durability-and-test-isolation.md)'s main gate; the test isolation it describes stays as it is.

## What

A deploy waits for a few checks, not for every test. [ci.yml](../../.github/workflows/ci.yml) runs three jobs side by side: formatting, lint, typecheck, the migration rule and the unit tests; the integration tests; and the Playwright tests tagged `@smoke`, on a production build. [deploy.yml](../../.github/workflows/deploy.yml) builds and scans the image while they run, and pushes it only once they pass.

The `@smoke` tests are about thirty: signing up, logging in and out, and the redirects of a logged-out visitor; a password reset; deleting an account; every app's tabs; the walks through every view of every app ([views.spec.ts](../../app/e2e/views.spec.ts), with axe); each app's API refusing other accounts' data, and spaces' and the calendar's isolation; inviting and joining; the health check; and all of `production.spec.ts` (offline journals, the service worker, upload limits through nginx).

The rest run where the change is made. `npm run test:affected` ([scripts/test-affected.mjs](../../app/scripts/test-affected.mjs)) runs only what the uncommitted change can break, fastest first, and stops at the first stage that fails: Prettier and ESLint on the changed files and the typecheck; the unit and integration tests that import a changed file, however deeply; then the Playwright specs of the parts of the site that changed (a table in the script maps files to specs), with the phone's walk for a change to how things look. A change to what everything uses (the database layer, the config, a migration, the fixtures) runs the `@smoke` tests. All of it still runs with `npm run test:e2e`, or in Actions with CI's `e2e: all`.

## Why

Every push to main ran the whole suite, about 190 browser tests, before the image was even built: 15 minutes of checks and 21 to a deploy, for a site with about ten users. Most of those tests are about one app or one dialog, and a change to Recipes can't break Books' quick actions. Local runs had the same problem the other way round: picking specs by hand meant either too few or the whole suite.

Fewer tests overall, too, without testing less. Tests that each signed up an account to check one thing were folded into the test next door (Open on the front page, five times; the logged-out redirects, in five files; the theme, saved and served, in three). axe ran the same pages twice, on the phone and on the desktop, and a second time in `themes.spec.ts`; it now runs once per view, on the desktop, in every theme. The suite went from 188 tests to 142.

What made each test slow is cheaper too. With test hooks on, passwords are hashed at bcrypt's minimum cost (lib/password.ts): a run signs up hundreds of accounts on one server. CI runs the browser tests against a production build, with nothing to compile on first use, and more workers. The longest tests are handed out first (playwright.config.ts), so they don't finish last.

## What it costs

A regression in a part of the site that no `@smoke` test touches reaches production unless `npm run test:affected` caught it where it was made. The map from files to specs is kept by hand: a new app or folder needs its line in it (an unclaimed file runs the `@smoke` tests). The production build that CI tests is the e2e one (its own `distDir`, no typecheck: the check job has it), not the image itself, which is built separately.
