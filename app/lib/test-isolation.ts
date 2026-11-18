import path from "node:path";
import os from "node:os";

/** Only the runner's fresh, loopback-only database and temporary media are accepted. */
export function assertTestIsolation(env: Record<string, string | undefined> = process.env) {
  const run = env.E2E_RUN_ID;
  if (!run || !/^[a-f0-9]{24}$/.test(run)) throw new Error("Use npm run test:e2e: isolated run required.");
  const url = new URL(env.DATABASE_URL ?? "invalid:");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== `/diogomota_test_${run}`)
    throw new Error("Refusing non-test database.");
  const root = path.join(os.tmpdir(), `diogomota-test-${run}`);
  for (const [key, folder] of [
    ["AVATAR_DIR", "avatars"],
    ["RECIPE_PHOTO_DIR", "recipe-photos"],
  ]) {
    if (env[key] !== path.join(root, folder)) throw new Error(`Refusing non-test ${key}.`);
  }
}
