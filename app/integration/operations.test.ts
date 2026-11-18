import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";

it("backup retention protects skipped/failed media and prunes successful categories", () => {
  const root = path.resolve("..");
  const output = execFileSync(
    "docker",
    ["run", "--rm", "-v", `${root}:/repo:ro`, "postgres:16", "bash", "/repo/infra/test-backup.sh"],
    { encoding: "utf8", timeout: 60000, windowsHide: true },
  );
  expect(output).toContain("PASS:");
}, 60000);
