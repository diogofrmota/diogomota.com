import { mediaType, readTitle, showsResponse, tmdbId } from "@/lib/shows";

// GET /api/shows/titles/{tv|movie}/{TMDB id}: a title's details, cached in the
// shows table (fetched from TMDB again after 7 days), with your library entry.
export function GET(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  return showsResponse(request, async (userId) => {
    const { type, id } = await context.params;
    return readTitle(userId, mediaType(type), tmdbId(id));
  });
}
