import { libraryPatch } from "@/lib/schemas";
import { mediaType, removeFromLibrary, showsRoute, tmdbId, updateLibraryEntry } from "@/lib/shows";

// PATCH /api/shows/library/{tv|movie}/{TMDB id} {status?, isFavourite?,
// currentSeason?, currentEpisode?}: changes your entry for a title and answers
// with it (404 if the title isn't in your library).
export const PATCH = showsRoute({ body: libraryPatch }, ({ user, params, body }) =>
  updateLibraryEntry(user.id, mediaType(params.type), tmdbId(params.id), body),
);

// DELETE /api/shows/library/{tv|movie}/{TMDB id}: removes the title from your library.
export const DELETE = showsRoute({}, ({ user, params }) =>
  removeFromLibrary(user.id, mediaType(params.type), tmdbId(params.id)),
);
