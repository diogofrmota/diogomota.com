import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { query } from "./db";
import { HttpError } from "./http";
import { adoptParked, lockShopping } from "./recipe-groups";
import { removePhotoFiles, savePhotoFiles, type ProcessedPhoto } from "./recipe-photos";
import { recipeLimits, type Recipe, type ShoppingItem } from "./recipe-types";
import { isUuid, type recipeCreate, type recipePatch, type shoppingAdd, type shoppingPatch } from "./schemas";
import { inSpace } from "./spaces";

// The Recipes app's data: the recipes of the user's group (For Couples,
// docs/decisions/0023), their photos and one shopping list, which both of its
// people see and change. Every query is by the group, inside its locks
// (inGroup), and another group's recipe answers 404 as one that doesn't exist;
// without a group, Recipes answers 403, as Calendar and Tasks do. user_id is
// who added a recipe or a line. Clients may choose the ids of what they create
// (recipeCreate, shoppingAdd), so they can keep working with it before the
// response arrives, offline too; creating it again with the same id (a change
// sent twice) answers with what is there.

const recipeColumns = `r.id, r.title, r.servings, r.ingredients, r.steps, r.notes, r.source_url AS "sourceUrl",
  r.tags, r.is_favourite AS "isFavourite", r.created_at AS "createdAt", r.updated_at AS "updatedAt",
  coalesce((SELECT json_agg(json_build_object('id', p.id, 'width', p.width, 'height', p.height)
             ORDER BY p.position, p.created_at)
           FROM recipe_photos p WHERE p.recipe_id = r.id), '[]'::json) AS photos`;

const notFound = () => new HttpError("Recipe not found.", 404);

/**
 * Runs `fn` with the user's group, its rows share-locked for the transaction
 * (lib/spaces.ts, inSpace), once the user's parked recipes are in it
 * (lib/recipe-groups.ts). Without a group: 403.
 */
function inGroup<T>(userId: string, fn: (db: PoolClient, spaceId: string) => Promise<T>): Promise<T> {
  return inSpace(userId, async (db, space) => {
    await adoptParked(db, userId, space.id);
    return fn(db, space.id);
  });
}

/** The group's recipes, the newest first. */
export function listRecipes(userId: string): Promise<Recipe[]> {
  return inGroup(userId, async (db, spaceId) => {
    const { rows } = await db.query<Recipe>(
      `SELECT ${recipeColumns} FROM recipes r WHERE r.space_id = $1 ORDER BY r.created_at DESC, r.id`,
      [spaceId],
    );
    return rows;
  });
}

/** One of the group's recipes, in the caller's transaction; 404 for any other id. */
async function readIn(db: PoolClient, spaceId: string, id: string): Promise<Recipe> {
  if (!isUuid(id)) throw notFound();
  const { rows } = await db.query<Recipe>(
    `SELECT ${recipeColumns} FROM recipes r WHERE r.id = $1 AND r.space_id = $2`,
    [id, spaceId],
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

/** One of the group's recipes; 404 for any other id. */
export async function readRecipe(userId: string, id: string): Promise<Recipe> {
  if (!isUuid(id)) throw notFound();
  return inGroup(userId, (db, spaceId) => readIn(db, spaceId, id));
}

export async function createRecipe(userId: string, input: z.output<typeof recipeCreate>): Promise<Recipe> {
  const id = input.id ?? randomUUID();
  return inGroup(userId, async (db, spaceId) => {
    await db.query(
      `INSERT INTO recipes (id, user_id, space_id, title, servings, ingredients, steps, notes, source_url, tags, is_favourite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING`,
      [
        id,
        userId,
        spaceId,
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
    // Already there (sent twice): answered with what is there. Another group's id: refused.
    return readIn(db, spaceId, id).catch((error) => {
      throw error instanceof HttpError ? new HttpError("Could not save the recipe. Try again.", 409) : error;
    });
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
  return inGroup(userId, async (db, spaceId) => {
    if (fields.length) {
      const sets = fields.map(([key], i) => `${patchColumns[key]} = $${i + 3}`);
      if (fields.some(([key]) => key !== "isFavourite")) sets.push("updated_at = now()");
      const { rowCount } = await db.query(`UPDATE recipes SET ${sets.join(", ")} WHERE id = $1 AND space_id = $2`, [
        id,
        spaceId,
        ...fields.map(([, value]) => value),
      ]);
      if (!rowCount) throw notFound();
    }
    return readIn(db, spaceId, id);
  });
}

/** Deletes a recipe, its photos (rows and files) with it. Its shopping list lines stay, from no recipe. */
export async function deleteRecipe(userId: string, id: string): Promise<null> {
  if (!isUuid(id)) throw notFound();
  const photos = await inGroup(userId, async (db, spaceId) => {
    const { rows } = await db.query<{ id: string }>(
      `SELECT p.id FROM recipe_photos p JOIN recipes r ON r.id = p.recipe_id WHERE r.id = $1 AND r.space_id = $2`,
      [id, spaceId],
    );
    const deleted = await db.query("DELETE FROM recipes WHERE id = $1 AND space_id = $2", [id, spaceId]);
    if (!deleted.rowCount) throw notFound();
    return rows.map((row) => row.id);
  });
  await removePhotoFiles(photos);
  return null;
}

// --- Photos ---------------------------------------------------------------------

async function photoCount(userId: string, recipeId: string): Promise<number> {
  if (!isUuid(recipeId)) throw notFound();
  return inGroup(userId, async (db, spaceId) => {
    const { rows } = await db.query<{ count: number }>(
      `SELECT (SELECT count(*) FROM recipe_photos WHERE recipe_id = r.id)::int AS count
       FROM recipes r WHERE r.id = $1 AND r.space_id = $2`,
      [recipeId, spaceId],
    );
    if (!rows[0]) throw notFound();
    return rows[0].count;
  });
}

const tooManyPhotos = () => new HttpError(`A recipe can have up to ${recipeLimits.photos} photos.`, 409);

/** Refuses before the work of making a photo small: the recipe isn't the group's, or it has all its photos. */
export async function checkPhotoRoom(userId: string, recipeId: string): Promise<void> {
  if ((await photoCount(userId, recipeId)) >= recipeLimits.photos) throw tooManyPhotos();
}

/** Adds a processed photo to the end of a recipe's photos (the cover, for its first), and returns the recipe. */
export async function addPhoto(userId: string, recipeId: string, photo: ProcessedPhoto): Promise<Recipe> {
  const id = randomUUID();
  await savePhotoFiles(id, photo);
  try {
    return await inGroup(userId, async (db, spaceId) => {
      // Locked, so two uploads at once can't both take the last place.
      const recipe = await db.query("SELECT id FROM recipes WHERE id = $1 AND space_id = $2 FOR UPDATE", [
        recipeId,
        spaceId,
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
      return readIn(db, spaceId, recipeId);
    });
  } catch (error) {
    await removePhotoFiles([id]);
    throw error;
  }
}

const photoNotFound = () => new HttpError("Photo not found.", 404);

/** Whether a photo is on one of the recipes of the user's group: only its two people see it. */
export async function canSeePhoto(userId: string, photoId: string): Promise<boolean> {
  if (!isUuid(photoId)) return false;
  const { rows } = await query(
    `SELECT 1 FROM recipe_photos p JOIN recipes r ON r.id = p.recipe_id JOIN users u ON u.space_id = r.space_id
     WHERE p.id = $1 AND u.id = $2`,
    [photoId, userId],
  );
  return rows.length > 0;
}

/** Deletes a photo of one of the group's recipes, and its files once that is done; returns the recipe. */
export async function removePhoto(userId: string, photoId: string): Promise<Recipe> {
  if (!isUuid(photoId)) throw photoNotFound();
  const recipe = await inGroup(userId, async (db, spaceId) => {
    const { rows } = await db.query<{ recipeId: string }>(
      `DELETE FROM recipe_photos p USING recipes r
       WHERE p.id = $1 AND r.id = p.recipe_id AND r.space_id = $2 RETURNING p.recipe_id AS "recipeId"`,
      [photoId, spaceId],
    );
    if (!rows[0]) throw photoNotFound();
    return readIn(db, spaceId, rows[0].recipeId);
  });
  await removePhotoFiles([photoId]);
  return recipe;
}

/** Makes a photo its recipe's cover (the first); returns the recipe. */
export async function makeCover(userId: string, photoId: string): Promise<Recipe> {
  if (!isUuid(photoId)) throw photoNotFound();
  return inGroup(userId, async (db, spaceId) => {
    const { rows } = await db.query<{ recipeId: string }>(
      `UPDATE recipe_photos p
       SET position = (SELECT min(position) - 1 FROM recipe_photos WHERE recipe_id = p.recipe_id)
       FROM recipes r
       WHERE p.id = $1 AND r.id = p.recipe_id AND r.space_id = $2 RETURNING p.recipe_id AS "recipeId"`,
      [photoId, spaceId],
    );
    if (!rows[0]) throw photoNotFound();
    return readIn(db, spaceId, rows[0].recipeId);
  });
}

// --- Shopping list -------------------------------------------------------------

const itemColumns = `id, text, recipe_id AS "recipeId", is_checked AS "isChecked"`;

/** The group's shopping list, in the order it was added. */
export async function listShopping(userId: string): Promise<ShoppingItem[]> {
  return inGroup(userId, async (db, spaceId) => {
    const { rows } = await db.query<ShoppingItem>(
      `SELECT ${itemColumns} FROM shopping_items WHERE space_id = $1 ORDER BY position, id`,
      [spaceId],
    );
    return rows;
  });
}

/**
 * Adds lines to the end of the group's list, in their order, and returns them.
 * A line whose id is already the group's (sent twice) is answered as it is; a
 * recipe that isn't the group's (or is gone) is left off the line.
 */
export async function addShopping(userId: string, input: z.output<typeof shoppingAdd>): Promise<ShoppingItem[]> {
  const items = input.items.map((item) => ({ ...item, id: item.id ?? randomUUID() }));
  return inGroup(userId, async (db, spaceId) => {
    // One request at a time per group, so positions and the limit hold.
    await lockShopping(db, spaceId);
    const { rows: counted } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM shopping_items WHERE space_id = $1 AND NOT (id = ANY($2::uuid[]))",
      [spaceId, items.map((item) => item.id)],
    );
    if (counted[0].count + items.length > recipeLimits.shoppingItems)
      throw new HttpError(
        `The shopping list can have up to ${recipeLimits.shoppingItems} items. Clear the ticked ones first.`,
        409,
      );
    await db.query(
      `INSERT INTO shopping_items (id, user_id, space_id, text, recipe_id, position)
       SELECT i.id, $1, $2, i.text, (SELECT r.id FROM recipes r WHERE r.id = i.recipe_id AND r.space_id = $2),
         (SELECT coalesce(max(position), -1) FROM shopping_items WHERE space_id = $2) + i.n
       FROM unnest($3::uuid[], $4::text[], $5::uuid[]) WITH ORDINALITY AS i(id, text, recipe_id, n)
       ON CONFLICT (id) DO NOTHING`,
      [
        userId,
        spaceId,
        items.map((item) => item.id),
        items.map((item) => item.text),
        items.map((item) => item.recipeId),
      ],
    );
    const { rows } = await db.query<ShoppingItem>(
      `SELECT ${itemColumns} FROM shopping_items WHERE space_id = $1 AND id = ANY($2::uuid[]) ORDER BY position, id`,
      [spaceId, items.map((item) => item.id)],
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
  return inGroup(userId, async (db, spaceId) => {
    const { rows } = await db.query<ShoppingItem>(
      `UPDATE shopping_items SET text = coalesce($3, text), is_checked = coalesce($4, is_checked)
       WHERE id = $1 AND space_id = $2 RETURNING ${itemColumns}`,
      [id, spaceId, patch.text ?? null, patch.isChecked ?? null],
    );
    if (!rows[0]) throw new HttpError("Item not found.", 404);
    return rows[0];
  });
}

/** Takes these lines off the group's list; ones already gone are no matter (sent twice). */
export async function removeShopping(userId: string, ids: readonly string[]): Promise<null> {
  return inGroup(userId, async (db, spaceId) => {
    await db.query("DELETE FROM shopping_items WHERE space_id = $1 AND id = ANY($2::uuid[])", [spaceId, ids]);
    return null;
  });
}

/**
 * The recipes and shopping list of a user's data export, in the caller's
 * transaction: their group's, or without one, the ones they kept on their own.
 */
export async function exportRecipes(
  db: PoolClient,
  userId: string,
  spaceId: string | null,
): Promise<{ recipes: Recipe[]; shopping: ShoppingItem[] }> {
  const [where, value] = spaceId ? ["space_id = $1", spaceId] : ["user_id = $1 AND space_id IS NULL", userId];
  const recipes = await db.query<Recipe>(
    `SELECT ${recipeColumns} FROM recipes r WHERE r.${where} ORDER BY r.created_at DESC, r.id`,
    [value],
  );
  const shopping = await db.query<ShoppingItem>(
    `SELECT ${itemColumns} FROM shopping_items WHERE ${where} ORDER BY position, id`,
    [value],
  );
  return { recipes: recipes.rows, shopping: shopping.rows };
}
