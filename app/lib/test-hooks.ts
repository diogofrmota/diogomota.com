// Hooks for the e2e tests (e2e/), such as reading the emails the app would have
// sent. On only with E2E_TEST_HOOKS=1, which playwright.config.ts sets for the
// server it starts. A production build permits them only with the same explicit
// disposable database/media isolation and a loopback authentication URL.
import { assertTestIsolation } from "./test-isolation";

export function testHooksEnabled(): boolean {
  if (process.env.E2E_TEST_HOOKS !== "1") return false;
  try {
    assertTestIsolation();
    return ["localhost", "127.0.0.1"].includes(new URL(process.env.AUTH_URL ?? "invalid:").hostname);
  } catch {
    return false;
  }
}
