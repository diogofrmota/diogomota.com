import { rm } from "node:fs/promises";
import path from "node:path";

// Where the profile pictures and the recipes' photos are, for lib/avatars.ts
// and lib/recipe-photos.ts too. This file is also the CLI's
// (scripts/cleanup-media.mjs), so it imports nothing from lib/. Outside the
// build's file tracing (turbopackIgnore): they are where files are written
// while the app runs, not a part of the app.
export const avatarDir = () =>
  process.env.AVATAR_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "avatars");
export const recipePhotoDir = () =>
  process.env.RECIPE_PHOTO_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "recipe-photos");

/** @param {import('pg').Pool} pool */
export async function cleanupMediaJobs(pool) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(
      "SELECT * FROM media_cleanup_jobs ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20",
    );
    for (const job of rows) {
      try {
        // A job without a user is a deleted group's recipe photos (lib/recipe-groups.ts):
        // no profile picture goes with them.
        for (const id of job.user_id ? [job.user_id, ...job.photo_ids] : job.photo_ids) {
          if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid media id");
        }
        if (job.user_id) await rm(path.join(avatarDir(), `${job.user_id}.webp`), { force: true });
        for (const id of job.photo_ids)
          for (const suffix of ["", "-thumb"])
            await rm(path.join(recipePhotoDir(), `${id}${suffix}.webp`), { force: true });
        await db.query("DELETE FROM media_cleanup_jobs WHERE id = $1", [job.id]);
      } catch {
        await db.query(
          "UPDATE media_cleanup_jobs SET attempts = attempts + 1, last_error = 'Media removal failed; check storage permissions and retry' WHERE id = $1",
          [job.id],
        );
      }
    }
    await db.query("COMMIT");
    return (await db.query("SELECT count(*)::int AS pending FROM media_cleanup_jobs")).rows[0].pending;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
