import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { assertTestIsolation } from "../lib/test-isolation";

describe("destructive test isolation", () => {
  const run = "1234567890abcdef12345678";
  const root = path.join(os.tmpdir(), `diogomota-test-${run}`);
  const env = {
    E2E_RUN_ID: run,
    DATABASE_URL: `postgresql://test:secret@127.0.0.1:54321/diogomota_test_${run}`,
    AVATAR_DIR: path.join(root, "avatars"),
    RECIPE_PHOTO_DIR: path.join(root, "recipe-photos"),
  };
  it("requires explicit isolated resources even when an application URL is available", () => {
    expect(() => assertTestIsolation({ DATABASE_URL: "postgresql://localhost/diogomota" })).toThrow();
    expect(() => assertTestIsolation({ ...env, DATABASE_URL: "postgresql://localhost/diogomota" })).toThrow();
    expect(() =>
      assertTestIsolation({ ...env, DATABASE_URL: env.DATABASE_URL.replace("127.0.0.1", "production.example") }),
    ).toThrow();
  });
  it("rejects ordinary and other runs' media directories", () => {
    expect(() => assertTestIsolation({ ...env, AVATAR_DIR: "data/avatars" })).toThrow();
    expect(() =>
      assertTestIsolation({ ...env, RECIPE_PHOTO_DIR: path.join(root + "other", "recipe-photos") }),
    ).toThrow();
    expect(() => assertTestIsolation(env)).not.toThrow();
  });
});
