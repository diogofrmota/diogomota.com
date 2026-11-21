import "server-only";
import { getPool } from "./db";
import { leaveSpaceInTransaction, transaction } from "./spaces";
import { cleanupMediaJobs } from "../scripts/media-cleanup.mjs";

/** Called only after the account action's session and password checks. */
export async function deleteAccountData(userId: string) {
  await transaction(async (db) => {
    await db.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    // The recipes and lines of the list they kept outside a group go with them;
    // a group's stay with it (with no one who added them) while their partner
    // is in it, and go with it when they were its last member (leave, lib/spaces.ts).
    const photos = await db.query<{ id: string }>(
      "SELECT p.id FROM recipe_photos p JOIN recipes r ON r.id = p.recipe_id WHERE r.user_id = $1 AND r.space_id IS NULL",
      [userId],
    );
    await db.query("DELETE FROM shopping_items WHERE user_id = $1 AND space_id IS NULL", [userId]);
    await db.query("DELETE FROM recipes WHERE user_id = $1 AND space_id IS NULL", [userId]);
    await db.query("INSERT INTO media_cleanup_jobs (user_id, photo_ids) VALUES ($1, $2)", [
      userId,
      photos.rows.map((photo) => photo.id),
    ]);
    await leaveSpaceInTransaction(db, userId);
    // Auth tables and all other personal data use the existing ON DELETE cascades.
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
  });
  // Files cannot join the database transaction. Failure leaves a durable,
  // retryable job; it never makes a successful deletion appear to have failed.
  await cleanupMediaJobs(getPool()).catch(() => console.error("Media cleanup deferred; retry pending jobs."));
}
