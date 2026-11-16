import { apiRoute } from "@/lib/http";
import { recipesRequestLimit } from "@/lib/rate-limit";
import { removeShopping } from "@/lib/recipes";
import { shoppingRemove } from "@/lib/schemas";

// POST /api/recipes/shopping/remove {ids}: takes lines off your shopping list
// (one deleted, or Clear ticked); ones already gone are no matter.
export const POST = apiRoute(
  { label: "Clearing the shopping list", body: shoppingRemove, limit: recipesRequestLimit },
  ({ user, body }) => removeShopping(user.id, body.ids),
);
