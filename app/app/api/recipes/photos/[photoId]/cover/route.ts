import { apiRoute } from "@/lib/http";
import { recipesRequestLimit } from "@/lib/rate-limit";
import { makeCover } from "@/lib/recipes";

// POST /api/recipes/photos/:photoId/cover {}: makes the photo its recipe's cover
// (the first of its photos); answers with the recipe.
export const POST = apiRoute({ label: "Choosing a cover photo", limit: recipesRequestLimit }, ({ user, params }) =>
  makeCover(user.id, params.photoId),
);
