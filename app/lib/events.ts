import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { recordActivity } from "./activity";
import { localParts, type CalendarEvent } from "./calendar";
import { HttpError } from "./http";
import type { eventInput } from "./schemas";
import { isUuid } from "./schemas";
import type { Space } from "./space-types";

// A space's events. Every function runs in inSpace's transaction (lib/spaces.ts),
// with the space's rows locked for sharing, so its members can't change halfway.
// Events have no notes any more: events.notes stays, unread, for the previous
// release, and goes in a later migration (README.md, Migrations).

type EventFields = z.output<typeof eventInput>;

const select = `SELECT e.id, e.title, e.starts_at AS "startsAt", e.ends_at AS "endsAt", e.all_day AS "allDay",
    e.is_group AS "isGroup",
    coalesce(array_agg(a.user_id ORDER BY a.user_id) FILTER (WHERE a.user_id IS NOT NULL), '{}') AS "assigneeIds"
  FROM events e LEFT JOIN event_assignees a ON a.event_id = e.id`;

type Row = Omit<CalendarEvent, "startsAt" | "endsAt"> & { startsAt: Date; endsAt: Date };
const toEvent = (row: Row): CalendarEvent => ({
  ...row,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
});

/** The space's events that overlap from..to (UTC instants), or all of them without a range. */
export async function listEvents(
  db: PoolClient,
  space: Space,
  range?: { from: string; to: string },
): Promise<CalendarEvent[]> {
  const { rows } = await db.query<Row>(
    `${select} WHERE e.space_id = $1 ${range ? "AND e.ends_at > $2 AND e.starts_at < $3" : ""}
     GROUP BY e.id ORDER BY e.starts_at, e.id`,
    range ? [space.id, range.from, range.to] : [space.id],
  );
  return rows.map(toEvent);
}

/** One of the space's events; 404 for anything else (another space's, a malformed id). */
export async function getEvent(db: PoolClient, space: Space, id: string): Promise<CalendarEvent> {
  if (!isUuid(id)) throw new HttpError("Event not found.", 404);
  const { rows } = await db.query<Row>(`${select} WHERE e.space_id = $1 AND e.id = $2 GROUP BY e.id`, [space.id, id]);
  if (!rows[0]) throw new HttpError("Event not found.", 404);
  return toEvent(rows[0]);
}

function checkFields(space: Space, event: EventFields) {
  // An all-day event runs from a day's start to a day's start, in the calendar's zone.
  if (event.allDay && [event.startsAt, event.endsAt].some((instant) => localParts(instant).time !== "00:00"))
    throw new HttpError("An all-day event starts and ends at midnight.");
  if (!event.assigneeIds.every((id) => space.members.some((member) => member.id === id)))
    throw new HttpError("Assign the event to current members or the whole group.");
}

async function setAssignees(db: PoolClient, id: string, event: EventFields) {
  await db.query("DELETE FROM event_assignees WHERE event_id = $1", [id]);
  if (event.assigneeIds.length) {
    await db.query("INSERT INTO event_assignees (event_id, user_id) SELECT $1, unnest($2::uuid[])", [
      id,
      [...new Set(event.assigneeIds)],
    ]);
  }
}

export async function createEvent(db: PoolClient, space: Space, userId: string, event: EventFields) {
  checkFields(space, event);
  const { rows } = await db.query(
    `INSERT INTO events (space_id, title, starts_at, ends_at, is_group, all_day)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [space.id, event.title, event.startsAt, event.endsAt, event.isGroup, event.allDay],
  );
  const id: string = rows[0].id;
  await setAssignees(db, id, event);
  await recordActivity(db, {
    userId,
    spaceId: space.id,
    kind: "event-added",
    key: `event:${id}`,
    data: { title: event.title, startsAt: event.startsAt, allDay: event.allDay },
  });
  return getEvent(db, space, id);
}

/** Replaces an event's fields (all of them: the form sends the whole event). */
export async function updateEvent(db: PoolClient, space: Space, userId: string, id: string, event: EventFields) {
  await getEvent(db, space, id);
  checkFields(space, event);
  await db.query(
    `UPDATE events SET title = $3, starts_at = $4, ends_at = $5, is_group = $6, all_day = $7
     WHERE space_id = $1 AND id = $2`,
    [space.id, id, event.title, event.startsAt, event.endsAt, event.isGroup, event.allDay],
  );
  await setAssignees(db, id, event);
  await recordActivity(db, {
    userId,
    spaceId: space.id,
    kind: "event-changed",
    key: `event:${id}`,
    data: { title: event.title, startsAt: event.startsAt, allDay: event.allDay },
  });
  return getEvent(db, space, id);
}

export async function deleteEvent(db: PoolClient, space: Space, userId: string, id: string): Promise<null> {
  const event = await getEvent(db, space, id);
  await db.query("DELETE FROM events WHERE id = $1 AND space_id = $2", [id, space.id]);
  await recordActivity(db, {
    userId,
    spaceId: space.id,
    kind: "event-deleted",
    key: `event:${id}`,
    data: { title: event.title },
  });
  return null;
}
