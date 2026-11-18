import { assertTestIsolation } from "./isolation";

// The runner removes its fresh container and media root. Never delete records
// by username prefix in a preexisting database.
export default async function globalTeardown() {
  assertTestIsolation();
}
