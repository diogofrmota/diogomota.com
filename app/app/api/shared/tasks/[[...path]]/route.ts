import { auth } from "@/auth";
import { taskOperation } from "@/lib/tasks";
import { SpaceError, spaceTransaction } from "@/lib/spaces";

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Please log in again." }, { status: 401 });
  try {
    const { path = [] } = await context.params;
    const method = request.method;
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
    const data = await spaceTransaction((db) => taskOperation(db, session.user.id, method, path, body));
    const created = method === "POST" && path.at(-1) !== "move";
    return Response.json({ data }, { status: created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SpaceError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Shared tasks request failed", error);
    return Response.json({ error: "Could not save or load your tasks. Please try again." }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
