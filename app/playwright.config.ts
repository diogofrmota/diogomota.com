import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Every sign-up and login runs bcrypt (~0.3 s each, on the one dev server
  // shared by all workers), and the dev server compiles routes on first use, so
  // auth flows need longer than the 5 s / 30 s defaults.
  timeout: 60_000,
  expect: { timeout: 15_000 },
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
  // E2E_TEST_HOOKS keeps emails in memory for the tests instead of sending them
  // (lib/email.ts). A dev server you started yourself is reused, so start it with
  // E2E_TEST_HOOKS=1 too, or the password reset tests fail before sending anything.
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: { E2E_TEST_HOOKS: "1" },
  },
});
