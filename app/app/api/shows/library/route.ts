import { addToLibrary, readLibrary, showsResponse } from "@/lib/shows";

// GET /api/shows/library: your library, the latest added or changed first.
export function GET(request: Request) {
  return showsResponse(request, readLibrary);
}

// POST /api/shows/library {type, tmdbId, status}: adds a title to your library as
// "watching" or "planned" (409 if it is already there) and answers with its details.
export function POST(request: Request) {
  return showsResponse(request, addToLibrary, 201);
}
