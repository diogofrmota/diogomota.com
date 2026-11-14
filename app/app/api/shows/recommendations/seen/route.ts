import { recommendationsSeenInput } from "@/lib/schemas";
import { recommendationsSeen, showsRoute } from "@/lib/shows";

// POST /api/shows/recommendations/seen {type}: Discover showed the user's
// recommendations of this type (Recommended by Friends); home's badge stops counting them.
export const POST = showsRoute({ body: recommendationsSeenInput }, ({ user, body }) =>
  recommendationsSeen(user.id, body.type),
);
