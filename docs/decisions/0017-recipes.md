# 0017 — Recipes, the third app: each user's own

**Decided:** unreleased (after v1.2.0), 2026-11-16, from `new_apps.md`.

**Why:** A place to keep the recipes worth cooking again, with what makes one useful in the kitchen and the shop: its ingredients and steps, photos, where it came from, tags and a search, servings scaled, a shopping list made from it, and favourites. The other apps are about sharing; recipes are mostly one person's, so this one is private, and simple because of it.

**What it is:**

- `/recipes`, built as Shared and Shows are: an entry in `lib/apps.ts` (the front page's section, the header and footer, About and home all follow from it), its views in the URL (`recipes`, `favourites`, `shopping`; a recipe's page and form as panels), the apps' parts and dialogs, Undo instead of "are you sure?".
- Each user's own: no spaces, friends or activity. Another user's recipe, photo or line of the list answers 404, as one that doesn't exist.
- Ingredients and steps are lines of text, as typed or pasted, not structured quantities and units. Scaling reads the first amount of each line (`scaleIngredient`, `lib/recipe-types.ts`) and writes it as it was (fractions, decimals with their comma, ranges); what it can't read stays as it is. Typing a recipe stays as quick as writing it down, and pasting one from a website works.
- The shopping list is one list per user, its lines from typing or from a recipe's ingredients (scaled, the ones in the cupboard unticked first), each saying which recipe. Lines aren't merged: "200 g flour" from two recipes is two lines.
- Data through TanStack Query, as in Shows ([0002](0002-tanstack-query-offline.md)): shown at once, kept for offline use, changes queued in order and safe to send twice (ids chosen by the client).
- Photos as profile pictures are: files on the `appdata` volume (`RECIPE_PHOTO_DIR`), made smaller by sharp (1,600 px and a 640×480 copy for the cards, WebP, no metadata), up to 10 a recipe, archived with each backup. They need the connection; they aren't queued offline.
- `023_recipes.sql` only adds tables ([0004](0004-expand-and-contract-migrations.md)).

**Costs:** amounts are only as good as what can be read from the text: no unit conversion (3 tsp don't become 1 tbsp), and an amount in words ("two eggs") isn't scaled. Photos add disk on the VPS (a few hundred KB each) and to the backups, and the offsite backup has only the dumps, so lost photos would have to be added again. Nothing is shared: a couple who cook together each keep their own recipes (sharing a recipe, or the shopping list with a Shared space, would be a later decision).
