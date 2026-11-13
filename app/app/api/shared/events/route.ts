import { createEvent, listEvents } from "@/lib/events";
import { apiRoute, HttpError } from "@/lib/http";
import { eventInput, eventRange } from "@/lib/schemas";
import { inSpace } from "@/lib/spaces";

// GET /api/shared/events?from=&to=: your space's events that overlap the range
// (UTC instants, at most 400 days apart), or all of them without one.
export const GET = apiRoute({ label: "Reading the calendar" }, ({ user, searchParams }) => {
  const from = searchParams.get("from"),
    to = searchParams.get("to");
  let range: { from: string; to: string } | undefined;
  if (from !== null || to !== null) {
    const parsed = eventRange.safeParse({ from, to });
    if (!parsed.success) throw new HttpError(parsed.error.issues[0]?.message ?? "Invalid range.");
    range = parsed.data;
  }
  return inSpace(user.id, (db, space) => listEvents(db, space, range));
});

// POST /api/shared/events {title, startsAt, endsAt, allDay, isGroup, assigneeIds}: adds an event.
export const POST = apiRoute({ label: "Adding an event", body: eventInput, status: 201 }, ({ user, body }) =>
  inSpace(user.id, (db, space) => createEvent(db, space, user.id, body)),
);
