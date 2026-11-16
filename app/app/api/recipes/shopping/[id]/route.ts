import { apiRoute } from "@/lib/http";
import { recipesRequestLimit } from "@/lib/rate-limit";
import { updateShopping } from "@/lib/recipes";
import { shoppingPatch } from "@/lib/schemas";

// PATCH /api/recipes/shopping/:id {text?, isChecked?}: changes a line of your shopping list.
export const PATCH = apiRoute(
  { label: "Changing the shopping list", body: shoppingPatch, limit: recipesRequestLimit },
  ({ user, params, body }) => updateShopping(user.id, params.id, body),
);
