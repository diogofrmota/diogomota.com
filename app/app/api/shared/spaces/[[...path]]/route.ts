import { auth } from "@/auth";
import { createSpace, joinSpace, manageSpace, readSpace, SpaceError, spaceTransaction } from "@/lib/spaces";
import { spaceJoinLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ path?: string[] }> };
async function handle(request: Request, context: Context) {
  const session = await auth();
  if (!session) return Response.json({ error: "Please log in again." }, { status: 401 });
  const { path = [] } = await context.params;
  const method = request.method;
  const userId = session.user.id;
  try {
    if (method !== "GET") {
      const origin = request.headers.get("origin");
      // Next's internal request URL can use the container hostname behind nginx.
      const siteOrigin = new URL(process.env.AUTH_URL ?? request.url).origin;
      if ((origin && origin !== siteOrigin) || request.headers.get("sec-fetch-site") === "cross-site")
        throw new SpaceError("Request must come from this site.", 403);
    }
    let body: Record<string, unknown> = {};
    if (method === "POST" || method === "PATCH") {
      if (!request.headers.get("content-type")?.includes("application/json")) throw new SpaceError("Send a JSON request.", 415);
      try { body = await request.json(); } catch { throw new SpaceError("Invalid JSON request."); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new SpaceError("Invalid JSON request.");
    }
    const result = await spaceTransaction(async (db) => {
      if (!path.length && method === "GET") return readSpace(db, userId);
      if (!path.length && method === "POST") return createSpace(db, userId, body.name);
      if (path.length === 1 && path[0] === "join" && method === "POST") {
        if (!spaceJoinLimit(userId)) throw new SpaceError("Too many attempts. Try again in 15 minutes.", 429);
        return joinSpace(db, userId, body.code);
      }
      const [id, action] = path;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? ""))
        throw new SpaceError("Space not found.", 404);
      if (path.length === 1 && method === "GET") return readSpace(db, userId, id);
      if (path.length === 1 && method === "PATCH") return manageSpace(db, userId, id, "rename", body.name);
      if (path.length === 2 && action === "invites" && method === "POST") return manageSpace(db, userId, id, "invite");
      if (path.length === 2 && action === "leave" && method === "POST") return manageSpace(db, userId, id, "leave");
      throw new SpaceError("Endpoint not found.", 404);
    });
    return Response.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SpaceError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Shared space request failed", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
