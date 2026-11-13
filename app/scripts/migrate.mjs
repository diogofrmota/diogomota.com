// Applies db/migrations/*.sql in filename order, each inside its own transaction,
// and records every applied file in schema_migrations. Already-applied files are
// skipped, so it is safe to run on every deploy.
//
// Usage: npm run migrate (DATABASE_URL from the environment or app/.env.local).
// MIGRATIONS_DIR overrides the default <repo>/db/migrations; the Docker image sets it.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsDir = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../../db/migrations/", import.meta.url));

// Arbitrary key for pg_advisory_lock, so two runs (e.g. overlapping deploys) never migrate at once.
const LOCK_KEY = 4_021_977;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  if (files.length === 0) {
    throw new Error(`No migrations found in ${migrationsDir}`);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query("SELECT version FROM schema_migrations");
    const applied = new Set(rows.map((row) => row.version));
    const pending = files.filter((file) => !applied.has(file));
    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`Migration ${file} failed; nothing from it was applied.`);
        throw error;
      }
      console.log(`Applied ${file}`);
    }
  } finally {
    // Closing the session also releases the advisory lock.
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
