import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { query } from "./db";
import { HttpError } from "./http";
import { removePhotoFiles, savePhotoFiles, type ProcessedPhoto } from "./recipe-photos";
import { recipeLimits, type Recipe, type ShoppingItem } from "./recipe-types";
import { isUuid, type recipeCreate, type recipePatch, type shoppingAdd, type shoppingPatch } from "./schemas";
import { transaction } from "./spaces";

// The Recipes app's data: each user's own recipes, their photos and a shopping
// list. Nobody else sees them, so every query is by the user's id, and another
// user's recipe answers 404 as one that doesn't exist. Clients may choose the
// ids of what they create (recipeCreate, shoppingAdd), so they can keep working
// with it before the response arrives, offline too; creating it again with the
// same id (a change sent twice) answers with what is there.

const recipeColumns = `r.id, r.title, r.servings, r.ingredients, r.steps, r.notes, r.source_url AS "sourceUrl",
  r.tags, r.is_favourite AS "isFavourite", r.created_at AS "createdAt", r.updated_at AS "updatedAt",
  coalesce((SELECT json_agg(json_build_object('id', p.id, 'width', p.width, 'height', p.height)
             ORDER BY p.position, p.created_at)
           FROM recipe_photos p WHERE p.recipe_id = r.id), '[]'::json) AS photos`;

const notFound = () => new HttpError("Recipe not found.", 404);

/** The user's recipes, the newest first. */
export async function listRecipes(userId: string): Promise<Recipe[]> {
  const { rows } = await query<Recipe>(
    `SELECT ${recipeColumns} FROM recipes r WHERE r.user_id = $1 ORDER BY r.created_at DESC, r.id`,
    [userId],
  );
  return rows;
}

/** One of the user's recipes; 404 for any other id. */
export async function readRecipe(userId: string, id: string): Promise<Recipe> {
  if (!isUuid(id)) throw notFound();
  const { rows } = await query<Recipe>(`SELECT ${recipeColumns} FROM recipes r WHERE r.id = $1 AND r.user_id = $2`, [
    id,
    userId,
  ]);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function createRecipe(userId: string, input: z.output<typeof recipeCreate>): Promise<Recipe> {
  const id = input.id ?? randomUUID();
  await query(
    `INSERT INTO recipes (id, user_id, title, servings, ingredients, steps, notes, source_url, tags, is_favourite)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
    [
      id,
      userId,
      input.title,
      input.servings,
      input.ingredients,
      input.steps,
      input.notes,
      input.sourceUrl,
      input.tags,
      input.isFavourite,
    ],
  );
  // Already there (sent twice): answered with what is there. Someone else's id: refused.
  return readRecipe(userId, id).catch((error) => {
    throw error instanceof HttpError ? new HttpError("Could not save the recipe. Try again.", 409) : error;
  });
}

const patchColumns: Record<keyof z.output<typeof recipePatch>, string> = {
  title: "title",
  servings: "servings",
  ingredients: "ingredients",
  steps: "steps",
  notes: "notes",
  sourceUrl: "source_url",
  tags: "tags",
  isFavourite: "is_favourite",
};

/** Changes the fields given; its updated_at too, but not for a favourite alone. */
export async function updateRecipe(userId: string, id: string, patch: z.output<typeof recipePatch>): Promise<Recipe> {
  if (!isUuid(id)) throw notFound();
  const fields = Object.entries(patch).filter(([, value]) => value !== undefined) as [
    keyof typeof patchColumns,
    unknown,
  ][];
  if (fields.length) {
    const sets = fields.map(([key], i) => `${patchColumns[key]} = $${i + 3}`);
    if (fields.some(([key]) => key !== "isFavourite")) sets.push("updated_at = now()");
    const { rowCount } = await query(`UPDATE recipes SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
      ...fields.map(([, value]) => value),
    ]);
    if (!rowCount) throw notFound();
  }
  return readRecipe(userId, id);
}

/** Deletes a recipe, its photos (rows and files) with it. Its shopping list lines stay, from no recipe. */
export async function deleteRecipe(userId: string, id: string): Promise<null> {
  if (!isUuid(id)) throw notFound();
  const photos = await transaction(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `SELECT p.id FROM recipe_photos p JOIN recipes r ON r.id = p.recipe_id WHERE r.id = $1 AND r.user_id = $2`,
      [id, userId],
    );
    const deleted = await db.query("DELETE FROM recipes WHERE id = $1 AND user_id = $2", [id, userId]);
    if (!deleted.rowCount) throw notFound();
    return rows.map((row) => row.id);
  });
  await removePhotoFiles(photos);
  return null;
}

// --- Photos ---------------------------------------------------------------------

async function photoCount(userId: string, recipeId: string): Promise<number> {
  if (!isUuid(recipeId)) throw notFound();
  const { rows } = await query<{ count: number }>(
    `SELECT (SELECT count(*) FROM recipe_photos WHERE recipe_id = r.id)::int AS count
     FROM recipes r WHERE r.id = $1 AND r.user_id = $2`,
    [recipeId, userId],
  );
  if (!rows[0]) throw notFound();
  return rows[0].count;
}

const tooManyPhotos = () => new HttpError(`A recipe can have up to ${recipeLimits.photos} photos.`, 409);

/** Refuses before the work of making a photo small: the recipe isn't the user's, or it has all its photos. */
export async function checkPhotoRoom(userId: string, recipeId: string): Promise<void> {
  if ((await photoCount(userId, recipeId)) >= recipeLimits.photos) throw tooManyPhotos();
}

/** Adds a processed photo to the end of a recipe's photos (the cover, for its first), and returns the recipe. */
export async function addPhoto(userId: string, recipeId: string, photo: ProcessedPhoto): Promise<Recipe> {
  const id = randomUUID();
  await savePhotoFiles(id, photo);
  try {
    await transaction(async (db) => {
      // Locked, so two uploads at once can't both take the last place.
      const recipe = await db.query("SELECT id FROM recipes WHERE id = $1 AND user_id = $2 FOR UPDATE", [
        recipeId,
        userId,
      ]);
      if (!recipe.rows[0]) throw notFound();
      const { rows } = await db.query<{ count: number; next: number }>(
        "SELECT count(*)::int AS count, coalesce(max(position) + 1, 0) AS next FROM recipe_photos WHERE recipe_id = $1",
        [recipeId],
      );
      if (rows[0].count >= recipeLimits.photos) throw tooManyPhotos();
      await db.query("INSERT INTO recipe_photos (id, recipe_id, position, width, height) VALUES ($1, $2, $3, $4, $5)", [
        id,
        recipeId,
        rows[0].next,
        photo.width,
        photo.height,
      ]);
    });
  } catch (error) {
    await removePhotoFiles([id]);
    throw error;
  }
  return readRecipe(userId, recipeId);
}

const photoNotFound = () => new HttpError("Photo not found.", 404);

/** Whether a photo is on one of the user's recipes: only they see it. */
export async function ownsPhoto(userId: string, photoId: string): Promise<boolean> {
  if (!isUuid(photoId)) return false;
  const { rows } = await query(
    "SELECT 1 FROM recipe_photos p JOIN recipes r ON r.id = p.recipe_id WHERE p.id = $1 AND r.user_id = $2",
    [photoId, userId],
  );
  return rows.length > 0;
}

/** Deletes a photo of one of the user's recipes, and its files; returns the recipe. */
export async function removePhoto(userId: string, photoId: string): Promise<Recipe> {
  if (!isUuid(photoId)) throw photoNotFound();
  const { rows } = await query<{ recipeId: string }>(
    `DELETE FROM recipe_photos p USING recipes r
     WHERE p.id = $1 AND r.id = p.recipe_id AND r.user_id = $2 RETURNING p.recipe_id AS "recipeId"`,
    [photoId, userId],
  );
  if (!rows[0]) throw photoNotFound();
  await removePhotoFiles([photoId]);
  return readRecipe(userId, rows[0].recipeId);
}

/** Makes a photo its recipe's cover (the first); returns the recipe. */
export async function makeCover(userId: string, photoId: string): Promise<Recipe> {
  if (!isUuid(photoId)) throw photoNotFound();
  const { rows } = await query<{ recipeId: string }>(
    `UPDATE recipe_photos p
     SET position = (SELECT min(position) - 1 FROM recipe_photos WHERE recipe_id = p.recipe_id)
     FROM recipes r
     WHERE p.id = $1 AND r.id = p.recipe_id AND r.user_id = $2 RETURNING p.recipe_id AS "recipeId"`,
    [photoId, userId],
  );
  if (!rows[0]) throw photoNotFound();
  return readRecipe(userId, rows[0].recipeId);
}

/** The ids of every photo of the user's recipes: their files go with the account (auth.ts). */
export async function photoIdsOf(userId: string): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    "SELECT p.id FROM recipe_photos p JOIN recipes r ON r.id = p.recipe_id WHERE r.user_id = $1",
    [userId],
  );
  return rows.map((row) => row.id);
}

// --- Shopping list -------------------------------------------------------------

const itemColumns = `id, text, recipe_id AS "recipeId", is_checked AS "isChecked"`;

/** The user's shopping list, in the order it was added. */
export async function listShopping(userId: string): Promise<ShoppingItem[]> {
  const { rows } = await query<ShoppingItem>(
    `SELECT ${itemColumns} FROM shopping_items WHERE user_id = $1 ORDER BY position, id`,
    [userId],
  );
  return rows;
}

/**
 * Adds lines to the end of the list, in their order, and returns them. A line
 * whose id is already the user's (sent twice) is answered as it is; a recipe
 * that isn't the user's (or is gone) is left off the line.
 */
export async function addShopping(userId: string, input: z.output<typeof shoppingAdd>): Promise<ShoppingItem[]> {
  const items = input.items.map((item) => ({ ...item, id: item.id ?? randomUUID() }));
  return transaction(async (db) => {
    // One request at a time per user, so positions and the limit hold.
    await db.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const { rows: counted } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM shopping_items WHERE user_id = $1 AND NOT (id = ANY($2::uuid[]))",
      [userId, items.map((item) => item.id)],
    );
    if (counted[0].count + items.length > recipeLimits.shoppingItems)
      throw new HttpError(
        `The shopping list can have up to ${recipeLimits.shoppingItems} items. Clear the ticked ones first.`,
        409,
      );
    await db.query(
      `INSERT INTO shopping_items (id, user_id, text, recipe_id, position)
       SELECT i.id, $1, i.text, (SELECT r.id FROM recipes r WHERE r.id = i.recipe_id AND r.user_id = $1),
         (SELECT coalesce(max(position), -1) FROM shopping_items WHERE user_id = $1) + i.n
       FROM unnest($2::uuid[], $3::text[], $4::uuid[]) WITH ORDINALITY AS i(id, text, recipe_id, n)
       ON CONFLICT (id) DO NOTHING`,
      [userId, items.map((item) => item.id), items.map((item) => item.text), items.map((item) => item.recipeId)],
    );
    const { rows } = await db.query<ShoppingItem>(
      `SELECT ${itemColumns} FROM shopping_items WHERE user_id = $1 AND id = ANY($2::uuid[]) ORDER BY position, id`,
      [userId, items.map((item) => item.id)],
    );
    if (rows.length < items.length) throw new HttpError("Could not add to the list. Try again.", 409);
    return rows;
  });
}

export async function updateShopping(
  userId: string,
  id: string,
  patch: z.output<typeof shoppingPatch>,
): Promise<ShoppingItem> {
  if (!isUuid(id)) throw new HttpError("Item not found.", 404);
  const { rows } = await query<ShoppingItem>(
    `UPDATE shopping_items SET text = coalesce($3, text), is_checked = coalesce($4, is_checked)
     WHERE id = $1 AND user_id = $2 RETURNING ${itemColumns}`,
    [id, userId, patch.text ?? null, patch.isChecked ?? null],
  );
  if (!rows[0]) throw new HttpError("Item not found.", 404);
  return rows[0];
}

/** Takes these lines off the user's list; ones already gone are no matter (sent twice). */
export async function removeShopping(userId: string, ids: readonly string[]): Promise<null> {
  await query("DELETE FROM shopping_items WHERE user_id = $1 AND id = ANY($2::uuid[])", [userId, ids]);
  return null;
}
