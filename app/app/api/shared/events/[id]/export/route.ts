import { calendarIcs } from "@/lib/calendar";
import { getEvent } from "@/lib/events";
import { apiRoute } from "@/lib/http";
import { memberName } from "@/lib/names";
import { inSpace } from "@/lib/spaces";

// GET /api/shared/events/{id}/export: the event as an .ics file, for any calendar app.
export const GET = apiRoute({ label: "Exporting an event" }, ({ user, params }) =>
  inSpace(user.id, async (db, space) => {
    const event = await getEvent(db, space, params.id);
    const names = new Map(space.members.map((member) => [member.id, memberName(member)]));
    return new Response(calendarIcs([event], names), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="event.ics"',
      },
    });
  }),
);
