import "server-only";
import { query } from "./db";
import { calendarZone } from "./calendar";

// The counts on home's app icons (app/page.tsx), read as the page renders: what
// is waiting for the user in each app.

export type HomeBadges = {
  /** Shared: open tasks due today or before (in Lisbon), assigned to the user or to nobody. */
  shared: number;
  /** Shows: friend requests waiting for an answer, and recommendations not seen yet in Discover. */
  shows: number;
  /** Whether the user is in a space: without one, Shared opens on its welcome. */
  inSpace: boolean;
};

export async function homeBadges(userId: string): Promise<HomeBadges> {
  const { rows } = await query<HomeBadges>(
    `SELECT
       me.space_id IS NOT NULL AS "inSpace",
       (SELECT count(*) FROM tasks t JOIN task_lists l ON l.id = t.list_id
        WHERE l.space_id = me.space_id AND NOT t.is_complete
          AND t.due_date <= (now() AT TIME ZONE $2)::date
          AND (NOT EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id)
               OR EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = me.id)))::int AS shared,
       ((SELECT count(*) FROM friendships f WHERE f.friend_id = me.id AND f.status = 'pending')
        + (SELECT count(*) FROM recommendations r
           WHERE r.to_user = me.id AND r.seen_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM user_shows us WHERE us.user_id = me.id AND us.show_id = r.show_id)))::int AS shows
     FROM users me WHERE me.id = $1`,
    [userId, calendarZone],
  );
  return rows[0] ?? { shared: 0, shows: 0, inSpace: false };
}
