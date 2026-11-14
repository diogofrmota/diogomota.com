import "server-only";
import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { recordActivity } from "./activity";
import { getPool } from "./db";
import { HttpError } from "./http";
import { memberColors, type Invite, type InvitePreview, type Space } from "./space-types";
import { avatarUrlSql } from "./users";

/**
 * Runs `fn` in a transaction, committed when it returns and rolled back when it
 * throws.
 */
export async function transaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

// Locking. Every Shared request locks the rows it depends on, always the user's
// row before the space's, so two requests can't wait on each other:
//
// - Reading and changing a space's calendar and tasks share the locks (FOR SHARE):
//   members of a space work at the same time, and other spaces are never in the way.
// - Joining, leaving and creating a space take them alone (FOR UPDATE): the
//   member list, their colors and the owner change, so they wait for the space's
//   other requests to finish, and those wait for them. A member can't leave
//   halfway through a request that assigns them something, and two people can't
//   take the last place or the same color.

/** The user's space, or null; the user's row is locked `mode` until the end of the transaction. */
async function spaceIdOf(db: PoolClient, userId: string, mode: "SHARE" | "UPDATE"): Promise<string | null> {
  const { rows } = await db.query(`SELECT space_id FROM users WHERE id = $1 FOR ${mode}`, [userId]);
  if (!rows[0]) throw new HttpError("Please log in again.", 401);
  return rows[0].space_id;
}

/** The space and its members; the space's row is locked `mode`. */
async function loadSpace(db: PoolClient, spaceId: string, mode: "SHARE" | "UPDATE"): Promise<Space> {
  const { rows } = await db.query(`SELECT id, created_by AS "ownerId" FROM spaces WHERE id = $1 FOR ${mode}`, [
    spaceId,
  ]);
  const members = await db.query(
    `SELECT id, username, ${avatarUrlSql()} AS "avatarUrl", name, space_color AS color,
       CASE WHEN id = $2 THEN 'owner' ELSE 'member' END AS role
     FROM users WHERE space_id = $1 ORDER BY space_joined_at, id`,
    [spaceId, rows[0].ownerId],
  );
  return { ...rows[0], members: members.rows };
}

/**
 * Runs `fn` with the user's space, its rows shared-locked for the transaction
 * (see Locking). Without a space: 403.
 */
export function inSpace<T>(userId: string, fn: (db: PoolClient, space: Space) => Promise<T>): Promise<T> {
  return transaction(async (db) => {
    const spaceId = await spaceIdOf(db, userId, "SHARE");
    if (!spaceId) throw new HttpError("Join or create a space first.", 403);
    return fn(db, await loadSpace(db, spaceId, "SHARE"));
  });
}

/** The user's space, or null without one; with `id`, 404 unless it is that one. */
export function readSpace(userId: string, id?: string): Promise<Space | null> {
  return transaction(async (db) => {
    const spaceId = await spaceIdOf(db, userId, "SHARE");
    if (id && spaceId !== id) throw new HttpError("Space not found.", 404);
    return spaceId ? loadSpace(db, spaceId, "SHARE") : null;
  });
}

async function addMember(db: PoolClient, userId: string, spaceId: string) {
  const { rows } = await db.query("SELECT space_color FROM users WHERE space_id = $1", [spaceId]);
  const color = memberColors.find((color) => !rows.some((row) => row.space_color === color.hex));
  if (!color) throw new HttpError("This space is full (10 members).", 409);
  await db.query(
    "UPDATE users SET space_id = $2, space_color = $3, space_joined_at = clock_timestamp() WHERE id = $1",
    [userId, spaceId, color.hex],
  );
}

// A space has no name (012_unnamed_spaces_profile_pictures.sql): it is its
// members, calendar and task lists.
export function createSpace(userId: string): Promise<Space> {
  return transaction(async (db) => {
    if (await spaceIdOf(db, userId, "UPDATE"))
      throw new HttpError("Leave your current space before creating another.", 409);
    const { rows } = await db.query("INSERT INTO spaces (created_by) VALUES ($1) RETURNING id", [userId]);
    await addMember(db, userId, rows[0].id);
    return loadSpace(db, rows[0].id, "UPDATE");
  });
}

/** Joins the space of an invite code, which is then used up. */
export function joinSpace(userId: string, code: string): Promise<Space> {
  return transaction(async (db) => {
    if (await spaceIdOf(db, userId, "UPDATE"))
      throw new HttpError("Leave your current space before joining another.", 409);
    const { rows } = await db.query(
      "SELECT *, expires_at <= clock_timestamp() AS expired FROM invites WHERE code = $1 FOR UPDATE",
      [code],
    );
    const invite = rows[0];
    if (!invite) throw new HttpError("Invalid invite code. Check the code and try again.");
    if (invite.used) throw new HttpError("This invite code has already been used. Ask for a new one.");
    if (invite.expired) throw new HttpError("This invite code has expired. Ask for a new one.");
    await db.query("SELECT 1 FROM spaces WHERE id = $1 FOR UPDATE", [invite.space_id]);
    await addMember(db, userId, invite.space_id);
    await db.query("UPDATE invites SET used = true WHERE id = $1", [invite.id]);
    await recordActivity(db, { userId, spaceId: invite.space_id, kind: "joined" });
    return loadSpace(db, invite.space_id, "UPDATE");
  });
}

/**
 * What an invite link's page shows before joining: who sent it, and whether it
 * still works. Null for a code nobody made.
 */
export async function previewInvite(code: string): Promise<InvitePreview | null> {
  const { rows } = await getPool().query(
    `SELECT u.name, u.username, i.used, i.expires_at <= clock_timestamp() AS expired,
       (SELECT count(*) FROM users m WHERE m.space_id = i.space_id)::int AS members
     FROM invites i LEFT JOIN users u ON u.id = i.created_by WHERE i.code = $1`,
    [code],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    from: row.username ? { name: row.name, username: row.username } : null,
    members: row.members,
    state: row.used ? "used" : row.expired ? "expired" : row.members === 0 ? "gone" : "open",
  };
}

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A new single-use invite code, valid for 24 hours. Any member can make one. */
export function createInvite(userId: string, spaceId: string): Promise<Invite> {
  return transaction(async (db) => {
    // Another space's (or none): 404, whether or not the user has a space.
    if ((await spaceIdOf(db, userId, "SHARE")) !== spaceId) throw new HttpError("Space not found.", 404);
    await db.query("SELECT 1 FROM spaces WHERE id = $1 FOR SHARE", [spaceId]);
    for (;;) {
      const code = Array.from({ length: 8 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join("");
      const result = await db.query(
        `INSERT INTO invites (space_id, code, expires_at, created_by)
         VALUES ($1, $2, clock_timestamp() + interval '24 hours', $3)
         ON CONFLICT (code) DO NOTHING RETURNING code, expires_at AS "expiresAt"`,
        [spaceId, code, userId],
      );
      if (result.rows[0]) return result.rows[0];
    }
  });
}

// Leaves the space, with the user's and the space's rows locked: their
// assignments there go, the space goes with its last member, and otherwise an
// owner hands it on to the member who joined first (their outstanding invites
// stop working).
async function leave(db: PoolClient, userId: string, space: Space) {
  await db.query(
    "DELETE FROM task_assignees WHERE user_id = $1 AND task_id IN (SELECT t.id FROM tasks t JOIN task_lists l ON l.id = t.list_id WHERE l.space_id = $2)",
    [userId, space.id],
  );
  await db.query(
    "DELETE FROM event_assignees WHERE user_id = $1 AND event_id IN (SELECT id FROM events WHERE space_id = $2)",
    [userId, space.id],
  );
  await db.query(
    "UPDATE tasks SET assignee_id = NULL WHERE assignee_id = $1 AND list_id IN (SELECT id FROM task_lists WHERE space_id = $2)",
    [userId, space.id],
  );
  await db.query("UPDATE users SET space_id = NULL, space_color = NULL, space_joined_at = NULL WHERE id = $1", [
    userId,
  ]);
  const next = space.members.find((member) => member.id !== userId);
  if (!next) {
    await db.query("DELETE FROM spaces WHERE id = $1", [space.id]);
    return;
  }
  if (space.ownerId === userId) {
    await db.query("UPDATE spaces SET created_by = $2 WHERE id = $1", [space.id, next.id]);
  }
  await recordActivity(db, { userId, spaceId: space.id, kind: "left" });
}

/** Leaves the space `spaceId` (404 unless it is the user's). */
export function leaveSpace(userId: string, spaceId: string): Promise<null> {
  return transaction(async (db) => {
    if ((await spaceIdOf(db, userId, "UPDATE")) !== spaceId) throw new HttpError("Space not found.", 404);
    await leave(db, userId, await loadSpace(db, spaceId, "UPDATE"));
    return null;
  });
}

/** Leaves whatever space the user is in, if any (deleting an account). */
export function leaveSpaceOf(userId: string): Promise<void> {
  return transaction(async (db) => {
    const spaceId = await spaceIdOf(db, userId, "UPDATE");
    if (spaceId) await leave(db, userId, await loadSpace(db, spaceId, "UPDATE"));
  });
}
