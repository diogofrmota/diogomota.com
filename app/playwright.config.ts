import { defineConfig, devices } from "@playwright/test";

// The tests' own dev server, on a port of its own (not 3000, where `npm run dev`
// runs). scripts/stop-e2e-server.mjs knows it by this port.
const port = 3100;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Every test talks to one dev server, which compiles each route on first use
  // and hashes every sign-up's password: more workers only queue up there, and
  // tests time out waiting. Two are as fast as four on this suite, and steady.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Every sign-up and login runs bcrypt (~0.3 s each, on the one dev server
  // shared by all workers), and the dev server compiles routes on first use, so
  // auth flows need longer than the 5 s / 30 s defaults.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // A run that hangs (a server that stops answering) ends rather than going on forever.
  globalTimeout: 30 * 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  // Every test runs on both. Tests that set their own viewport run the same way on
  // each; the few that need a mouse, or a touch screen, skip the other project.
  // The phone is an iPhone 13 (its whole 390x844 screen, touch input), in
  // Chromium, the browser the tests install.
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
  globalTeardown: "./e2e/global-teardown.ts",
  // Needs the docker compose database running and DATABASE_URL in .env.local.
  // Every run starts its own dev server with E2E_TEST_HOOKS=1 (emails kept in
  // memory, the fake TMDB: lib/test-hooks.ts) and stops it when the run ends.
  // None is ever reused, so no run gets a server left over from another, or one
  // without the hooks. Next runs one dev server per folder: stop your own
  // `npm run dev` before running the tests. `npm run test:e2e` first stops a
  // server left by a run that didn't finish (scripts/stop-e2e-server.mjs).
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    env: { E2E_TEST_HOOKS: "1", DATABASE_POOL_MAX: "20" },
    timeout: 120_000,
  },
});
