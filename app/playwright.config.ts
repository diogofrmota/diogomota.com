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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalTeardown: "./e2e/global-teardown.ts",
  // Needs the docker compose database running and DATABASE_URL in .env.local.
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
