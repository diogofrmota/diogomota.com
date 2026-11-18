import type { Page } from "@playwright/test";
import { checkView } from "./checks";
import { expect, newUser, signUp, test } from "./fixtures";
import { card, loadSections, section } from "./shows";

// Books, which looks and works as Shows does: Library's shelves (Currently
// Reading, Want to Read, Finished), Discover's lists from Open Library, a
// book's panel, quick actions and search. Open Library is never reached: the
// browser's calls to the app's catalogue routes are answered here.

const dune = { catalogId: "OL893415W", title: "Dune", author: "Frank Herbert", coverId: null, totalPages: 400 };

const tab = (page: Page, view: string) =>
  page.getByRole("navigation", { name: "Books", exact: true }).getByRole("button", { name: view, exact: true });

async function openBooks(page: Page) {
  await signUp(page, newUser(), "/signup?next=%2Fbooks");
  await expect(page).toHaveURL("/books");
}

test("Discover: lists, retry, a book put on a shelf from its cover, and its panel", async ({ page }) => {
  await openBooks(page);
  let popularFailed = true;
  await page.route("**/api/books/discover?*", (route) => {
    const list = new URL(route.request().url()).searchParams.get("list");
    if (list === "popular" && popularFailed)
      return route.fulfill({ status: 502, json: { error: "This book list is unavailable. Please try again." } });
    return route.fulfill({ json: { data: list === "top-rated" ? [] : [dune] } });
  });
  await page.route("**/api/books/works/*", (route) =>
    route.fulfill({
      json: {
        data: {
          ...dune,
          year: 1965,
          description: "Set on the desert planet Arrakis.",
          subjects: ["Fiction", "Science fiction"],
        },
      },
    }),
  );
  await tab(page, "Discover").click();
  await expect(page).toHaveURL("/books/discover");
  await loadSections(page);
  const trending = section(page, "Trending");
  const popular = section(page, "Popular today");
  await expect(card(trending, "Dune")).toHaveAccessibleName("Dune, Frank Herbert");
  await expect(popular.getByRole("alert")).toContainText("unavailable");
  await expect(section(page, "Top rated")).toContainText("No books in this list right now.");
  popularFailed = false;
  await popular.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(card(popular, "Dune")).toBeVisible();

  // + on the cover: the shelves over it; the book is then on Reading, in both lists.
  await trending.getByRole("button", { name: "Add Dune to your shelves" }).click();
  await trending.getByRole("group", { name: "Add Dune as" }).getByRole("button", { name: "Reading" }).click();
  await expect(card(trending, "Dune")).toHaveAccessibleName("Dune, Frank Herbert, Currently Reading");
  await expect(popular.getByRole("button", { name: "Quick actions for Dune" })).toBeVisible();

  // Its panel, in the URL: the description, the shelf, and the pages read.
  await card(trending, "Dune").click();
  await expect(page).toHaveURL("/books/discover?p=work%3AOL893415W");
  const panel = page.getByRole("dialog", { name: "Dune" });
  await expect(panel).toContainText("Frank Herbert");
  await expect(panel).toContainText("First published 1965 · 400 pages");
  await expect(panel).toContainText("Fiction · Science fiction");
  await expect(panel.getByRole("region", { name: "Description" })).toContainText("Set on the desert planet Arrakis.");
  const shelf = panel.getByRole("group", { name: "Shelf" });
  await expect(shelf.getByRole("button", { name: "Reading" })).toHaveAttribute("aria-pressed", "true");
  await panel.getByLabel("Pages read").fill("500");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByText("Enter a page from 0 to 400.")).toBeVisible();
  // Shown at once; reloaded once the server has it.
  const saved = page.waitForResponse((r) => r.url().includes("/api/books/") && r.request().method() === "PATCH");
  await panel.getByLabel("Pages read").fill("50");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("50 of 400 pages read");
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Dune" })).toContainText("50 of 400 pages read");
  await page.getByRole("dialog", { name: "Dune" }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL("/books/discover");

  await page.setViewportSize({ width: 375, height: 812 });
  await checkView(page, "Books Discover");
  await tab(page, "Library").click();
  await expect(card(section(page, "Currently Reading"), "Dune")).toHaveAccessibleName(
    "Dune, Frank Herbert, Currently Reading, 50 of 400 pages · 13%",
  );
  expect((await page.request.get("/api/books/discover?list=invalid")).status()).toBe(400);
});

test("a book added yourself: its pages from quick actions, finished, edited, removed and back with Undo", async ({
  page,
}) => {
  await openBooks(page);
  // Nothing yet: where to find books.
  await expect(page.getByRole("heading", { name: "Start by discovering books!" })).toBeVisible();
  await page.getByRole("button", { name: "Add a book yourself" }).click();
  await expect(page).toHaveURL("/books?p=new");
  const form = page.getByRole("dialog", { name: "Add a book" });
  // Only the title is needed; Save says so first.
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("Enter a title.");
  await expect(form.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
  await form.getByLabel("Title").fill("A reading journey");
  await form.getByLabel("Author").fill("A. Reader");
  await form.getByLabel(/^Number of pages/).fill("200");
  await form.getByRole("group", { name: "Shelf" }).getByRole("button", { name: "Reading" }).click();
  await form.getByLabel("Pages read").fill("250");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("Pages read can’t be more than its number of pages.");
  await form.getByLabel("Pages read").fill("75");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form).toBeHidden();

  // The shelves, what is being read first.
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText([
    "Currently Reading",
    "Want to Read",
    "Finished",
  ]);
  const reading = section(page, "Currently Reading");
  await expect(card(reading, "A reading journey")).toHaveAccessibleName(
    "A reading journey, A. Reader, Currently Reading, 75 of 200 pages · 38%",
  );
  await page.reload();
  await expect(reading).toContainText("75 of 200 pages · 38%");

  // Quick actions (⋯): the last page finishes it.
  await reading.getByRole("button", { name: "Quick actions for A reading journey" }).click();
  const actions = page.getByRole("dialog", { name: "A reading journey" });
  await actions.getByLabel("Pages read").fill("200");
  await actions.getByRole("button", { name: "Save", exact: true }).click();
  await expect(actions.getByRole("group", { name: "Shelf" }).getByRole("button", { name: "Finished" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await actions.getByRole("button", { name: "Close", exact: true }).click();
  const finished = section(page, "Finished");
  await expect(card(finished, "A reading journey")).toBeVisible();
  await expect(reading).toContainText("You’re not reading anything yet");

  // Its panel: Edit details, over it.
  await card(finished, "A reading journey").click();
  await page.getByRole("dialog", { name: "A reading journey" }).getByRole("button", { name: "Edit details" }).click();
  const edit = page.getByRole("dialog", { name: "Edit details" });
  await edit.getByLabel("Title").fill("A longer reading journey");
  await edit.getByLabel(/^Number of pages/).fill("250");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "A longer reading journey" });
  await expect(panel).toContainText("250 pages");

  // Remove from shelves: the panel says so, with Undo.
  await panel.getByRole("button", { name: "Remove from shelves" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Removed from your shelves." })).toBeVisible();
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(panel.getByRole("group", { name: "Shelf" })).toBeVisible();
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(card(finished, "A longer reading journey")).toBeVisible();
  // Each change was shown at once, and the server has them all, in order.
  const exported = async () => (await page.request.get("/api/account/export")).json();
  await expect
    .poll(async () => (await exported()).books)
    .toEqual([
      expect.objectContaining({
        title: "A longer reading journey",
        totalPages: 250,
        pagesRead: 250,
        shelf: "finished",
      }),
    ]);
  expect(await exported()).not.toHaveProperty("benfica");

  // Removed again and the panel closed: the app's message has the Undo, then it's gone for good.
  await card(finished, "A longer reading journey").click();
  await panel.getByRole("button", { name: "Remove from shelves" }).click();
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Removed “A longer reading journey”" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start by discovering books!" })).toBeVisible();
  await expect.poll(async () => (await (await page.request.get("/api/books")).json()).data).toEqual([]);
});

test("books API: validation, duplicate prevention, ownership and deletion", async ({ page, browser }) => {
  await openBooks(page);
  const book = { title: "Dune", catalogId: "OL893415W", totalPages: 400, shelf: "currently-reading", pagesRead: 100 };
  const created = await page.request.post("/api/books", { data: book });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).data;
  expect((await page.request.post("/api/books", { data: book })).status()).toBe(409);
  expect((await page.request.patch(`/api/books/${id}`, { data: { ...book, pagesRead: 401 } })).status()).toBe(400);
  expect(
    (await page.request.patch(`/api/books/${id}`, { data: book, headers: { origin: "https://example.com" } })).status(),
  ).toBe(403);
  // A book's page is only asked for a catalogue work's id.
  expect((await page.request.get("/api/books/works/not-a-work")).status()).toBe(404);
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await openBooks(other);
    expect((await (await other.request.get("/api/books")).json()).data).toEqual([]);
    expect((await other.request.patch(`/api/books/${id}`, { data: book })).status()).toBe(404);
    expect((await other.request.delete(`/api/books/${id}`)).status()).toBe(404);
  } finally {
    await context.close();
  }
  expect((await page.request.delete(`/api/books/${id}`)).status()).toBe(200);
  expect((await (await page.request.get("/api/books")).json()).data).toEqual([]);
});

test("search: results as typing pauses, a result put on a shelf, and a failed search", async ({ page }) => {
  await openBooks(page);
  await page.route("**/api/books/search?*", (route) => route.fulfill({ json: { data: [dune] } }));
  await tab(page, "Discover").click();
  await page.getByRole("button", { name: "Search books by title, author or ISBN" }).click();
  await expect(page).toHaveURL("/books/discover?p=search");
  const search = page.getByRole("dialog", { name: "Search books" });
  await search.getByRole("searchbox", { name: "Search books" }).fill("Dune");
  const results = search.getByRole("list", { name: "Search results" });
  await results.getByRole("button", { name: "Add Dune to your shelves" }).click();
  await results.getByRole("button", { name: "Want to Read" }).click();
  await expect(results.getByRole("button", { name: "Quick actions for Dune" })).toBeVisible();
  await search.getByRole("button", { name: "Close", exact: true }).click();
  await tab(page, "Library").click();
  await expect(card(section(page, "Want to Read"), "Dune")).toBeVisible();

  // A failed search says so, and a book can be added by hand from there.
  await page.route("**/api/books/search?*", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "Book search is unavailable. Try again, or add your book manually." },
    }),
  );
  await tab(page, "Discover").click();
  await page.getByRole("button", { name: "Search books by title, author or ISBN" }).click();
  await search.getByRole("searchbox", { name: "Search books" }).fill("another book");
  await expect(search.getByRole("alert")).toContainText("Book search is unavailable");
  await search.getByRole("button", { name: "Add a book yourself" }).click();
  await expect(page.getByRole("dialog", { name: "Add a book" })).toBeVisible();
  await expect(page).toHaveURL("/books/discover?p=search&p=new");
});
