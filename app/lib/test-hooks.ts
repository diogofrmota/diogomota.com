// Hooks for the e2e tests (e2e/), such as reading the emails the app would have
// sent. On only with E2E_TEST_HOOKS=1, which playwright.config.ts sets for the
// dev server it starts, and never in production.
export function testHooksEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.E2E_TEST_HOOKS === "1";
}
