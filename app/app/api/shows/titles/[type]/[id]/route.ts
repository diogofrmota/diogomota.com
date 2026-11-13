import { mediaType, readTitle, showsRoute, tmdbId } from "@/lib/shows";

// GET /api/shows/titles/{tv|movie}/{TMDB id}: a title's details, cached in the
// shows table (fetched from TMDB again after 7 days), with your library entry
// and the friends who have it.
export const GET = showsRoute({}, ({ user, params }) => readTitle(user.id, mediaType(params.type), tmdbId(params.id)));
