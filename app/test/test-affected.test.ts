import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const plan = (file: string) =>
  execFileSync(process.execPath, ["scripts/test-affected.mjs", "--files", file, "--dry-run"], {
    cwd: appDir,
    encoding: "utf8",
    windowsHide: true,
  });

describe("affected tests for shared helpers", () => {
  test.each([
    ["hooks/useDebounced.ts", ["books", "profiles", "shows-discover", "shows-features"]],
    ["components/common/Sheet.tsx", ["recipes", "fitness"]],
    ["lib/write-atomically.ts", ["account", "recipes", "production"]],
    ["lib/offline-notice.ts", ["production"]],
  ])("%s selects its consumers' browser tests", (file, specs) => {
    const output = plan(file);
    for (const spec of specs) expect(output).toContain(`e2e/${spec}.spec.ts`);
  });

  test("the database transaction helper selects the site-wide smoke tests", () => {
    expect(plan("lib/db.ts")).toContain("--grep @smoke");
  });

  test("changing the selector selects its own subprocess regressions", () => {
    expect(plan("scripts/test-affected.mjs")).toContain("unit: test/test-affected.test.ts");
  });
});
