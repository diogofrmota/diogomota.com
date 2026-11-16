import { apiRoute } from "@/lib/http";
import { recipesRequestLimit } from "@/lib/rate-limit";
import { createRecipe, listRecipes } from "@/lib/recipes";
import { recipeCreate } from "@/lib/schemas";

// The Recipes app's API (lib/recipes.ts): each user's own recipes.

// GET /api/recipes: your recipes, the newest first, each with its photos.
export const GET = apiRoute({ label: "Loading recipes", limit: recipesRequestLimit }, ({ user }) =>
  listRecipes(user.id),
);

// POST /api/recipes {id?, title, servings?, ingredients?, steps?, notes?, sourceUrl?, tags?, isFavourite?}: adds one.
export const POST = apiRoute(
  { label: "Adding a recipe", body: recipeCreate, status: 201, limit: recipesRequestLimit },
  ({ user, body }) => createRecipe(user.id, body),
);
