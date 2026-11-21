import "server-only";
import type { PoolClient } from "pg";

// Recipes in a group (docs/decisions/0023): the recipes and the shopping list
// are the group's, as its calendar and tasks are. A user's rows without a
// group ("parked": from before groups had them, from before they were in one,
// or written by a release before this one) come into the group the user is in
// when they create or join one, and on their next Recipes request in it. These
// take the caller's transaction, in which the user's and the group's rows are
// already locked (lib/spaces.ts, Locking), and import neither lib/spaces.ts nor
// lib/recipes.ts, which both use them.

/**
 * One change to a group's shopping list at a time, so its positions and its
 * limit hold. After the user's and the group's row locks, before any row of
 * the list: an advisory lock, as Benfica's import has (lib/events.ts), since
 * the user's row is only share-locked in Recipes' requests.
 */
export async function lockShopping(db: PoolClient, spaceId: string): Promise<void> {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`shopping:${spaceId}`]);
}

/**
 * Brings the user's parked recipes and lines of the list into their group:
 * the recipes as they are, the lines after the group's own, in their order.
 * Nothing to do (nearly always) is one query.
 */
export async function adoptParked(db: PoolClient, userId: string, spaceId: string): Promise<void> {
  const { rows } = await db.query<{ recipes: boolean; shopping: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM recipes WHERE user_id = $1 AND space_id IS NULL) AS recipes,
       EXISTS (SELECT 1 FROM shopping_items WHERE user_id = $1 AND space_id IS NULL) AS shopping`,
    [userId],
  );
  if (rows[0].recipes)
    await db.query("UPDATE recipes SET space_id = $2 WHERE user_id = $1 AND space_id IS NULL", [userId, spaceId]);
  if (rows[0].shopping) {
    await lockShopping(db, spaceId);
    await db.query(
      `WITH top AS (SELECT coalesce(max(position), -1) AS top FROM shopping_items WHERE space_id = $2),
         parked AS (SELECT id, row_number() OVER (ORDER BY position, id) AS n
                    FROM shopping_items WHERE user_id = $1 AND space_id IS NULL)
       UPDATE shopping_items s SET space_id = $2, position = top.top + parked.n
       FROM top, parked WHERE s.id = parked.id`,
      [userId, spaceId],
    );
  }
}

/**
 * Deletes a group's recipes and shopping list, as its last member leaves it,
 * and queues their photos' files for removal (scripts/media-cleanup.mjs) once
 * the transaction is committed: a job without a user, so no profile picture
 * goes with them. Returns whether there were photos, so the caller runs the job.
 */
export async function removeGroupRecipes(db: PoolClient, spaceId: string): Promise<boolean> {
  const photos = await db.query<{ id: string }>(
    "SELECT p.id FROM recipe_photos p JOIN recipes r ON r.id = p.recipe_id WHERE r.space_id = $1",
    [spaceId],
  );
  await db.query("DELETE FROM shopping_items WHERE space_id = $1", [spaceId]);
  await db.query("DELETE FROM recipes WHERE space_id = $1", [spaceId]);
  if (!photos.rows.length) return false;
  await db.query("INSERT INTO media_cleanup_jobs (user_id, photo_ids) VALUES (NULL, $1)", [
    photos.rows.map((photo) => photo.id),
  ]);
  return true;
}
