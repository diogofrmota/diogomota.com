import { existsSync } from "node:fs";
import pg from "pg";

// Runs `fn` with a connection to the app's database: DATABASE_URL, read from
// .env.local when it isn't in the environment.
export async function withDatabase<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");

  // Bounded, so a database that doesn't answer fails the test (or the teardown)
  // instead of holding up the run.
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    query_timeout: 60_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
