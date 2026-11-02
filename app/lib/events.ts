import "server-only";
import type { PoolClient } from "pg";
import type { CalendarEvent } from "./calendar";
import { readSpace, SpaceError } from "./spaces";

const select = `SELECT e.id, e.title, coalesce(e.notes, '') AS notes, e.starts_at AS "startsAt",
  e.ends_at AS "endsAt", e.is_group AS "isGroup", a.user_id AS "assigneeId"
  FROM events e LEFT JOIN event_assignees a ON a.event_id = e.id`;
export async function eventOperation(db: PoolClient, userId: string, method: string, id?: string, body: Record<string, unknown> = {}) {
  const space = await readSpace(db, userId);
  if (!space) throw new SpaceError("Join or create a space first.", 403);
  if (id && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new SpaceError("Event not found.", 404);
  if (id) {
    const found = await db.query("SELECT id FROM events WHERE id = $1 AND space_id = $2", [id, space.id]);
    if (!found.rowCount) throw new SpaceError("Event not found.", 404);
  }
  if (method === "DELETE") {
    await db.query("DELETE FROM events WHERE id = $1 AND space_id = $2", [id, space.id]);
    return [];
  }
  if (method === "POST" || method === "PATCH") {
    const { title, notes = "", startsAt, endsAt, isGroup, assigneeId } = body;
    if (typeof title !== "string" || !title.trim() || title.trim().length > 200) throw new SpaceError("Enter a title between 1 and 200 characters.");
    if (typeof notes !== "string" || notes.length > 10000) throw new SpaceError("Notes must be at most 10,000 characters.");
    const validInstant = (value: unknown): value is string => typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
    if (!validInstant(startsAt) || !validInstant(endsAt) || Date.parse(endsAt) <= Date.parse(startsAt))
      throw new SpaceError("Provide valid UTC times, with the end after the start.");
    if (typeof isGroup !== "boolean" || (!isGroup && !space.members.some((m) => m.id === assigneeId)) || (isGroup && assigneeId != null))
      throw new SpaceError("Assign the event to a current member or the whole group.");
    const values = [space.id, title.trim(), notes, startsAt, endsAt, isGroup];
    const saved = id
      ? await db.query(`UPDATE events SET title=$2, notes=$3, starts_at=$4, ends_at=$5, is_group=$6 WHERE space_id=$1 AND id=$7 RETURNING id`, [...values, id])
      : await db.query(`INSERT INTO events (space_id,title,notes,starts_at,ends_at,is_group) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, values);
    id = saved.rows[0].id;
    await db.query("DELETE FROM event_assignees WHERE event_id=$1", [id]);
    if (!isGroup) await db.query("INSERT INTO event_assignees (event_id,user_id) VALUES ($1,$2)", [id, assigneeId]);
  }
  const result = await db.query(`${select} WHERE e.space_id=$1 ${id ? "AND e.id=$2" : ""} ORDER BY e.starts_at,e.id`, id ? [space.id, id] : [space.id]);
  return result.rows.map((row) => ({ ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() })) as CalendarEvent[];
}
