import type { APIRequestContext, Page } from "@playwright/test";
import sharp from "sharp";
import { expect, newUser, signUp, test } from "./fixtures";
import { otherPerson } from "./shows";

// The Recipes app (/recipes): a recipe's form and page, its ingredients scaled
// to the servings chosen, photos, tags, search and favourites, the shopping
// list (from a recipe's ingredients, ticked off, cleared with Undo) and the
// API's rules: only your group's recipes (For Couples, docs/decisions/0023),
// shared by its two people, and what it refuses.

const tab = (page: Page, view: "Recipes" | "Favourites" | "Shopping") =>
  page.getByRole("navigation", { name: "Recipes", exact: true }).getByRole("button", { name: view, exact: true });
const cards = (page: Page) => page.getByRole("main").getByRole("list", { name: /^(Recipes|Favourites)$/ });
const cardTitles = (page: Page) => cards(page).locator("li > button:first-child [class*='cardTitle']");

/** Signs up, then creates a group, whose Recipes it is, from the welcome Recipes shows without one. */
async function openRecipes(page: Page) {
  await signUp(page, newUser(), "/signup?next=/recipes");
  await expect(page).toHaveURL("/recipes");
  await expect(page.getByRole("heading", { name: "For Couples" })).toBeVisible();
  await page.getByRole("button", { name: "Create a group" }).click();
  await expect(page.getByRole("navigation", { name: "Recipes", exact: true }).getByRole("button")).toHaveCount(3);
}

const photo = (color: string, width = 1200, height = 900) =>
  sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();

type Created = { id: string; title: string; photos: { id: string }[] };

async function createRecipe(request: APIRequestContext, data: object): Promise<Created> {
  const response = await request.post("/api/recipes", { data });
  expect(response.status(), JSON.stringify(data)).toBe(201);
  return (await response.json()).data;
}

async function addPhoto(request: APIRequestContext, recipeId: string, color = "#c0392b") {
  return request.post(`/api/recipes/${recipeId}/photos`, {
    multipart: { photo: { name: "dish.png", mimeType: "image/png", buffer: await photo(color, 120, 90) } },
  });
}

test("a new recipe: its form, then its page, with the ingredients scaled and a photo added", async ({ page }) => {
  await openRecipes(page);
  await expect(page.getByRole("heading", { name: "Your recipes, in one place" })).toBeVisible();
  await page.getByRole("button", { name: "Add your first recipe" }).click();
  const form = page.getByRole("dialog", { name: "New recipe" });
  await expect(page).toHaveURL("/recipes?p=new");

  // Nothing but a title is needed; Save says what to fix first.
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText("Enter a title.")).toBeVisible();

  await form.getByLabel("Title").fill("Pancakes");
  // No Serves when adding one: it serves 4 until edited, and its page scales it.
  await expect(form.getByLabel("Serves")).toHaveCount(0);
  await form.getByLabel(/^Ingredients/).fill("For the batter:\n- 200 g flour\n- 2 eggs\n- 300 ml milk\nSalt, to taste");
  await form.getByLabel(/^Method/).fill("1. Whisk everything together.\n2. Fry in a hot pan.");
  // Enter adds a tag, and so does a comma; a tag typed but not added counts on Save.
  await form.getByLabel("New tag").fill("Breakfast");
  await form.getByLabel("New tag").press("Enter");
  await form.getByLabel("New tag").pressSequentially("Sweet,");
  await form.getByLabel("New tag").fill("Quick");
  await expect(form.getByRole("button", { name: "Remove the tag Sweet" })).toBeVisible();
  await form.getByLabel(/^Source link/).fill("bbcgoodfood.com/recipes/pancakes");
  await form.getByLabel("Notes").fill("Best with lemon and sugar.");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/recipes") && r.request().method() === "POST");
  await form.getByRole("button", { name: "Save" }).click();

  // Saved, its page opens in the form's place.
  await expect(form).toBeHidden();
  const recipe = page.getByRole("dialog", { name: "Pancakes" });
  await expect(recipe).toBeVisible();
  expect((await created).status()).toBe(201);
  await expect(page).toHaveURL(/\/recipes\?p=recipe%3A[0-9a-f-]{36}$/);
  await expect(recipe).toContainText("Serves 4");
  const source = recipe.getByRole("link", { name: /bbcgoodfood\.com/ });
  await expect(source).toHaveAttribute("href", "https://bbcgoodfood.com/recipes/pancakes");
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(recipe.getByRole("list", { name: "Tags" }).getByRole("listitem")).toHaveText([
    "Breakfast",
    "Sweet",
    "Quick",
  ]);
  const ingredients = recipe.getByRole("region", { name: "Ingredients" }).getByRole("listitem");
  await expect(ingredients).toHaveText(["For the batter", "200 g flour", "2 eggs", "300 ml milk", "Salt, to taste"]);
  await expect(recipe.getByRole("region", { name: "Method" }).getByRole("listitem")).toHaveText([
    "Whisk everything together.",
    "Fry in a hot pan.",
  ]);
  await expect(recipe.getByRole("region", { name: "Notes" })).toContainText("Best with lemon and sugar.");

  // Scaled to six, then to two, then back as written.
  await recipe.getByRole("button", { name: "More servings" }).click();
  await recipe.getByRole("button", { name: "More servings" }).click();
  await expect(recipe.getByRole("group", { name: "Servings" })).toContainText("6");
  await expect(ingredients).toHaveText(["For the batter", "300 g flour", "3 eggs", "450 ml milk", "Salt, to taste"]);
  for (let i = 0; i < 4; i++) await recipe.getByRole("button", { name: "Fewer servings" }).click();
  await expect(ingredients.nth(1)).toHaveText("100 g flour");
  await recipe.getByRole("button", { name: "Reset to 4" }).click();
  await expect(ingredients.nth(1)).toHaveText("200 g flour");
  await expect(recipe.getByRole("button", { name: /^Reset/ })).toBeHidden();

  // A photo: chosen, made small on the server, and the cover.
  const uploaded = page.waitForResponse((r) => r.url().endsWith("/photos") && r.request().method() === "POST");
  await recipe.locator('input[type="file"]').setInputFiles({
    name: "pancakes.png",
    mimeType: "image/png",
    buffer: await photo("#e0a040"),
  });
  expect((await uploaded).status()).toBe(201);
  const image = recipe.getByRole("img", { name: "Photo of Pancakes" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1200);
  await expect(recipe.getByRole("button", { name: "Photo 1 (cover)" })).toBeVisible();

  // Closed, it's a card with its photo, and Back to the list.
  await page.keyboard.press("Escape");
  await expect(recipe).toBeHidden();
  await expect(page).toHaveURL("/recipes");
  await expect(cardTitles(page)).toHaveText(["Pancakes"]);
  const thumb = cards(page).locator("img");
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(640);
  await expect(page.getByText("1 recipe", { exact: true })).toBeVisible();
});

test("tags, search and sort find a recipe; a favourite is a tap; Edit changes it", async ({ page }) => {
  await openRecipes(page);
  for (const recipe of [
    { title: "Lentil soup", tags: ["Dinner", "Vegan"], ingredients: ["200 g red lentils", "1 onion"] },
    { title: "Crème brûlée", tags: ["Dessert"], ingredients: ["4 egg yolks", "500 ml cream"] },
    { title: "Chilli", tags: ["dinner"], ingredients: ["500 g beef"], notes: "Better the next day." },
  ])
    await createRecipe(page.request, recipe);
  await page.reload();
  await expect(page.getByText("3 recipes", { exact: true })).toBeVisible();
  // The newest first.
  await expect(cardTitles(page)).toHaveText(["Chilli", "Crème brûlée", "Lentil soup"]);

  // A tag, in any case, once.
  const tags = page.getByRole("group", { name: "Tags" }).getByRole("button");
  await expect(tags).toHaveText(["All", "Dessert", "Dinner", "Vegan"]);
  await tags.filter({ hasText: "Dinner" }).click();
  await expect(cardTitles(page)).toHaveText(["Chilli", "Lentil soup"]);
  await expect(page.getByText("2 of 3 recipes")).toBeVisible();
  await tags.filter({ hasText: "All" }).click();

  // Search: titles without accents, ingredients, notes.
  const search = page.getByRole("searchbox", { name: "Search your recipes" });
  await search.fill("creme");
  await expect(cardTitles(page)).toHaveText(["Crème brûlée"]);
  await search.fill("lentils");
  await expect(cardTitles(page)).toHaveText(["Lentil soup"]);
  await search.fill("next day");
  await expect(cardTitles(page)).toHaveText(["Chilli"]);
  await search.fill("custard");
  await expect(page.getByText("No recipes match “custard”.")).toBeVisible();
  await page.getByRole("button", { name: "Show them all" }).click();
  await expect(search).toHaveValue("");

  await page.getByRole("combobox", { name: "Sort" }).selectOption("az");
  await expect(cardTitles(page)).toHaveText(["Chilli", "Crème brûlée", "Lentil soup"]);

  // A favourite, from its card: in Favourites at once, and on the server.
  const favourited = page.waitForResponse((r) => r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Favourite Chilli" }).click();
  await expect(page.getByRole("button", { name: "Favourite Chilli" })).toHaveAttribute("aria-pressed", "true");
  expect((await favourited).ok()).toBe(true);
  await tab(page, "Favourites").click();
  await expect(page).toHaveURL("/recipes/favourites");
  await expect(cardTitles(page)).toHaveText(["Chilli"]);

  // Edit: a new title, and it serves 6.
  await cards(page)
    .getByRole("button", { name: /^Chilli/ })
    .click();
  const chilli = page.getByRole("dialog", { name: "Chilli" });
  await expect(chilli.getByRole("button", { name: "Favourite", exact: true })).toHaveAttribute("aria-pressed", "true");
  await chilli.getByRole("button", { name: "Edit" }).click();
  const form = page.getByRole("dialog", { name: "Edit recipe" });
  await expect(form.getByLabel(/^Ingredients/)).toHaveValue("500 g beef");
  await form.getByLabel("Title").fill("Beef chilli");
  await form.getByLabel("Serves").fill("6");
  await form.getByRole("button", { name: "Remove the tag dinner" }).click();
  const saved = page.waitForResponse((r) => r.request().method() === "PATCH");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  const edited = page.getByRole("dialog", { name: "Beef chilli" });
  await expect(edited).toContainText("Serves 6");
  await expect(edited.getByRole("list", { name: "Tags" })).toHaveCount(0);
  expect((await saved).ok()).toBe(true);
  // On the server: a reload opens it from the URL as it is now.
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Beef chilli" })).toContainText("Serves 6");
});

test("the shopping list: a recipe's ingredients scaled, typed lines, ticked off and cleared with Undo", async ({
  page,
}) => {
  await openRecipes(page);
  const { id } = await createRecipe(page.request, {
    title: "Pancakes",
    servings: 2,
    ingredients: ["For the batter:", "100 g flour", "1 egg", "150 ml milk"],
  });
  await page.goto(`/recipes?p=recipe:${id}`);
  const recipe = page.getByRole("dialog", { name: "Pancakes" });
  await recipe.getByRole("button", { name: "More servings" }).click();
  await recipe.getByRole("button", { name: "More servings" }).click();

  // All of them ticked to start with (not the heading): the egg is in the fridge.
  await recipe.getByRole("button", { name: "Add to shopping list" }).click();
  const boxes = recipe.getByRole("checkbox");
  await expect(boxes).toHaveCount(3);
  await recipe.getByRole("checkbox", { name: "2 egg" }).uncheck();
  const added = page.waitForResponse(
    (r) => r.url().endsWith("/api/recipes/shopping") && r.request().method() === "POST",
  );
  await recipe.getByRole("button", { name: "Add 2 items to the list" }).click();
  await expect(recipe.getByRole("status").filter({ hasText: "Added" })).toHaveText(
    "Added 2 items to your shopping list. Open it",
  );
  expect((await added).status()).toBe(201);
  await recipe.getByRole("button", { name: "Open it" }).click();
  await expect(recipe).toBeHidden();
  await expect(page).toHaveURL("/recipes/shopping");

  const toBuy = page.getByRole("list", { name: "To buy" }).getByRole("listitem");
  await expect(toBuy).toHaveCount(2);
  await expect(toBuy.nth(0)).toContainText("200 g flour");
  await expect(toBuy.nth(1)).toContainText("300 ml milk");
  await expect(toBuy.nth(0).getByRole("button", { name: "From Pancakes" })).toBeVisible();

  // Typed in.
  const typed = page.waitForResponse(
    (r) => r.url().endsWith("/api/recipes/shopping") && r.request().method() === "POST",
  );
  await page.getByLabel("Add an item").fill("Lemons");
  await page.getByLabel("Add an item").press("Enter");
  await expect(toBuy).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "To buy (3)" })).toBeVisible();
  expect((await typed).ok()).toBe(true);

  // Home counts what is left to buy: on For Couples' folder, added up, and on Recipes' icon in it.
  await page.goto("/");
  const folder = page.getByRole("main").getByRole("button", { name: /^For Couples/ });
  await expect(folder).toHaveAccessibleName("For Couples, 3 waiting");
  await folder.click();
  await expect(
    page.getByRole("dialog", { name: "For Couples" }).getByRole("link", { name: /^Recipes/ }),
  ).toHaveAccessibleName("Recipes, 3 to buy");
  await page.goto("/recipes/shopping");

  // Ticked off: under Ticked off, and not counted.
  const ticked = page.waitForResponse((r) => r.request().method() === "PATCH");
  await page.getByRole("checkbox", { name: "Lemons" }).check();
  await expect(page.getByRole("heading", { name: "To buy (2)" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Ticked off" }).getByRole("listitem")).toHaveText(["Lemons"]);
  expect((await ticked).ok()).toBe(true);

  // Clear ticked waits for its Undo: undone, then let go.
  await page.getByRole("button", { name: "Clear ticked" }).click();
  await expect(page.getByRole("list", { name: "Ticked off" })).toBeHidden();
  await page
    .getByRole("status")
    .filter({ hasText: "Cleared 1 ticked item" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(page.getByRole("list", { name: "Ticked off" }).getByRole("listitem")).toHaveText(["Lemons"]);
  const cleared = page.waitForResponse((r) => r.url().endsWith("/api/recipes/shopping/remove"));
  await page.getByRole("button", { name: "Clear ticked" }).click();
  expect((await cleared).ok()).toBe(true);
  const items = async () => (await (await page.request.get("/api/recipes/shopping")).json()).data;
  expect(await items()).toEqual([
    expect.objectContaining({ text: "200 g flour", recipeId: id, isChecked: false }),
    expect.objectContaining({ text: "300 ml milk", recipeId: id, isChecked: false }),
  ]);

  // A line's recipe opens from it; a line deleted waits for its Undo too.
  await toBuy.nth(1).getByRole("button", { name: "From Pancakes" }).click();
  await expect(page.getByRole("dialog", { name: "Pancakes" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Delete 200 g flour" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deleted “200 g flour”" })).toBeVisible();
  await expect(toBuy).toHaveCount(1);
});

test("deleting a recipe closes it with Undo, then deletes it and its photos; photos can be the cover or go", async ({
  page,
}) => {
  await openRecipes(page);
  const soup = await createRecipe(page.request, { title: "Soup" });
  for (const color of ["#c0392b", "#27ae60"]) expect((await addPhoto(page.request, soup.id, color)).status()).toBe(201);
  const photos = async () =>
    ((await (await page.request.get(`/api/recipes/${soup.id}`)).json()).data as Created).photos.map((p) => p.id);
  const [first, second] = await photos();
  const large = await page.request.get(`/api/recipes/photos/${first}`);
  expect(large.headers()["content-type"]).toBe("image/webp");
  expect(large.headers()["cache-control"]).toContain("immutable");
  expect((await page.request.get(`/api/recipes/photos/${first}?size=thumb`)).ok()).toBe(true);

  // The second one, made the cover; then the first one removed.
  await page.goto(`/recipes?p=recipe:${soup.id}`);
  const recipe = page.getByRole("dialog", { name: "Soup" });
  await recipe.getByRole("button", { name: "Photo 2" }).click();
  const covered = page.waitForResponse((r) => r.url().endsWith("/cover"));
  await recipe.getByRole("button", { name: "Make cover" }).click();
  expect((await covered).ok()).toBe(true);
  expect(await photos()).toEqual([second, first]);
  await recipe.getByRole("button", { name: "Photo 2" }).click();
  const removed = page.waitForResponse((r) => r.request().method() === "DELETE");
  await recipe.getByRole("button", { name: "Remove photo" }).click();
  await expect(recipe.getByRole("button", { name: /^Photo \d/ })).toHaveCount(1);
  // Its Undo is in the recipe's page, which is modal.
  await expect(recipe.getByRole("status").filter({ hasText: "Photo removed." })).toBeVisible();
  expect((await removed).ok()).toBe(true);
  expect(await photos()).toEqual([second]);
  expect((await page.request.get(`/api/recipes/photos/${first}`)).status()).toBe(404);

  // Delete recipe: closed, gone from the list, with Undo.
  await recipe.getByRole("button", { name: "Delete recipe" }).click();
  await expect(recipe).toBeHidden();
  const toast = page.getByRole("status").filter({ hasText: "Deleted “Soup”" });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(cardTitles(page)).toHaveText(["Soup"]);
  await cards(page).getByRole("button", { name: /^Soup/ }).click();
  const deleted = page.waitForResponse((r) => r.request().method() === "DELETE");
  await recipe.getByRole("button", { name: "Delete recipe" }).click();
  await expect(page.getByRole("heading", { name: "Your recipes, in one place" })).toBeVisible();
  expect((await deleted).ok()).toBe(true);
  expect((await page.request.get(`/api/recipes/${soup.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/recipes/photos/${second}`)).status()).toBe(404);
});

test("the API: only your group's recipes and photos, and what it refuses @smoke", async ({
  page,
  browser,
  request,
}) => {
  await openRecipes(page);
  const mine = await createRecipe(page.request, { title: "Secret sauce", ingredients: ["1 tbsp miso"] });
  expect((await addPhoto(page.request, mine.id)).status()).toBe(201);
  const photoId = ((await (await page.request.get(`/api/recipes/${mine.id}`)).json()).data as Created).photos[0].id;

  // Sent twice (a change that waited offline), a new recipe is answered with what is there.
  const again = await page.request.post("/api/recipes", { data: { id: mine.id, title: "Secret sauce" } });
  expect(again.status()).toBe(201);
  expect((await again.json()).data.id).toBe(mine.id);

  // Download my data has the recipes, each with its photos' links.
  const exported = await (await page.request.get("/api/account/export")).json();
  expect(exported.recipes.recipes).toEqual([
    expect.objectContaining({
      title: "Secret sauce",
      ingredients: ["1 tbsp miso"],
      photos: [`/api/recipes/photos/${photoId}`],
    }),
  ]);
  expect(exported.recipes.shoppingList).toEqual([]);

  // Someone else sees none of it, and can't change it: without a group, Recipes needs one; in their own, it isn't there.
  const other = await otherPerson(browser);
  const theirs = other.page.request;
  const outside = await theirs.get("/api/recipes");
  expect(outside.status()).toBe(403);
  expect((await outside.json()).error).toBe("Join or create a group first.");
  expect((await theirs.get(`/api/recipes/photos/${photoId}`)).status()).toBe(404);
  expect((await theirs.post("/api/shared/spaces", { data: {} })).ok()).toBe(true);
  expect((await (await theirs.get("/api/recipes")).json()).data).toEqual([]);
  expect((await theirs.get(`/api/recipes/${mine.id}`)).status()).toBe(404);
  expect((await theirs.patch(`/api/recipes/${mine.id}`, { data: { title: "Mine now" } })).status()).toBe(404);
  expect((await theirs.delete(`/api/recipes/${mine.id}`)).status()).toBe(404);
  expect((await theirs.get(`/api/recipes/photos/${photoId}`)).status()).toBe(404);
  expect((await theirs.delete(`/api/recipes/photos/${photoId}`)).status()).toBe(404);
  expect((await addPhoto(theirs, mine.id)).status()).toBe(404);
  // Their id can't be taken over either.
  expect((await theirs.post("/api/recipes", { data: { id: mine.id, title: "Mine" } })).status()).toBe(409);
  // A line of their list from my recipe is from no recipe.
  const line = await theirs.post("/api/recipes/shopping", { data: { items: [{ text: "Miso", recipeId: mine.id }] } });
  expect((await line.json()).data).toEqual([expect.objectContaining({ text: "Miso", recipeId: null })]);
  await other.context.close();

  // What it refuses, and why.
  const refused = async (response: Promise<{ status(): number; json(): Promise<{ error: string }> }>) => {
    const r = await response;
    return [r.status(), (await r.json()).error];
  };
  expect(await refused(page.request.post("/api/recipes", { data: {} }))).toEqual([
    400,
    "Enter a title between 1 and 200 characters.",
  ]);
  expect(
    await refused(page.request.post("/api/recipes", { data: { title: "x", sourceUrl: "javascript:alert(1)" } })),
  ).toEqual([400, "Enter a web link, like https://example.com/recipe, or none."]);
  expect(await refused(page.request.patch(`/api/recipes/${mine.id}`, { data: { servings: 101 } }))).toEqual([
    400,
    "Enter how many it serves, from 1 to 100.",
  ]);
  expect(
    await refused(
      page.request.post(`/api/recipes/${mine.id}/photos`, {
        multipart: { photo: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") } },
      }),
    ),
  ).toEqual([400, "That file isn't a photo that can be read. Try a JPEG, PNG or WebP."]);
  // Up to 10 photos.
  for (let i = 1; i < 10; i++) expect((await addPhoto(page.request, mine.id)).status()).toBe(201);
  expect(await refused(addPhoto(page.request, mine.id))).toEqual([409, "A recipe can have up to 10 photos."]);

  // Changes only from this site; logged out, nothing.
  const crossSite = await page.request.patch(`/api/recipes/${mine.id}`, {
    data: { title: "Hacked" },
    headers: { Origin: "https://evil.example" },
  });
  expect(crossSite.status()).toBe(403);
  expect((await request.get("/api/recipes")).status()).toBe(401);
});

test("a group's two people share its recipes, their photos and one shopping list", async ({ page, browser }) => {
  await openRecipes(page);
  const soup = await createRecipe(page.request, { title: "Carrot soup", ingredients: ["4 carrots"] });
  expect((await addPhoto(page.request, soup.id)).status()).toBe(201);
  const photoId = ((await (await page.request.get(`/api/recipes/${soup.id}`)).json()).data as Created).photos[0].id;
  const { data: space } = await (await page.request.get("/api/shared/spaces")).json();
  const invite = await page.request.post(`/api/shared/spaces/${space.id}/invites`, { data: {} });
  const { code } = (await invite.json()).data;

  const partner = await otherPerson(browser);
  try {
    const theirs = partner.page.request;
    expect((await theirs.post("/api/shared/spaces/join", { data: { code } })).ok()).toBe(true);
    // The partner sees the recipe and its photo, and changes it for both.
    await partner.page.goto("/recipes");
    await expect(cardTitles(partner.page)).toHaveText(["Carrot soup"]);
    expect((await theirs.get(`/api/recipes/photos/${photoId}`)).status()).toBe(200);
    expect((await theirs.patch(`/api/recipes/${soup.id}`, { data: { title: "Carrot and ginger soup" } })).ok()).toBe(
      true,
    );
    // And adds to the one list, from the recipe.
    const added = await theirs.post("/api/recipes/shopping", {
      data: { items: [{ text: "4 carrots", recipeId: soup.id }] },
    });
    expect((await added.json()).data).toEqual([expect.objectContaining({ text: "4 carrots", recipeId: soup.id })]);
  } finally {
    await partner.context.close();
  }
  await page.reload();
  await expect(cardTitles(page)).toHaveText(["Carrot and ginger soup"]);
  await tab(page, "Shopping").click();
  await expect(page.getByRole("checkbox", { name: "4 carrots" })).toBeVisible();
});
