import "server-only";
import { getPool } from "./db";
import { leaveSpaceInTransaction, transaction } from "./spaces";
import { cleanupMediaJobs } from "../scripts/media-cleanup.mjs";

/** Called only after the account action's session and password checks. */
export async function deleteAccountData(userId: string) {
  await transaction(async (db) => {
    await db.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const photos = await db.query<{ id: string }>(
      "SELECT p.id FROM recipe_photos p JOIN recipes r ON r.id = p.recipe_id WHERE r.user_id = $1",
      [userId],
    );
    await db.query("INSERT INTO media_cleanup_jobs (user_id, photo_ids) VALUES ($1, $2)", [
      userId,
      photos.rows.map((photo) => photo.id),
    ]);
    await leaveSpaceInTransaction(db, userId);
    // Auth tables and all personal data use the existing ON DELETE cascades.
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
  });
  // Files cannot join the database transaction. Failure leaves a durable,
  // retryable job; it never makes a successful deletion appear to have failed.
  await cleanupMediaJobs(getPool()).catch(() => console.error("Media cleanup deferred; retry pending jobs."));
}
