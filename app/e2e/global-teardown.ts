import { existsSync } from "node:fs";
import pg from "pg";

// Deletes the accounts the tests created (usernames starting with "e2e_"), so the
// local database doesn't fill up with them.
export default async function globalTeardown() {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(String.raw`DELETE FROM users WHERE username LIKE 'e2e\_%'`);
  } finally {
    await client.end();
  }
}
