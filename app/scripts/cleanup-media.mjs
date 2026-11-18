import pg from "pg";
import { cleanupMediaJobs } from "./media-cleanup.mjs";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const pending = await cleanupMediaJobs(pool);
  console.log(`Pending media cleanup jobs: ${pending}`);
  if (pending) process.exitCode = 1;
} finally {
  await pool.end();
}
