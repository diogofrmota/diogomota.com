import { apiRoute } from "@/lib/http";
import { recipesRequestLimit } from "@/lib/rate-limit";
import { deleteRecipe, readRecipe, updateRecipe } from "@/lib/recipes";
import { recipePatch } from "@/lib/schemas";

// GET, PATCH and DELETE /api/recipes/:id: one of your recipes (another's is a 404).

export const GET = apiRoute({ label: "Loading a recipe", limit: recipesRequestLimit }, ({ user, params }) =>
  readRecipe(user.id, params.id),
);

// Any of its fields; answers with the recipe.
export const PATCH = apiRoute(
  { label: "Changing a recipe", body: recipePatch, limit: recipesRequestLimit },
  ({ user, params, body }) => updateRecipe(user.id, params.id, body),
);

// With its photos; its lines on the shopping list stay.
export const DELETE = apiRoute({ label: "Deleting a recipe", limit: recipesRequestLimit }, ({ user, params }) =>
  deleteRecipe(user.id, params.id),
);
