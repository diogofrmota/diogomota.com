import { testHooksEnabled } from "@/lib/test-hooks";
import { tmdbMockLog } from "@/lib/tmdb-mock";

export const dynamic = "force-dynamic";

// For the e2e tests: the requests the fake TMDB (lib/tmdb-mock.ts) answered,
// oldest first, those for the path in ?path= only if given. Not found unless
// test hooks are on, so never in production.
export function GET(request: Request) {
  if (!testHooksEnabled()) return Response.json({ error: "Not found" }, { status: 404 });

  const path = new URL(request.url).searchParams.get("path");
  return Response.json({ requests: path ? tmdbMockLog.filter((entry) => entry.path === path) : tmdbMockLog });
}
