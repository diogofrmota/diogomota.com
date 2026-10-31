import { Pool, type QueryResult, type QueryResultRow } from "pg";

// Reuse one pool across dev hot reloads instead of opening a new one per reload.
const globalForDb = globalThis as typeof globalThis & { pgPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  // Without a listener, an error on an idle client (e.g. Postgres restart) crashes the process.
  pool.on("error", (error) => {
    console.error("Unexpected error on idle Postgres client", error);
  });
  return pool;
}

// Created lazily so importing this module never needs a database (e.g. during `next build`).
export function getPool(): Pool {
  globalForDb.pgPool ??= createPool();
  return globalForDb.pgPool;
}

// Parameterised query: pass values as $1, $2, ... never interpolate them into `text`.
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}
