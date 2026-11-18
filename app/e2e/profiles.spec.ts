import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test, newUser, signUp } from "./fixtures";
import { mockBase, otherPerson, userId } from "./shows";
import { withDatabase } from "./db";

test.beforeEach(() => test.slow());

const state = async (page: Page) => (await (await page.request.get("/api/social/friends")).json()).data;
const profile = (page: Page, id: string) => page.request.get(`/api/social/profiles/${id}`);
const appTab = (page: Page, app: "Shows" | "Books", name: string) =>
  page.getByRole("navigation", { name: app, exact: true }).getByRole("button", { name, exact: true });
// Friends, profiles and friends' activity are in the Profile tab of Shows and of Books.
async function openProfile(page: Page, app: "shows" | "books" = "books") {
  const me = newUser();
  await signUp(page, me, `/signup?next=/${app}/profile`);
  await expect(page).toHaveURL(`/${app}/profile`, { timeout: 30000 });
  return { ...me, id: await userId(me.username) };
}
async function book(page: Page, title: string, shelf = "want-to-read", pagesRead = 0, totalPages: number | null = 200) {
  const response = await page.request.post("/api/books", {
    data: { title, shelf, pagesRead, totalPages, author: "A. Reader" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data;
}

test("friend lifecycle in the Books profile: requests, decline, cancellation, crossed requests and removal with Undo", async ({
  page,
  browser,
}) => {
  const me = await openProfile(page);
  const friend = await otherPerson(browser);
  try {
    await page.getByLabel("Add a friend").fill(friend.user.username);
    await expect(page.getByText(`${friend.user.username} has an account`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByRole("list", { name: "Sent requests" })).toContainText(friend.user.username);
    expect((await profile(page, friend.id)).status()).toBe(404);
    expect((await friend.page.request.post(`/api/social/friends/${me.id}/decline`, { data: {} })).status()).toBe(200);
    expect((await state(page)).outgoing).toEqual([]);
    expect(
      (await page.request.post("/api/social/friends", { data: { username: friend.user.username } })).status(),
    ).toBe(201);
    await page.reload();
    await page.getByRole("button", { name: `Cancel request to ${friend.user.username}` }).click();
    await expect(page.getByRole("list", { name: "Sent requests" })).toHaveCount(0);
    expect((await friend.page.request.post("/api/social/friends", { data: { username: me.username } })).status()).toBe(
      201,
    );
    await page.reload();
    await page.getByRole("button", { name: `Accept ${friend.user.username}` }).click();
    await expect(page.getByRole("list", { name: "Your friends" })).toContainText(friend.user.username);
    const remove = page.getByRole("button", { name: `Remove ${friend.user.username}` });
    await remove.click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(remove).toBeVisible();
    expect((await profile(page, friend.id)).status()).toBe(200);
    await remove.click();
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await profile(page, friend.id)).status(), { timeout: 15000 }).toBe(404);
    expect((await profile(friend.page, me.id)).status()).toBe(404);
    // Asking simultaneously becomes a single accepted friendship.
    await Promise.all([
      page.request.post("/api/social/friends", { data: { username: friend.user.username } }),
      friend.page.request.post("/api/social/friends", { data: { username: me.username } }),
    ]);
    expect((await state(page)).friends.map((p: { id: string }) => p.id)).toEqual([friend.id]);
    expect((await page.request.post("/api/social/friends", { data: { username: me.username } })).status()).toBe(400);
    expect((await page.request.post(`/api/social/friends/${friend.id}/accept`, { data: {} })).status()).toBe(404);
    expect(
      (
        await page.request.delete(`/api/social/friends/${friend.id}`, { headers: { Origin: "https://evil.example" } })
      ).status(),
    ).toBe(403);
  } finally {
    await friend.context.close();
  }
});

test("Shows and Books profiles share planned shows, shelves, stats and progress only with accepted friends", async ({
  page,
  browser,
  playwright,
}) => {
  const me = await openProfile(page);
  const friend = await otherPerson(browser);
  const stranger = await otherPerson(browser);
  try {
    await book(friend.page, "Reading now", "currently-reading", 40);
    await book(friend.page, "Read next");
    await book(friend.page, "Already read", "finished", 0, 300);
    await book(friend.page, "Unknown length", "finished", 70, null);
    for (const status of ["watching", "planned", "completed"] as const) {
      const tmdbId = mockBase + (status === "watching" ? 101 : status === "planned" ? 1 : 2);
      expect(
        (await friend.page.request.post("/api/shows/library", { data: { type: "tv", tmdbId, status } })).status(),
      ).toBe(201);
    }
    await friend.page.request.patch(`/api/shows/library/tv/${mockBase + 101}`, {
      data: { currentSeason: 1, currentEpisode: 2, isFavourite: true },
    });
    expect((await profile(page, friend.id)).status()).toBe(404);
    expect((await page.goto(`/shows/profile/${friend.id}`))?.status()).toBe(404);
    expect((await page.goto(`/books/profile/${friend.id}`))?.status()).toBe(404);
    await page.request.post("/api/social/friends", { data: { username: friend.user.username } });
    expect((await profile(page, friend.id)).status()).toBe(404);
    await friend.page.request.post(`/api/social/friends/${me.id}/accept`, { data: {} });
    const response = await profile(page, friend.id);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const data = (await response.json()).data;
    expect(data.books.stats).toEqual({ wantToRead: 1, currentlyReading: 1, finished: 2, pagesRead: 410 });
    expect(data.shows.stats).toEqual({ tvCompleted: 1, moviesCompleted: 0, episodesWatched: 20, minutesWatched: 914 });
    expect(data.shows.items.map((item: { library: { status: string } }) => item.library.status).sort()).toEqual([
      "completed",
      "planned",
      "watching",
    ]);
    expect(data.shows.items[0].library).not.toHaveProperty("id");
    expect(data.books.items[0]).not.toHaveProperty("updatedAt");
    expect(
      (await page.request.patch(`/api/books/${data.books.items[0].id}`, { data: data.books.items[0] })).status(),
    ).toBe(404);
    const own = await friend.page.request.get("/api/social/profile");
    expect((await own.json()).data.books).toEqual(data.books);
    expect((await profile(stranger.page, friend.id)).status()).toBe(404);
    expect((await profile(page, randomUUID())).status()).toBe(404);
    expect((await profile(page, "not-an-id")).status()).toBe(404);
    const anonymous = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    expect((await anonymous.get(`/api/social/profiles/${friend.id}`)).status()).toBe(401);
    await anonymous.dispose();
    // Old links (a friend's panel in Shows, and Social's pages) open the Shows profile.
    await page.goto(`/shows/profile?p=friend:${friend.id}`);
    await expect(page).toHaveURL(`/shows/profile/${friend.id}`);
    await page.goto(`/social/profile/${friend.id}`);
    await expect(page).toHaveURL(`/shows/profile/${friend.id}`);
    await expect(page.getByRole("heading", { name: friend.user.name, level: 1 })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("shows-profile.png"), fullPage: true });
    // Shows' profile has their shows, not their books.
    await expect(
      page.getByRole("region", { name: "Planned", exact: true }).getByRole("link", { name: /The Quiet Orchard/ }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Books", exact: true })).toHaveCount(0);
    await page
      .getByRole("region", { name: "Watching", exact: true })
      .getByRole("link", { name: /Harbor Lights/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Harbor Lights" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`/shows/profile/${friend.id}`);
    await appTab(page, "Shows", "Profile").click();
    await expect(page).toHaveURL("/shows/profile");
    await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
    await page.goto("/social");
    await expect(page).toHaveURL("/shows/profile");

    // Books' profile has their books, not their shows.
    await page.goto(`/books/profile/${friend.id}`);
    await expect(page.getByRole("heading", { name: friend.user.name, level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Currently Reading", exact: true })).toContainText("40 / 200 pages");
    await expect(page.getByRole("progressbar", { name: "Reading progress for Reading now" })).toHaveAttribute(
      "value",
      "20",
    );
    await expect(page.getByRole("region", { name: "Shows", exact: true })).toHaveCount(0);
    await appTab(page, "Books", "Profile").click();
    await expect(page).toHaveURL("/books/profile");
    await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
    // Profiles are never kept for offline use.
    expect(await page.evaluate(() => Object.values(localStorage).some((value) => value.includes("Reading now")))).toBe(
      false,
    );
    await page.goto(`/books/profile/${friend.id}`);
    await expect(page.getByRole("region", { name: "Books", exact: true })).toContainText("Reading now");
    await friend.page.request.delete(`/api/social/friends/${me.id}`);
    const revoked = page.waitForResponse(
      (response) => response.url().endsWith(`/api/social/profiles/${friend.id}`) && response.status() === 404,
    );
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await revoked;
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Profile not found.");
    await expect(page.getByRole("region", { name: "Books", exact: true })).toHaveCount(0);
  } finally {
    await friend.context.close();
    await stranger.context.close();
  }
});

test("Books activity follows shelf changes, stays private, exports, and cascades on deletion", async ({
  page,
  browser,
}) => {
  const me = await openProfile(page);
  const friend = await otherPerson(browser);
  try {
    const saved = await book(friend.page, "Feed book");
    const feed = async () => (await (await page.request.get("/api/social/activity")).json()).data;
    expect(await feed()).toEqual([]);
    await page.request.post("/api/social/friends", { data: { username: friend.user.username } });
    await friend.page.request.post(`/api/social/friends/${me.id}/accept`, { data: {} });
    expect((await feed()).map((item: { kind: string }) => item.kind)).toEqual(["book-planned"]);
    // A private Shared-style activity row must never appear in friends' activity.
    await withDatabase((db) =>
      db.query("INSERT INTO activity (user_id, kind, data) VALUES ($1, 'event-added', $2)", [
        friend.id,
        { title: "Private event" },
      ]),
    );
    const patch = (change: object) =>
      friend.page.request.patch(`/api/books/${saved.id}`, { data: { ...saved, ...change } });
    expect((await patch({ shelf: "currently-reading", pagesRead: 10 })).ok()).toBe(true);
    expect((await feed()).map((item: { kind: string }) => item.kind)).toEqual(["book-reading"]);
    const before = (await feed())[0];
    expect((await patch({ shelf: "currently-reading", pagesRead: 30 })).ok()).toBe(true);
    expect((await feed())[0].id).toBe(before.id);
    expect((await patch({ shelf: "finished" })).ok()).toBe(true);
    expect((await feed()).map((item: { kind: string }) => item.kind)).toEqual(["book-finished"]);
    await page.reload();
    await expect(page.getByRole("region", { name: "Friends’ activity", exact: true })).toContainText(
      `${friend.user.name} finished reading Feed book`,
    );
    // Shows' profile has friends' watching, not their reading.
    await page.goto("/shows/profile");
    await expect(page.getByRole("region", { name: "Friends’ activity", exact: true })).toContainText(
      "Nothing yet. Add friends to keep up with their watching.",
    );
    await page.goto("/books/profile");
    await page.getByRole("link", { name: "Feed book", exact: true }).click();
    await expect(page).toHaveURL(`/books/profile/${friend.id}`);
    await expect(page.getByRole("region", { name: "Books", exact: true })).toContainText("Feed book");
    const exported = await friend.page.request.get("/api/account/export");
    const archive = await exported.json();
    expect(archive.activity).toContainEqual(
      expect.objectContaining({ kind: "book-finished", bookId: saved.id, data: { title: "Feed book" } }),
    );
    expect(archive.social.friends[0].username).toBe(me.username);
    expect((await friend.page.request.delete(`/api/books/${saved.id}`)).ok()).toBe(true);
    expect(await feed()).toEqual([]);
    await page.request.delete(`/api/social/friends/${friend.id}`);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Books", exact: true })).toHaveCount(0);
  } finally {
    await friend.context.close();
  }
});

test("a failed Books activity write rolls back the shelf change and preserves earlier activity", async ({ page }) => {
  const me = await openProfile(page);
  const saved = await book(page, "Keep my shelf");
  const suffix = randomUUID().replaceAll("-", "");
  const trigger = `e2e_social_${suffix}`;
  // The trigger affects this test's account only, never concurrent test accounts.
  await withDatabase(async (db) => {
    await db.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.user_id = '${me.id}'::uuid AND NEW.book_id IS NOT NULL THEN
        RAISE EXCEPTION 'Simulated activity write failure'; END IF; RETURN NEW; END $$`);
    await db.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON activity FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
  });
  try {
    const failed = await page.request.patch(`/api/books/${saved.id}`, { data: { ...saved, shelf: "finished" } });
    expect(failed.status()).toBe(500);
    const books = (await (await page.request.get("/api/books")).json()).data;
    expect(books[0]).toMatchObject({ id: saved.id, shelf: "want-to-read", pagesRead: 0 });
    const { rows } = await withDatabase((db) => db.query("SELECT kind FROM activity WHERE book_id=$1", [saved.id]));
    expect(rows).toEqual([{ kind: "book-planned" }]);
    const insertion = await page.request.post("/api/books", { data: { title: "Must roll back too" } });
    expect(insertion.status()).toBe(500);
    expect((await (await page.request.get("/api/books")).json()).data).toHaveLength(1);
  } finally {
    await withDatabase(async (db) => {
      await db.query(`DROP TRIGGER IF EXISTS ${trigger} ON activity`);
      await db.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
    });
  }
});

test("Shows refreshes friend discovery after friendships change", async ({ page, browser }) => {
  const me = await openProfile(page);
  const friend = await otherPerson(browser);
  try {
    await friend.page.request.post("/api/shows/library", {
      data: { type: "tv", tmdbId: mockBase + 101, status: "watching" },
    });
    await page.goto("/shows/discover");
    const added = page.getByRole("region", { name: "Added by Friends", exact: true });
    await added.scrollIntoViewIfNeeded();
    await expect(added).toContainText("No TV shows from friends yet.");
    await friend.page.request.post("/api/social/friends", { data: { username: me.username } });
    await page.request.post(`/api/social/friends/${friend.id}/accept`, { data: {} });
    const shows = page.getByRole("navigation", { name: "Shows", exact: true });
    await shows.getByRole("button", { name: "Library", exact: true }).click();
    await shows.getByRole("button", { name: "Discover", exact: true }).click();
    await added.scrollIntoViewIfNeeded();
    await expect(added.getByRole("button", { name: /^Harbor Lights,/ })).toBeVisible();
    await page.request.delete(`/api/social/friends/${friend.id}`);
    await shows.getByRole("button", { name: "Library", exact: true }).click();
    await shows.getByRole("button", { name: "Discover", exact: true }).click();
    await added.scrollIntoViewIfNeeded();
    await expect(added).toContainText("No TV shows from friends yet.");
  } finally {
    await friend.context.close();
  }
});
