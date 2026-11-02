import { discoverSection, mediaType, search, ShowsError, showsResponse } from "@/lib/shows";

// GET /api/shows/discover/{tv|movie}/{top-rated|popular|friends}: a Discover section.
// GET /api/shows/discover/search?q=: TV shows and movies matching q.
export function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return showsResponse(request, async (userId) => {
    const { path = [] } = await context.params;
    if (path.length === 1 && path[0] === "search") return search(new URL(request.url).searchParams.get("q"));
    if (path.length !== 2) throw new ShowsError("Endpoint not found.", 404);
    return discoverSection(userId, mediaType(path[0]), path[1]);
  });
}
