import { mediaType, showsRoute, similarTitles, tmdbId } from "@/lib/shows";

// GET /api/shows/titles/{tv|movie}/{TMDB id}/similar: More like this, TMDB's
// recommendations for people who liked the title.
export const GET = showsRoute({}, ({ params }) => similarTitles(mediaType(params.type), tmdbId(params.id)));
