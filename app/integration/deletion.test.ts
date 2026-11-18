import pg from "pg";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { deleteAccountData } from "../lib/account-deletion";
import { cleanupMediaJobs } from "../scripts/media-cleanup.mjs";
import { getPool } from "../lib/db";
import { createSpace } from "../lib/spaces";
import { assertTestIsolation } from "../e2e/isolation";

assertTestIsolation();
afterAll(() => getPool().end());
afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const id = randomUUID();
  await getPool().query("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", [
    id,
    `test_${id.replaceAll("-", "").slice(0, 12)}`,
    `${id}@example.test`,
  ]);
  const space = await createSpace(id);
  await mkdir(process.env.AVATAR_DIR!, { recursive: true });
  const file = path.join(process.env.AVATAR_DIR!, `${id}.webp`);
  await writeFile(file, "avatar");
  return { id, space, file };
}

it("a late database deletion failure rolls back membership, space and cleanup job, preserving files", async () => {
  const { id, space, file } = await fixture();
  const original = pg.Client.prototype.query;
  vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (this: pg.Client, ...args: unknown[]) {
    if (String(args[0]) === "DELETE FROM users WHERE id = $1")
      return Promise.reject(new Error("Injected delete failure"));
    return Reflect.apply(original, this, args);
  } as typeof original);
  await expect(deleteAccountData(id)).rejects.toThrow("Injected");
  expect((await getPool().query("SELECT space_id FROM users WHERE id = $1", [id])).rows[0].space_id).toBe(space.id);
  expect((await getPool().query("SELECT id FROM spaces WHERE id = $1", [space.id])).rowCount).toBe(1);
  expect((await getPool().query("SELECT id FROM media_cleanup_jobs WHERE user_id = $1", [id])).rowCount).toBe(0);
  expect(await readFile(file, "utf8")).toBe("avatar");
});

it("filesystem failure after commit leaves a durable job; retry and repeated cleanup are safe", async () => {
  const { id, file } = await fixture();
  // A directory where a file should be makes rm fail on Windows and Linux.
  await rm(file);
  await mkdir(file);
  await deleteAccountData(id);
  expect((await getPool().query("SELECT id FROM users WHERE id = $1", [id])).rowCount).toBe(0);
  expect(
    (await getPool().query("SELECT attempts, last_error FROM media_cleanup_jobs WHERE user_id = $1", [id])).rows[0],
  ).toMatchObject({ attempts: 1, last_error: expect.any(String) });
  await rm(file, { recursive: true });
  expect(await cleanupMediaJobs(getPool())).toBe(0);
  expect(await cleanupMediaJobs(getPool())).toBe(0);
});
