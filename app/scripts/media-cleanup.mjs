import { rm } from "node:fs/promises";
import path from "node:path";

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
        const avatarDir = process.env.AVATAR_DIR || path.join(process.cwd(), "data", "avatars");
        const photoDir = process.env.RECIPE_PHOTO_DIR || path.join(process.cwd(), "data", "recipe-photos");
        for (const id of [job.user_id, ...job.photo_ids]) {
          if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid media id");
        }
        await rm(path.join(avatarDir, `${job.user_id}.webp`), { force: true });
        for (const id of job.photo_ids)
          for (const suffix of ["", "-thumb"]) await rm(path.join(photoDir, `${id}${suffix}.webp`), { force: true });
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
