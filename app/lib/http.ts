import "server-only";
import { z } from "zod";
import { getSession, type SessionUser } from "@/auth";

/** A refused request: the message the API answers with, and its HTTP status. */
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/**
 * Whether a request that changes something comes from this site: its Origin, when
 * it has one, is the site's, and the browser doesn't say it is cross-site. The
 * session cookie is SameSite=Lax; this covers what that doesn't.
 */
export function fromThisSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  // Next's internal request URL can use the container hostname behind nginx.
  const siteOrigin = new URL(process.env.AUTH_URL ?? request.url).origin;
  return !(origin && origin !== siteOrigin) && request.headers.get("sec-fetch-site") !== "cross-site";
}

async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError("Send a JSON request.", 415);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Invalid JSON request.");
  return body;
}

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

export type ApiContext<Body> = {
  user: SessionUser;
  body: Body;
  /** The route's dynamic segments, e.g. { id } for /api/shared/events/[id]. */
  params: Record<string, string>;
  request: Request;
  searchParams: URLSearchParams;
};

/**
 * An API route handler for one method: `{ data }` (with `status`), or `{ error }`
 * and its status for a refused request. It checks the session, that a change
 * comes from this site, the rate limit (`limit`, per user) and the JSON body
 * against `body` (a zod schema, whose first problem is the answer), then runs
 * `handler`. Errors it doesn't know become a 500, logged with `label`; `mapError`
 * can answer some of them first (a TMDB failure, say).
 */
export function apiRoute<Schema extends z.ZodType = z.ZodType<Record<string, never>>>(
  options: {
    label: string;
    body?: Schema;
    status?: number;
    limit?: (userId: string) => boolean;
    mapError?: (error: unknown) => Response | undefined;
  },
  handler: (context: ApiContext<z.output<Schema>>) => Promise<unknown>,
) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    const headers = { "Cache-Control": "no-store" };
    const session = await getSession();
    if (!session) return Response.json({ error: "Please log in again." }, { status: 401, headers });
    try {
      if (request.method !== "GET" && !fromThisSite(request))
        throw new HttpError("Request must come from this site.", 403);
      if (options.limit && !options.limit(session.user.id))
        throw new HttpError("Too many requests. Wait a minute and try again.", 429);
      let body: unknown = {};
      if (options.body) {
        const raw = request.method === "GET" || request.method === "DELETE" ? {} : await jsonBody(request);
        const parsed = options.body.safeParse(raw);
        if (!parsed.success) throw new HttpError(parsed.error.issues[0]?.message ?? "Invalid request.");
        body = parsed.data;
      } else if (request.method === "POST" || request.method === "PATCH") {
        await jsonBody(request);
      }
      const params = Object.fromEntries(
        Object.entries((await context?.params) ?? {}).map(([key, value]) => [key, String(value ?? "")]),
      );
      const data = await handler({
        user: session.user,
        body: body as z.output<Schema>,
        params,
        request,
        searchParams: new URL(request.url).searchParams,
      });
      if (data instanceof Response) return data;
      return Response.json({ data: data ?? null }, { status: options.status ?? 200, headers });
    } catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status, headers });
      const mapped = options.mapError?.(error);
      if (mapped) return mapped;
      console.error(`${options.label} failed`, error);
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500, headers });
    }
  };
}
