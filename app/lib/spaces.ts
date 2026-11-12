import "server-only";
import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "./db";
import { memberColors, type Space } from "./space-types";
import { avatarUrlSql, nameSql } from "./users";

export class SpaceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// At this app's small scale one transaction lock keeps all membership changes
// ordered, including joins into different spaces by the same user. Reads also
// take it so authorization and the returned data describe the same membership.
export async function spaceTransaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(804080)");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}

async function membership(db: PoolClient, userId: string): Promise<string | null> {
  const { rows } = await db.query("SELECT space_id FROM users WHERE id = $1", [userId]);
  if (!rows[0]) throw new SpaceError("Please log in again.", 401);
  return rows[0].space_id;
}

export async function readSpace(db: PoolClient, userId: string, id?: string): Promise<Space | null> {
  const current = await membership(db, userId);
  if (id && current !== id) throw new SpaceError("Space not found.", 404);
  if (!current) return null;
  const { rows } = await db.query('SELECT id, created_by AS "ownerId" FROM spaces WHERE id = $1', [current]);
  const members = await db.query(`SELECT id, username, ${avatarUrlSql()} AS "avatarUrl", ${nameSql()}, space_color AS color,
    CASE WHEN id = $2 THEN 'owner' ELSE 'member' END AS role
    FROM users WHERE space_id = $1 ORDER BY space_joined_at, id`, [current, rows[0].ownerId]);
  return { ...rows[0], members: members.rows };
}

async function addMember(db: PoolClient, userId: string, spaceId: string) {
  const { rows } = await db.query("SELECT space_color FROM users WHERE space_id = $1", [spaceId]);
  const color = memberColors.find((color) => !rows.some((row) => row.space_color === color.hex));
  if (!color) throw new SpaceError("This space is full (10 members).", 409);
  await db.query("UPDATE users SET space_id = $2, space_color = $3, space_joined_at = clock_timestamp() WHERE id = $1", [userId, spaceId, color.hex]);
}

// A space has no name (012_unnamed_spaces_profile_pictures.sql): it is its
// members, calendar and task lists.
export async function createSpace(db: PoolClient, userId: string) {
  if (await membership(db, userId)) throw new SpaceError("Leave your current space before creating another.", 409);
  const { rows } = await db.query("INSERT INTO spaces (created_by) VALUES ($1) RETURNING id", [userId]);
  await addMember(db, userId, rows[0].id);
  return readSpace(db, userId);
}

export async function joinSpace(db: PoolClient, userId: string, value: unknown) {
  if (await membership(db, userId)) throw new SpaceError("Leave your current space before joining another.", 409);
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new SpaceError("Invalid invite code. Check the code and try again.");
  const { rows } = await db.query("SELECT *, expires_at <= clock_timestamp() AS expired FROM invites WHERE code = $1", [code]);
  const invite = rows[0];
  if (!invite) throw new SpaceError("Invalid invite code. Check the code and try again.");
  if (invite.used) throw new SpaceError("This invite code has already been used. Ask the owner for a new code.");
  if (invite.expired) throw new SpaceError("This invite code has expired. Ask the owner for a new code.");
  await addMember(db, userId, invite.space_id);
  await db.query("UPDATE invites SET used = true WHERE id = $1", [invite.id]);
  return readSpace(db, userId);
}

export async function manageSpace(db: PoolClient, userId: string, id: string, action: "invite" | "leave") {
  const space = await readSpace(db, userId, id);
  if (!space) throw new SpaceError("Space not found.", 404);
  if (action !== "leave" && space.ownerId !== userId) throw new SpaceError("Only the owner can do that.", 403);
  if (action === "invite") {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (;;) {
      const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
      const result = await db.query(`INSERT INTO invites (space_id, code, expires_at) VALUES ($1, $2, clock_timestamp() + interval '24 hours')
        ON CONFLICT (code) DO NOTHING RETURNING code, expires_at AS "expiresAt"`, [id, code]);
      if (result.rows[0]) return result.rows[0];
    }
  }
  // Remove assignments belonging to the space being left.
  await db.query("DELETE FROM event_assignees WHERE user_id = $1 AND event_id IN (SELECT id FROM events WHERE space_id = $2)", [userId, id]);
  await db.query("UPDATE tasks SET assignee_id = NULL WHERE assignee_id = $1 AND list_id IN (SELECT id FROM task_lists WHERE space_id = $2)", [userId, id]);
  await db.query("UPDATE users SET space_id = NULL, space_color = NULL, space_joined_at = NULL WHERE id = $1", [userId]);
  const next = space.members.find((member) => member.id !== userId);
  if (!next) await db.query("DELETE FROM spaces WHERE id = $1", [id]);
  else if (space.ownerId === userId) {
    await db.query("UPDATE spaces SET created_by = $2 WHERE id = $1", [id, next.id]);
    await db.query("UPDATE invites SET expires_at = clock_timestamp() WHERE space_id = $1 AND NOT used", [id]);
  }
  return null;
}
