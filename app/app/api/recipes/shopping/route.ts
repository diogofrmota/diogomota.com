import { apiRoute } from "@/lib/http";
import { recipesRequestLimit } from "@/lib/rate-limit";
import { addShopping, listShopping } from "@/lib/recipes";
import { shoppingAdd } from "@/lib/schemas";

// GET /api/recipes/shopping: your shopping list, in the order it was added.
export const GET = apiRoute({ label: "Loading the shopping list", limit: recipesRequestLimit }, ({ user }) =>
  listShopping(user.id),
);

// POST /api/recipes/shopping {items: [{id?, text, recipeId?}]}: adds lines to its end; answers with them.
export const POST = apiRoute(
  { label: "Adding to the shopping list", body: shoppingAdd, status: 201, limit: recipesRequestLimit },
  ({ user, body }) => addShopping(user.id, body),
);
