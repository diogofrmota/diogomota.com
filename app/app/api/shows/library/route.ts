import { libraryAdd } from "@/lib/schemas";
import { addToLibrary, readLibrary, showsRoute } from "@/lib/shows";

// GET /api/shows/library: your library, the latest added or changed first.
export const GET = showsRoute({}, ({ user }) => readLibrary(user.id));

// POST /api/shows/library {type, tmdbId, status}: adds a title to your library as
// "watching", "planned" or "completed" (409 if it is already there) and answers with its details.
export const POST = showsRoute({ body: libraryAdd, status: 201 }, ({ user, body }) => addToLibrary(user.id, body));
