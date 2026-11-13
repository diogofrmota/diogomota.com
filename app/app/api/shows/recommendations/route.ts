import { recommendInput } from "@/lib/schemas";
import { recommendTitle, showsRoute } from "@/lib/shows";

// POST /api/shows/recommendations {friendId, type, tmdbId}: recommends a title to a
// friend; it shows in their Discover (Recommended by Friends) until they add it.
export const POST = showsRoute({ body: recommendInput, status: 201 }, ({ user, body }) =>
  recommendTitle(user.id, body),
);
