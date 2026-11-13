import "server-only";
import type { PoolClient } from "pg";
import type { ActivityData, ActivityItem, ActivityKind } from "./activity-types";
import { getPool } from "./db";
import { avatarUrlSql } from "./users";

/** How long activity is kept. */
const keepFor = "60 days";
/** A change to the same thing within this long replaces the earlier one, so editing an event five times shows once. */
const mergeWithin = "30 minutes";

type Record_<Kind extends ActivityKind> = {
  userId: string;
  kind: Kind;
  spaceId?: string;
  showId?: string;
  /** What it is about (an event's id, say): with `mergeWithin`, one line per thing. */
  key?: string;
} & (ActivityData[Kind] extends Record<string, never> ? { data?: ActivityData[Kind] } : { data: ActivityData[Kind] });

/**
 * Records what a user did, in their space's feed (spaceId) or their friends'
 * (showId). Inside the transaction of the change when `db` is given, so it is
 * only there if the change is.
 */
export async function recordActivity<Kind extends ActivityKind>(
  db: PoolClient | null,
  { userId, kind, spaceId, showId, key, data }: Record_<Kind>,
): Promise<void> {
  const client = db ?? getPool();
  const stored = { ...(data ?? {}), ...(key ? { key } : {}) };
  if (key) {
    await client.query(
      `DELETE FROM activity WHERE user_id = $1 AND data->>'key' = $2
         AND created_at > now() - interval '${mergeWithin}'`,
      [userId, key],
    );
  }
  await client.query("INSERT INTO activity (user_id, space_id, show_id, kind, data) VALUES ($1, $2, $3, $4, $5)", [
    userId,
    spaceId ?? null,
    showId ?? null,
    kind,
    stored,
  ]);
  // Now and then, what is older than keepFor goes.
  if (Math.random() < 0.02) await client.query(`DELETE FROM activity WHERE created_at < now() - interval '${keepFor}'`);
}

/** Forgets the activity about one thing, e.g. a task added and then deleted within a moment. */
export async function forgetActivity(db: PoolClient, userId: string, key: string): Promise<void> {
  await db.query(
    `DELETE FROM activity WHERE user_id = $1 AND data->>'key' = $2 AND created_at > now() - interval '${mergeWithin}'`,
    [userId, key],
  );
}

const itemColumns = `a.id, a.kind, a.data - 'key' AS data, a.created_at AS "createdAt",
  json_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatarUrl', ${avatarUrlSql("u")}) AS person,
  CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object('type', s.type, 'tmdbId', s.tmdb_id, 'title', s.title,
    'year', s.year, 'posterPath', s.poster_url, 'rating', s.vote_average::float8) END AS title`;

type Row = Omit<ActivityItem, "createdAt"> & { createdAt: Date };
const toItems = (rows: Row[]) =>
  rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }) as ActivityItem);

/** A space's latest activity, newest first. */
export async function spaceActivity(db: PoolClient, spaceId: string, limit = 30): Promise<ActivityItem[]> {
  const { rows } = await db.query<Row>(
    `SELECT ${itemColumns} FROM activity a JOIN users u ON u.id = a.user_id LEFT JOIN shows s ON s.id = a.show_id
     WHERE a.space_id = $1 AND a.created_at > now() - interval '${keepFor}'
     ORDER BY a.created_at DESC, a.id LIMIT $2`,
    [spaceId, limit],
  );
  return toItems(rows);
}

/** What the user's accepted friends did in Shows lately, newest first. */
export async function friendsActivity(userId: string, limit = 30): Promise<ActivityItem[]> {
  const { rows } = await getPool().query<Row>(
    `WITH friends AS (
       SELECT friend_id AS id FROM friendships WHERE user_id = $1 AND status = 'accepted'
       UNION ALL SELECT user_id FROM friendships WHERE friend_id = $1 AND status = 'accepted'
     )
     SELECT ${itemColumns} FROM activity a JOIN users u ON u.id = a.user_id JOIN shows s ON s.id = a.show_id
     WHERE a.user_id IN (SELECT id FROM friends) AND a.created_at > now() - interval '${keepFor}'
     ORDER BY a.created_at DESC, a.id LIMIT $2`,
    [userId, limit],
  );
  return toItems(rows);
}
