import pg from "pg";
import { assertTestIsolation } from "./isolation";

// Runs only against the runner's explicit disposable database. No .env fallback.
export async function withDatabase<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  assertTestIsolation();

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
