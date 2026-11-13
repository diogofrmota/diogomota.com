import { deleteEvent, getEvent, updateEvent } from "@/lib/events";
import { apiRoute } from "@/lib/http";
import { eventInput } from "@/lib/schemas";
import { inSpace } from "@/lib/spaces";

// GET, PATCH (the whole event, as POST /api/shared/events takes it) and DELETE
// /api/shared/events/{id}: one of your space's events (404 for any other).
export const GET = apiRoute({ label: "Reading an event" }, ({ user, params }) =>
  inSpace(user.id, (db, space) => getEvent(db, space, params.id)),
);

export const PATCH = apiRoute({ label: "Changing an event", body: eventInput }, ({ user, params, body }) =>
  inSpace(user.id, (db, space) => updateEvent(db, space, user.id, params.id, body)),
);

export const DELETE = apiRoute({ label: "Deleting an event" }, ({ user, params }) =>
  inSpace(user.id, (db, space) => deleteEvent(db, space, user.id, params.id)),
);
