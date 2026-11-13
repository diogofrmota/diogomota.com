import { calendarFeed, newCalendarFeed } from "@/lib/calendar-feeds";
import { apiRoute } from "@/lib/http";

// GET /api/shared/calendar-feed: your calendar subscription link ({url, webcal}),
// made the first time it is asked for (lib/calendar-feeds.ts).
export const GET = apiRoute({ label: "Reading the calendar link" }, ({ user }) => calendarFeed(user.id));

// POST /api/shared/calendar-feed {}: a new link; the old one stops working.
export const POST = apiRoute({ label: "Making a calendar link" }, ({ user }) => newCalendarFeed(user.id));
