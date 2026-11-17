import { expect, newUser, signUp, test } from "./fixtures";
import { checkView } from "./checks";

test("books: add manually, save progress across reloads, finish and undo removal", async ({ page }) => {
  await signUp(page, newUser(), "/signup?next=%2Fbooks");
  await expect(page).toHaveURL("/books");
  await page.getByRole("button", { name: "Add book", exact: true }).click();
  await page.getByRole("button", { name: "Add manually" }).click();
  const form = page.getByRole("dialog", { name: "Add book", exact: true });
  await form.getByLabel("Title", { exact: true }).fill("A reading journey");
  await form.getByLabel("Author", { exact: true }).fill("A. Reader");
  await form.getByLabel("Total pages").fill("200");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  // Manual entry returns to search, then close it to see the shelf.
  await page.getByRole("dialog", { name: "Find a book" }).getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /^A reading journey/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit book", exact: true });
  await edit.getByLabel("Shelf", { exact: true }).selectOption("currently-reading");
  await edit.getByLabel("Pages read").fill("75");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Want to Read", "Currently Reading", "Finished"]);
  await expect(page.getByText("75 of 200 pages · 38%")).toBeVisible();
  await page.reload();
  await expect(page.getByText("75 of 200 pages · 38%")).toBeVisible();
  await checkView(page, "Books reading shelf");
  await page.getByRole("button", { name: "Update progress" }).click();
  await edit.getByLabel("Pages read").fill("200");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(page).toHaveURL("/books");
  await expect(page.getByText("200 of 200 pages · 100%")).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: /^A reading journey/ })).toBeVisible();
  const exported = await (await page.request.get("/api/account/export")).json();
  expect(exported.books).toEqual([
    expect.objectContaining({ title: "A reading journey", pagesRead: 200, shelf: "finished" }),
  ]);
});

test("books API: validation, duplicate prevention, ownership and deletion", async ({ page, browser }) => {
  await signUp(page, newUser(), "/signup?next=%2Fbooks");
  await expect(page).toHaveURL("/books");
  const book = { title: "Dune", catalogId: "OL893415W", totalPages: 400, shelf: "currently-reading", pagesRead: 100 };
  const created = await page.request.post("/api/books", { data: book });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).data;
  expect((await page.request.post("/api/books", { data: book })).status()).toBe(409);
  expect((await page.request.patch(`/api/books/${id}`, { data: { ...book, pagesRead: 401 } })).status()).toBe(400);
  expect(
    (await page.request.patch(`/api/books/${id}`, { data: book, headers: { origin: "https://example.com" } })).status(),
  ).toBe(403);
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await signUp(other, newUser(), "/signup?next=%2Fbooks");
    await expect(other).toHaveURL("/books");
    expect((await (await other.request.get("/api/books")).json()).data).toEqual([]);
    expect((await other.request.patch(`/api/books/${id}`, { data: book })).status()).toBe(404);
    expect((await other.request.delete(`/api/books/${id}`)).status()).toBe(404);
  } finally {
    await context.close();
  }
  expect((await page.request.delete(`/api/books/${id}`)).status()).toBe(200);
  expect((await (await page.request.get("/api/books")).json()).data).toEqual([]);
});

test("books catalogue: search, add a result and handle a failed search", async ({ page }) => {
  await signUp(page, newUser(), "/signup?next=%2Fbooks");
  await expect(page).toHaveURL("/books");
  await page.route("**/api/books/search?*", (route) =>
    route.fulfill({
      json: {
        data: [{ catalogId: "OL893415W", title: "Dune", author: "Frank Herbert", coverId: null, totalPages: 400 }],
      },
    }),
  );
  await page.getByRole("button", { name: "Add book", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Find a book" });
  await search.getByLabel("Title, author or ISBN").fill("Dune");
  await search.getByRole("button", { name: "Search", exact: true }).click();
  await search.getByRole("button", { name: "Add", exact: true }).click();
  await search.getByRole("button", { name: "Save", exact: true }).click();
  await expect(search).toBeHidden();
  await expect(page.getByRole("button", { name: /^Dune/ })).toBeVisible();
  await page.route("**/api/books/search?*", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "Book search is unavailable. Try again, or add your book manually." },
    }),
  );
  await page.getByRole("button", { name: "Add book", exact: true }).click();
  await search.getByLabel("Title, author or ISBN").fill("another book");
  await search.getByRole("button", { name: "Search", exact: true }).click();
  await expect(search.getByRole("alert")).toContainText("Book search is unavailable");
  await expect(search.getByRole("button", { name: "Add manually" })).toBeVisible();
});
