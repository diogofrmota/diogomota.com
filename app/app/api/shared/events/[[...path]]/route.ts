import { auth } from "@/auth";
import { eventOperation } from "@/lib/events";
import { calendarIcs } from "@/lib/calendar";
import { SpaceError, spaceTransaction } from "@/lib/spaces";

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Please log in again." }, { status: 401 });
  try {
    const { path = [] } = await context.params;
    const method = request.method;
    const exporting = path.at(-1) === "export";
    const ids = exporting ? path.slice(0, -1) : path;
    if (ids.length > 1 || (exporting && method !== "GET") ||
      (method === "POST" && ids.length) || (["PATCH", "DELETE"].includes(method) && !ids.length))
      throw new SpaceError("Endpoint not found.", 404);
    if (method !== "GET") {
      const origin = request.headers.get("origin");
      if ((origin && origin !== new URL(process.env.AUTH_URL ?? request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")
        throw new SpaceError("Request must come from this site.", 403);
    }
    let body: Record<string, unknown> = {};
    if (method === "POST" || method === "PATCH") {
      if (!request.headers.get("content-type")?.includes("application/json")) throw new SpaceError("Send a JSON request.", 415);
      try { body = await request.json(); } catch { throw new SpaceError("Invalid JSON request."); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new SpaceError("Invalid JSON request.");
    }
    const events = await spaceTransaction((db) => eventOperation(db, session.user.id, method, ids[0], body));
    const headers = { "Cache-Control": "no-store" };
    if (exporting) return new Response(calendarIcs(events), { headers: { ...headers,
      "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${ids.length ? "event" : "shared-calendar"}.ics"`,
    } });
    return Response.json({ data: method === "DELETE" ? null : ids.length || method === "POST" ? events[0] : events }, { status: method === "POST" ? 201 : 200, headers });
  } catch (error) {
    if (error instanceof SpaceError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Shared calendar request failed", error);
    return Response.json({ error: "Could not save or load your calendar. Please try again." }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
