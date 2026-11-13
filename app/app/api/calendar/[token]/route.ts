import { feedCalendar } from "@/lib/calendar-feeds";

// GET /api/calendar/{token}: a calendar subscription (lib/calendar-feeds.ts), for
// calendar apps, which have no session: the secret token is the key. nginx limits
// how often it can be asked for (nginx/nginx.conf).
export async function GET(_request: Request, { params }: RouteContext<"/api/calendar/[token]">) {
  const token = (await params).token.replace(/\.ics$/, "");
  try {
    const calendar = await feedCalendar(token);
    if (calendar === null) return new Response("No such calendar.", { status: 404 });
    return new Response(calendar, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="shared.ics"',
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    console.error("Calendar subscription failed", error);
    return new Response("Something went wrong.", { status: 500 });
  }
}
