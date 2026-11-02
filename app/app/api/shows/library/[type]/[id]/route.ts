import { mediaType, removeFromLibrary, showsResponse, tmdbId, updateLibraryEntry } from "@/lib/shows";

type Context = { params: Promise<{ type: string; id: string }> };

// PATCH /api/shows/library/{tv|movie}/{TMDB id} {status?, rating?, isFavourite?,
// currentSeason?, currentEpisode?}: changes your entry for a title and answers
// with it (404 if the title isn't in your library).
export function PATCH(request: Request, context: Context) {
  return showsResponse(request, async (userId, body) => {
    const { type, id } = await context.params;
    return updateLibraryEntry(userId, mediaType(type), tmdbId(id), body);
  });
}

// DELETE /api/shows/library/{tv|movie}/{TMDB id}: removes the title from your library.
export function DELETE(request: Request, context: Context) {
  return showsResponse(request, async (userId) => {
    const { type, id } = await context.params;
    return removeFromLibrary(userId, mediaType(type), tmdbId(id));
  });
}
