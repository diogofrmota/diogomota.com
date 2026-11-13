import { search, showsRoute } from "@/lib/shows";

// GET /api/shows/discover/search?q=: TV shows and movies matching q.
export const GET = showsRoute({}, ({ searchParams }) => search(searchParams.get("q")));
