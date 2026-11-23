import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { deleteAccountData } from "../lib/account-deletion";
import { getPool } from "../lib/db";
import { HttpError } from "../lib/http";
import {
  addShopping,
  canSeePhoto,
  createRecipe,
  listRecipes,
  listShopping,
  readRecipe,
  updateRecipe,
} from "../lib/recipes";
import { createInvite, createSpace, joinSpace, leaveSpace, previewInvite } from "../lib/spaces";
import { cleanupMediaJobs } from "../scripts/media-cleanup.mjs";
import { assertTestIsolation } from "../e2e/isolation";

// For Couples (docs/decisions/0023): a group is two people, and its recipes
// and shopping list are the group's: merged in on creating or joining it,
// shared by both, kept when one leaves, gone with the last.

assertTestIsolation();
afterAll(() => getPool().end());

async function person() {
  const id = randomUUID();
  await getPool().query("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", [
    id,
    `test_${id.replaceAll("-", "").slice(0, 12)}`,
    `${id}@example.test`,
  ]);
  return id;
}

/** Two people in one group: the one who made it, and their partner. */
async function couple() {
  const owner = await person();
  const partner = await person();
  const space = await createSpace(owner);
  await joinSpace(partner, (await createInvite(owner, space.id)).code);
  return { owner, partner, spaceId: space.id };
}

const recipe = (title: string) => ({
  title,
  servings: 2,
  ingredients: ["1 egg"],
  steps: [],
  notes: "",
  sourceUrl: null,
  tags: [],
  isFavourite: false,
});

/** A recipe and lines of the list kept outside a group, as before groups had them. */
async function parked(userId: string, title: string, lines: string[]) {
  const id = randomUUID();
  await getPool().query("INSERT INTO recipes (id, user_id, title) VALUES ($1, $2, $3)", [id, userId, title]);
  for (const [i, text] of lines.entries())
    await getPool().query("INSERT INTO shopping_items (user_id, text, position) VALUES ($1, $2, $3)", [
      userId,
      text,
      i,
    ]);
  return id;
}

async function photoOf(recipeId: string) {
  const id = randomUUID();
  await getPool().query(
    "INSERT INTO recipe_photos (id, recipe_id, position, width, height) VALUES ($1, $2, 0, 10, 10)",
    [id, recipeId],
  );
  const dir = process.env.RECIPE_PHOTO_DIR!;
  await mkdir(dir, { recursive: true });
  const files = [path.join(dir, `${id}.webp`), path.join(dir, `${id}-thumb.webp`)];
  for (const file of files) await writeFile(file, "photo");
  return { id, files };
}

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  );

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof HttpError ? { status: error.status, message: error.message } : error),
  );

it("a group is two people: a third is refused, and so is a new invite; an open one says it's full", async () => {
  const owner = await person();
  const space = await createSpace(owner);
  const first = await createInvite(owner, space.id);
  const second = await createInvite(owner, space.id);
  expect((await previewInvite(second.code))?.state).toBe("open");
  await joinSpace(await person(), first.code);

  expect((await previewInvite(second.code))?.state).toBe("full");
  const full = { status: 409, message: "This group is full (2 people)." };
  expect(await refusal(joinSpace(await person(), second.code))).toEqual(full);
  expect(await refusal(createInvite(owner, space.id))).toEqual(full);
  // The code is still unused: the refused join took nothing.
  expect((await getPool().query("SELECT used FROM invites WHERE code = $1", [second.code])).rows[0].used).toBe(false);
});

it("recipes kept outside a group come into it on creating and on joining; the list keeps each one's order", async () => {
  const owner = await person();
  const partner = await person();
  const mine = await parked(owner, "Owner's soup", ["a", "b"]);
  const theirs = await parked(partner, "Partner's cake", ["c", "d", "e"]);

  const space = await createSpace(owner);
  expect((await listRecipes(owner)).map((r) => r.id)).toEqual([mine]);
  await joinSpace(partner, (await createInvite(owner, space.id)).code);

  for (const who of [owner, partner]) {
    expect(new Set((await listRecipes(who)).map((r) => r.id))).toEqual(new Set([mine, theirs]));
    expect((await listShopping(who)).map((item) => item.text)).toEqual(["a", "b", "c", "d", "e"]);
  }
  const { rows } = await getPool().query(
    "SELECT count(*)::int AS n FROM recipes WHERE space_id IS NULL AND user_id = ANY($1)",
    [[owner, partner]],
  );
  expect(rows[0].n).toBe(0);
});

it("both see and change the group's recipes, photos and list; nobody else does", async () => {
  const { owner, partner } = await couple();
  const made = await createRecipe(owner, recipe("Pasta"));
  // The partner changes it, and it's changed for both.
  await updateRecipe(partner, made.id, { title: "Pasta al limone" });
  expect((await readRecipe(owner, made.id)).title).toBe("Pasta al limone");
  const [line] = await addShopping(partner, { items: [{ text: "lemons", recipeId: made.id }] });
  expect((await listShopping(owner)).map((item) => [item.text, item.recipeId])).toEqual([["lemons", made.id]]);
  expect(line.recipeId).toBe(made.id);

  const photo = await photoOf(made.id);
  expect(await canSeePhoto(owner, photo.id)).toBe(true);
  expect(await canSeePhoto(partner, photo.id)).toBe(true);

  // Someone in another group: as if it didn't exist. Someone in none: Recipes needs a group.
  const other = await couple();
  expect(await canSeePhoto(other.owner, photo.id)).toBe(false);
  expect(await refusal(readRecipe(other.owner, made.id))).toEqual({ status: 404, message: "Recipe not found." });
  expect(await listRecipes(other.owner)).toEqual([]);
  const alone = await person();
  expect(await canSeePhoto(alone, photo.id)).toBe(false);
  expect(await refusal(listRecipes(alone))).toEqual({ status: 403, message: "Join or create a group first." });
  // Creating with the group's id from another group is refused, not a copy.
  expect(await refusal(createRecipe(other.owner, { ...recipe("Copy"), id: made.id }))).toMatchObject({ status: 409 });
});

it("leaving keeps the recipes with the group; the last one out deletes them, and their photos' files, not their picture", async () => {
  const { owner, partner, spaceId } = await couple();
  const made = await createRecipe(partner, recipe("Partner's"));
  const photo = await photoOf(made.id);
  await addShopping(partner, { items: [{ text: "flour", recipeId: null }] });

  await leaveSpace(partner, spaceId);
  expect((await listRecipes(owner)).map((r) => r.id)).toEqual([made.id]);
  expect((await listShopping(owner)).map((item) => item.text)).toEqual(["flour"]);
  expect(await canSeePhoto(partner, photo.id)).toBe(false);
  expect(await refusal(listRecipes(partner))).toMatchObject({ status: 403 });

  const avatars = process.env.AVATAR_DIR!;
  await mkdir(avatars, { recursive: true });
  const avatar = path.join(avatars, `${owner}.webp`);
  await writeFile(avatar, "avatar");
  await leaveSpace(owner, spaceId);

  expect((await getPool().query("SELECT 1 FROM spaces WHERE id = $1", [spaceId])).rowCount).toBe(0);
  expect((await getPool().query("SELECT 1 FROM recipes WHERE id = $1", [made.id])).rowCount).toBe(0);
  expect(
    (await getPool().query("SELECT 1 FROM shopping_items WHERE text = 'flour' AND user_id = $1", [partner])).rowCount,
  ).toBe(0);
  // Its job (no user) ran with the leave: the photos are gone, the leaver's picture isn't.
  expect(await cleanupMediaJobs(getPool())).toBe(0);
  for (const file of photo.files) expect(await exists(file)).toBe(false);
  expect(await readFile(avatar, "utf8")).toBe("avatar");
});

it("deleting an account deletes what it kept outside a group; a partner's deletion leaves the group's recipes", async () => {
  const alone = await person();
  const kept = await parked(alone, "Kept alone", ["milk"]);
  const photo = await photoOf(kept);
  await deleteAccountData(alone);
  expect((await getPool().query("SELECT 1 FROM recipes WHERE id = $1", [kept])).rowCount).toBe(0);
  expect((await getPool().query("SELECT 1 FROM shopping_items WHERE text = 'milk' AND user_id IS NULL")).rowCount).toBe(
    0,
  );
  for (const file of photo.files) expect(await exists(file)).toBe(false);

  const { owner, partner } = await couple();
  const made = await createRecipe(partner, recipe("Stays"));
  await addShopping(partner, { items: [{ text: "stays too", recipeId: null }] });
  await deleteAccountData(partner);
  expect((await listRecipes(owner)).map((r) => r.title)).toEqual(["Stays"]);
  expect((await listShopping(owner)).map((item) => item.text)).toEqual(["stays too"]);
  expect((await getPool().query("SELECT user_id FROM recipes WHERE id = $1", [made.id])).rows[0].user_id).toBeNull();
});
