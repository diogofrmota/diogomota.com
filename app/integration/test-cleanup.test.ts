import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getPool } from "../lib/db";
import { createSpace } from "../lib/spaces";
import globalTeardown from "../e2e/global-teardown";
import { assertTestIsolation } from "../e2e/isolation";

assertTestIsolation();
afterAll(() => getPool().end());
it("teardown never treats a preexisting e2e-prefixed account or its space as owned fixtures", async () => {
  const id = randomUUID();
  await getPool().query("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", [
    id,
    `e2e_${id.replaceAll("-", "").slice(0, 12)}`,
    `${id}@example.test`,
  ]);
  const space = await createSpace(id);
  await globalTeardown();
  expect((await getPool().query("SELECT space_id FROM users WHERE id = $1", [id])).rows[0].space_id).toBe(space.id);
  expect((await getPool().query("SELECT id FROM spaces WHERE id = $1", [space.id])).rowCount).toBe(1);
});
