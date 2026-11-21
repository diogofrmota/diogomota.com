import { defineConfig, devices } from "@playwright/test";
import { assertTestIsolation } from "./e2e/isolation";

assertTestIsolation();

// The tests' own server, on a port of its own (not 3000, where `npm run dev`
// runs). scripts/run-e2e.mjs knows it by this port.
const port = 3100;
const baseURL = `http://localhost:${port}`;
// `npm run test:e2e -- --production`: a production build instead of `next dev`
// (scripts/run-e2e.mjs builds it). CI runs this way: no route waits to compile.
const production = process.env.E2E_PRODUCTION === "1";
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } };
const phone = { ...devices["iPhone 13"], browserName: "chromium" as const, viewport: { width: 390, height: 844 } };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Every test talks to one server. A dev server compiles each route on first
  // use, so more than two workers only queue up there (with three, logins time
  // out); a production build has nothing to compile and keeps four busy.
  // Passwords are cheap to hash with test hooks on (lib/password.ts), so
  // sign-ups don't hold the server up either. E2E_WORKERS overrides it.
  workers: Number(process.env.E2E_WORKERS) || (production ? 4 : 2),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // In CI, annotations on the run plus an HTML report, kept when a run fails (.github/workflows/ci.yml).
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // The dev server compiles routes on first use, so flows need longer than the
  // 5 s / 30 s defaults there.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // A run that hangs (a server that stops answering) ends rather than going on forever.
  // (scripts/run-e2e.mjs stops Playwright if it's still going a few minutes
  // past this: change both together.)
  globalTimeout: 30 * 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    // The apps' entrance animations (cards fading in, dialogs sliding up, views
    // sliding in) all stop with reduced motion, so axe never sees something
    // half faded in, nor a test measures a sheet halfway up.
    reducedMotion: "reduce",
    // A production build registers the service worker (OfflineSupport.tsx),
    // which would answer requests that tests route or count. Only
    // production.spec.ts, which tests it, lets it register.
    serviceWorkers: production ? "block" : "allow",
  },
  // Every test runs on the desktop. The phone runs only views.spec.ts, the walk
  // through every view and dialog at a phone's size (tap targets, the home
  // indicator): most tests are about what the app does, which doesn't change
  // with the screen, and the ones about phones (touch, bottom sheets, narrow
  // screens) set a phone's screen and touch themselves. The phone is an iPhone
  // 13 (its whole 390x844 screen, touch input), in Chromium, the browser the
  // tests install.
  //
  // Tests tagged @smoke are the few that CI runs (.github/workflows/ci.yml):
  // signing up and in, every app's views, and what keeps each account's data
  // its own. `npm run test:affected` picks the specs a change touches.
  //
  // Longest first: Playwright hands tests out in the projects' order, then the
  // files' (A to Z) and the tests' own, and views.spec.ts's walks are the
  // longest tests, so started last they'd be the run's tail. Its desktop
  // project is "desktop" too: --project=desktop picks both.
  projects: [
    { name: "desktop", testMatch: "views.spec.ts", use: desktop },
    { name: "mobile", testMatch: "views.spec.ts", use: phone },
    { name: "desktop", testIgnore: "views.spec.ts", use: desktop },
  ],
  globalTeardown: "./e2e/global-teardown.ts",
  // scripts/run-e2e.mjs provisions its own fresh database and media root.
  // Every run starts its own server with E2E_TEST_HOOKS=1 (emails kept in
  // memory, the fake TMDB: lib/test-hooks.ts) and stops it when the run ends.
  // None is ever reused, so no run gets a server left over from another, or one
  // without the hooks. Next runs one dev server per folder: stop your own
  // `npm run dev` before running the tests. Run them with `npm run test:e2e`
  // (scripts/run-e2e.mjs), which stops whatever an earlier run left running
  // before it starts, and whatever this one leaves when it ends.
  webServer: {
    command: production ? "node .next-e2e-production/standalone/server.js" : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    // AUTH_URL: the links in emails (confirming an email, a password reset) are to this server.
    // CONTACT_EMAIL: /about's Get in touch form is there, whatever .env.local says (e2e/about.spec.ts).
    env: {
      E2E_TEST_HOOKS: "1",
      DATABASE_POOL_MAX: "20",
      AUTH_URL: baseURL,
      CONTACT_EMAIL: "contact@example.com",
      PORT: String(port),
      HOSTNAME: "0.0.0.0",
    },
    timeout: 120_000,
  },
});
