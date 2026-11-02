import { randomBytes, randomInt } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, newUser, signUp, test } from "./fixtures";
import { withDatabase } from "./db";
import { card, expectNoHorizontalScroll, grid, libraryRows, mockBase, openShows, row, section, tab, tmdbRequests, typeSwitch, viewHeading } from "./shows";

// Titles of the fake TMDB (lib/tmdb-mock.ts). Its TV shows all have two seasons,
// of 10 and 8 episodes.
type Title = { type: "tv" | "movie"; tmdbId: number };
const harbor: Title = { type: "tv", tmdbId: mockBase + 101 }; // Harbor Lights, 2021
const orchard: Title = { type: "tv", tmdbId: mockBase + 1 }; // The Quiet Orchard, 2016
const series2: Title = { type: "tv", tmdbId: mockBase + 2 }; // Top Rated Series 2, 2001
const paperMoons: Title = { type: "movie", tmdbId: mockBase + 201 }; // Paper Moons, 1994

async function add(page: Page, title: Title, status: "watching" | "planned") {
  const response = await page.request.post("/api/shows/library", { data: { ...title, status } });
  expect(response.status()).toBe(201);
}
const entryUrl = (title: Title) => `/api/shows/library/${title.type}/${title.tmdbId}`;
const pressed = (button: Locator) => expect(button).toHaveAttribute("aria-pressed", "true");

// A finger held still on the element for a while (Chrome turns it into pointer events).
async function longPress(page: Page, locator: Locator) {
  const box = (await locator.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 3 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.waitForTimeout(800);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("Home starts with a welcome, fills up from Discover, and the TV Shows | Movies switch filters every section", async ({ page }) => {
  const user = await openShows(page);
  const main = page.getByRole("main");
  await expect(viewHeading(page)).toHaveText("Home");
  await expect(main.getByRole("heading", { name: "Start by discovering shows!" })).toBeVisible();
  await expect(typeSwitch(page, "TV Shows")).toHaveCount(0);
  await main.getByRole("button", { name: "Go to Discover" }).click();
  await expect(viewHeading(page)).toHaveText("Discover");

  // Added in Discover: on Home at once.
  await card(grid(page, "Popular TV shows"), "Harbor Lights").click();
  const detail = page.getByRole("dialog", { name: "Harbor Lights" });
  await detail.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Watching" }).click();
  await expect(detail.getByRole("status")).toHaveText("✓ In your library");
  await page.keyboard.press("Escape");
  await typeSwitch(page, "Movies").click();
  await card(grid(page, "Top Rated movies"), "Paper Moons").click();
  const movie = page.getByRole("dialog", { name: "Paper Moons" });
  await movie.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Planned" }).click();
  await expect(movie.getByRole("status")).toHaveText("✓ In your library");
  await page.keyboard.press("Escape");
  expect(await libraryRows(user.username)).toEqual([row("tv", harbor.tmdbId), row("movie", paperMoons.tmdbId, { status: "planned" })]);

  await tab(page, "Home").click();
  await expect(main.getByRole("heading", { name: "Start by discovering shows!" })).toHaveCount(0);
  // TV shows first; the switch on Discover is its own.
  await pressed(typeSwitch(page, "TV Shows"));
  const watching = section(page, "Watching");
  await expect(grid(watching, "Watching TV shows").getByRole("listitem")).toHaveCount(1);
  const harborCard = card(watching, "Harbor Lights");
  await expect(harborCard).toHaveAccessibleName("Harbor Lights, 2021, Watching, not started");
  await expect(harborCard).toContainText("Watching");
  await expect(harborCard).toContainText("2021 · Not started");
  await expect(harborCard.locator("img")).toHaveAttribute("src", new RegExp(`/e2e-poster-${harbor.tmdbId}\\.jpg$`));
  await expect(section(page, "Planned")).toHaveText(/No shows planned yet — explore Discover!/);
  await expect(section(page, "Completed")).toHaveText(/No shows completed yet\./);
  await expect(main.getByRole("button", { name: /^Paper Moons,/ })).toHaveCount(0);

  await typeSwitch(page, "Movies").click();
  await pressed(typeSwitch(page, "Movies"));
  await expect(section(page, "Watching")).toHaveText(/not watching any movies yet — explore Discover!/);
  await expect(grid(section(page, "Planned"), "Planned movies").getByRole("listitem")).toHaveCount(1);
  await expect(card(section(page, "Planned"), "Paper Moons")).toHaveAccessibleName("Paper Moons, 1994, Planned");
  await expect(section(page, "Completed")).toHaveText(/No movies completed yet\./);
  await expect(main.getByRole("button", { name: /^Harbor Lights,/ })).toHaveCount(0);

  // Each section lists the latest added or changed first, and says how many it has.
  await add(page, orchard, "planned");
  await add(page, series2, "planned");
  await page.reload();
  await expect(grid(section(page, "Planned"), "Planned TV shows").getByRole("listitem"))
    .toHaveText([/Top Rated Series 2/, /The Quiet Orchard/]);
  await expect(section(page, "Planned").getByText("2", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "TMDB" })).toBeVisible();

  // An empty section's link goes to Discover.
  await typeSwitch(page, "Movies").click();
  await section(page, "Watching").getByRole("button", { name: "explore Discover!" }).click();
  await expect(viewHeading(page)).toHaveText("Discover");
});

test("the detail panel changes status, progress, rating and favourite, and removes the title", async ({ page }) => {
  const user = await openShows(page);
  await add(page, harbor, "watching");
  await page.reload();
  await card(section(page, "Watching"), "Harbor Lights").click();
  const detail = page.getByRole("dialog", { name: "Harbor Lights" });
  await expect(detail).toContainText("TV show · 2021 · ★ 7.8");
  await expect(detail).toContainText("2 seasons · 18 episodes · 52 min episodes");
  await expect(detail).toContainText("Overview of Harbor Lights.");
  const status = detail.getByRole("group", { name: "Status" });
  await pressed(status.getByRole("button", { name: "Watching" }));
  const expectRow = (fields: Parameters<typeof row>[2]) =>
    expect.poll(() => libraryRows(user.username)).toEqual([row("tv", harbor.tmdbId, fields)]);

  // Progress: Next episode, quickly several times, then the season and episode pickers.
  const progress = detail.getByRole("group", { name: "Progress" });
  const season = progress.getByLabel("Season", { exact: true });
  const episode = progress.getByLabel("Episode", { exact: true });
  const next = progress.getByRole("button", { name: /^Next episode/ });
  await expect(progress).toContainText("Not started");
  await expect(episode).toBeDisabled();
  await expect(next).toHaveText("Next episode S1 E1");
  await next.click();
  await expect(season).toHaveValue("1");
  await expect(episode).toHaveValue("1");
  await expectRow({ current_season: 1, current_episode: 1 });
  for (let i = 0; i < 3; i++) await next.click();
  await expect(next).toHaveText("Next episode S1 E5");
  await expectRow({ current_season: 1, current_episode: 4 });
  // From a season's last episode, on to the next season.
  await episode.selectOption("10");
  await expect(next).toHaveText("Next episode S2 E1");
  await season.selectOption("2");
  await expect(episode).toHaveValue("1");
  await expect(episode.locator("option")).toHaveCount(8);
  await episode.selectOption("7");
  await expect(progress).toContainText("S2 E7");
  await expectRow({ current_season: 2, current_episode: 7 });

  // The last episode offers to mark the show completed.
  const offer = detail.getByRole("group", { name: /the last episode\. Mark Harbor Lights as completed\?/ });
  await expect(offer).toHaveCount(0);
  await next.click();
  await expect(offer).toBeVisible();
  await expect(next).toHaveCount(0);
  await offer.getByRole("button", { name: "Not yet" }).click();
  await expect(offer).toHaveCount(0);
  await pressed(status.getByRole("button", { name: "Watching" }));
  await episode.selectOption("7");
  await episode.selectOption("8");
  await offer.getByRole("button", { name: "Mark as completed" }).click();
  await pressed(status.getByRole("button", { name: "Completed" }));
  await expect(progress).toHaveCount(0);
  await expectRow({ status: "completed", current_season: 2, current_episode: 8 });

  // Rating: a star, the same star again clears it, and so does Clear.
  const rating = detail.getByRole("group", { name: "Your rating" });
  await rating.getByRole("button", { name: "4 stars" }).click();
  await pressed(rating.getByRole("button", { name: "4 stars" }));
  await expectRow({ status: "completed", current_season: 2, current_episode: 8, rating: 4 });
  await rating.getByRole("button", { name: "4 stars" }).click();
  await expect(rating.getByRole("button", { pressed: true })).toHaveCount(0);
  await rating.getByRole("button", { name: "5 stars" }).click();
  await rating.getByRole("button", { name: "Clear rating" }).click();
  await expect(rating.getByRole("button", { name: "Clear rating" })).toHaveCount(0);
  await expectRow({ status: "completed", current_season: 2, current_episode: 8 });
  await rating.getByRole("button", { name: "4 stars" }).click();

  const favourite = detail.getByRole("button", { name: "Favourite" });
  await expect(favourite).toHaveAttribute("aria-pressed", "false");
  await favourite.click();
  await pressed(favourite);
  await expectRow({ status: "completed", current_season: 2, current_episode: 8, rating: 4, is_favourite: true });

  // On Home, and still there after a reload.
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(section(page, "Watching")).toHaveText(/not watching any shows yet/);
  const completed = card(section(page, "Completed"), "Harbor Lights");
  await expect(completed).toHaveAccessibleName("Harbor Lights, 2021, Completed, rated 4 out of 5, favourite");
  await expect(completed).toContainText("2021 · ★★★★★");
  await page.reload();
  await expect(completed).toHaveAccessibleName("Harbor Lights, 2021, Completed, rated 4 out of 5, favourite");

  // Back to Watching: the progress is still there.
  await completed.click();
  await status.getByRole("button", { name: "Watching" }).click();
  await expect(progress).toContainText("S2 E8");
  await status.getByRole("button", { name: "Completed" }).click();

  // Remove asks first; Cancel keeps it.
  const remove = detail.getByRole("button", { name: "Remove from library" });
  const confirm = detail.getByRole("group", { name: /^Remove Harbor Lights from your library\?/ });
  await remove.click();
  await expect(remove).toHaveAttribute("aria-expanded", "true");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(remove).toBeFocused();
  await remove.click();
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(detail.getByRole("status")).toHaveText("Removed from your library.");
  const addGroup = detail.getByRole("group", { name: "Add to Library" });
  await expect(addGroup.getByRole("button", { name: "Watching" })).toBeFocused();
  await expect.poll(() => libraryRows(user.username)).toEqual([]);

  // Home is empty again; adding it back starts afresh.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("main").getByRole("heading", { name: "Start by discovering shows!" })).toBeVisible();
});

test("the quick actions menu changes status and rating from a card, and undoes a refused change", async ({ page }) => {
  const user = await openShows(page);
  await add(page, harbor, "watching");
  await add(page, orchard, "planned");
  await page.reload();

  // The ⋯ button on a card opens a menu beside it.
  const planned = section(page, "Planned");
  const menuButton = planned.getByRole("button", { name: "Quick actions for The Quiet Orchard" });
  await menuButton.click();
  const menu = page.getByRole("dialog", { name: "The Quiet Orchard" });
  await expect(menu).toBeVisible();
  // Lined up with the button, just below or above it (where there is more room).
  const buttonBox = (await menuButton.boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(Math.abs(menuBox.x - buttonBox.x)).toBeLessThan(2);
  const gap = menuBox.y >= buttonBox.y + buttonBox.height
    ? menuBox.y - (buttonBox.y + buttonBox.height) : buttonBox.y - (menuBox.y + menuBox.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(20);
  await expect(menu).not.toContainText("Overview");

  await menu.getByRole("group", { name: "Status" }).getByRole("button", { name: "Completed" }).click();
  await pressed(menu.getByRole("group", { name: "Status" }).getByRole("button", { name: "Completed" }));
  await menu.getByRole("group", { name: "Your rating" }).getByRole("button", { name: "3 stars" }).click();
  await pressed(menu.getByRole("group", { name: "Your rating" }).getByRole("button", { name: "3 stars" }));
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(planned).toHaveText(/No shows planned yet/);
  await expect(card(section(page, "Completed"), "The Quiet Orchard")).toHaveAccessibleName("The Quiet Orchard, 2016, Completed, rated 3 out of 5");
  await expect.poll(() => libraryRows(user.username)).toEqual([
    row("tv", orchard.tmdbId, { status: "completed", rating: 3 }), row("tv", harbor.tmdbId),
  ]);

  // A right click opens it too, and Back closes it.
  const harborCard = card(section(page, "Watching"), "Harbor Lights");
  await harborCard.click({ button: "right" });
  const harborMenu = page.getByRole("dialog", { name: "Harbor Lights" });
  await expect(harborMenu.getByRole("group", { name: "Status" })).toBeVisible();
  await page.goBack();
  await expect(harborMenu).toBeHidden();
  await expect(viewHeading(page)).toHaveText("Home");

  // When the server refuses a change, it is undone, with a message.
  await page.route(`**${entryUrl(harbor)}`, (route) => route.request().method() === "PATCH"
    ? route.fulfill({ status: 500, json: { error: "Something went wrong. Please try again." } }) : route.fallback());
  await harborCard.click({ button: "right" });
  await harborMenu.getByRole("group", { name: "Status" }).getByRole("button", { name: "Planned" }).click();
  await expect(harborMenu.getByRole("alert")).toHaveText(/Something went wrong\. Please try again\. Your change was undone\./);
  await pressed(harborMenu.getByRole("group", { name: "Status" }).getByRole("button", { name: "Watching" }));
  await harborMenu.getByRole("alert").getByRole("button", { name: "Dismiss" }).click();
  await expect(harborMenu.getByRole("alert")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(card(section(page, "Watching"), "Harbor Lights")).toBeVisible();
  expect((await libraryRows(user.username))[1]).toEqual(row("tv", harbor.tmdbId));

  // A plain click opens the detail panel.
  await page.unroute(`**${entryUrl(harbor)}`);
  await harborCard.click();
  await expect(page.getByRole("dialog", { name: "Harbor Lights" })).toContainText("Overview of Harbor Lights.");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a long press on a card opens the quick actions as a bottom sheet; a tap opens the details", async ({ page }) => {
    const user = await openShows(page);
    await add(page, harbor, "watching");
    await page.reload();
    const harborCard = card(section(page, "Watching"), "Harbor Lights");
    await expect(harborCard).toBeVisible();

    await longPress(page, harborCard);
    const menu = page.getByRole("dialog", { name: "Harbor Lights" });
    await expect(menu.getByRole("group", { name: "Status" })).toBeVisible();
    // Lifting the finger didn't close it, or open the details.
    await page.waitForTimeout(300);
    await expect(menu.getByRole("group", { name: "Status" })).toBeVisible();
    await expect(menu).not.toContainText("Overview");
    const box = (await menu.boundingBox())!;
    expect(box.width).toBe(390);
    expect(box.y + box.height).toBeCloseTo(844, 0);
    await expectNoHorizontalScroll(page);

    await menu.getByRole("group", { name: "Status" }).getByRole("button", { name: "Completed" }).tap();
    await menu.getByRole("group", { name: "Your rating" }).getByRole("button", { name: "5 stars" }).tap();
    await page.goBack();
    await expect(menu).toBeHidden();
    const completed = card(section(page, "Completed"), "Harbor Lights");
    await expect(completed).toHaveAccessibleName("Harbor Lights, 2021, Completed, rated 5 out of 5");
    await expect.poll(() => libraryRows(user.username)).toEqual([row("tv", harbor.tmdbId, { status: "completed", rating: 5 })]);

    // A tap opens the details, a bottom sheet with the same controls.
    await completed.tap();
    const detail = page.getByRole("dialog", { name: "Harbor Lights" });
    await expect(detail).toContainText("Overview of Harbor Lights.");
    await pressed(detail.getByRole("group", { name: "Status" }).getByRole("button", { name: "Completed" }));
    await detail.getByRole("group", { name: "Status" }).getByRole("button", { name: "Watching" }).tap();
    await detail.getByRole("group", { name: "Progress" }).getByRole("button", { name: /^Next episode/ }).tap();
    await expect(detail.getByRole("group", { name: "Progress" })).toContainText("S1 E1");
    // At least 16px, so iOS doesn't zoom in on the pickers.
    await expect(detail.getByLabel("Season", { exact: true })).toHaveCSS("font-size", "16px");
    await expectNoHorizontalScroll(page);
    await page.goBack();
    await expect(card(section(page, "Watching"), "Harbor Lights")).toHaveAccessibleName("Harbor Lights, 2021, Watching, season 1 episode 1");
    await expect(card(section(page, "Watching"), "Harbor Lights")).toContainText("2021 · S1 E1");
  });
});

test("the library API lists, changes and removes titles, and checks every change", async ({ page, browser, baseURL, playwright }) => {
  const user = await openShows(page);
  await add(page, orchard, "planned");
  await add(page, harbor, "watching");
  await add(page, paperMoons, "planned");
  const library = async () => {
    const response = await page.request.get("/api/shows/library");
    expect(response.status()).toBe(200);
    return (await response.json()).data as { title: string }[];
  };
  const patch = (title: Title, data: object, headers: Record<string, string> = {}) => page.request.patch(entryUrl(title), { data, headers });

  // The latest added or changed first.
  const titles = async () => (await library()).map((item) => item.title);
  expect(await titles()).toEqual(["Paper Moons", "Harbor Lights", "The Quiet Orchard"]);
  expect((await library())[1]).toEqual({
    type: "tv", tmdbId: harbor.tmdbId, title: "Harbor Lights", year: 2021, posterPath: `/e2e-poster-${harbor.tmdbId}.jpg`, rating: 7.8,
    library: { id: expect.any(String), status: "watching", rating: null, currentSeason: null, currentEpisode: null, isFavourite: false },
  });

  const changed = await patch(orchard, { status: "watching", currentSeason: 2, currentEpisode: 8, rating: 5, isFavourite: true });
  expect(changed.status()).toBe(200);
  expect((await changed.json()).data).toEqual({
    id: expect.any(String), status: "watching", rating: 5, currentSeason: 2, currentEpisode: 8, isFavourite: true,
  });
  expect(await titles()).toEqual(["The Quiet Orchard", "Paper Moons", "Harbor Lights"]);
  expect((await patch(orchard, { currentSeason: null, currentEpisode: null, rating: null })).status()).toBe(200);
  expect((await patch(paperMoons, { status: "completed", rating: 2 })).status()).toBe(200);

  // Refused changes, which change nothing.
  const refused: [Title, object, number, string][] = [
    [harbor, { status: "dropped" }, 400, "Choose Watching, Planned or Completed."],
    ...[0, 6, 2.5, "4"].map((value): [Title, object, number, string] => [harbor, { rating: value }, 400, "Rate it from 1 to 5 stars."]),
    [harbor, { isFavourite: "yes" }, 400, "Mark it as a favourite or not."],
    ...[{ currentSeason: 3, currentEpisode: 1 }, { currentSeason: 2, currentEpisode: 9 }, { currentSeason: 0, currentEpisode: 1 },
      { currentSeason: 1 }, { currentSeason: null, currentEpisode: 2 }, { currentSeason: 1.5, currentEpisode: 1 }]
      .map((value): [Title, object, number, string] => [harbor, value, 400, "This show has no such episode."]),
    [harbor, { status: "planned", rating: 9 }, 400, "Rate it from 1 to 5 stars."],
    [harbor, {}, 400, "Nothing to change."],
    [harbor, { title: "Renamed" }, 400, "Nothing to change."],
    [paperMoons, { currentSeason: 1, currentEpisode: 1 }, 400, "Movies have no episodes."],
    [series2, { status: "planned" }, 404, "This title isn't in your library."],
  ];
  for (const [title, data, statusCode, error] of refused) {
    const response = await patch(title, data);
    expect(response.status(), JSON.stringify(data)).toBe(statusCode);
    expect((await response.json()).error).toBe(error);
  }
  for (const path of ["/api/shows/library/book/1", "/api/shows/library/tv/abc", `/api/shows/library/tv/${2 ** 31}`]) {
    expect((await page.request.patch(path, { data: { status: "planned" } })).status(), path).toBe(404);
  }
  expect((await patch(harbor, { status: "planned" }, { Origin: "https://evil.example" })).status()).toBe(403);
  expect((await page.request.patch(entryUrl(harbor), { data: "status=planned", headers: { "Content-Type": "text/plain" } })).status()).toBe(415);
  expect((await page.request.delete(entryUrl(harbor), { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
  const expected = [row("tv", orchard.tmdbId, { is_favourite: true }), row("tv", harbor.tmdbId),
    row("movie", paperMoons.tmdbId, { status: "completed", rating: 2 })];
  expect(await libraryRows(user.username)).toEqual(expected);

  // Someone else can't change or remove titles in this library: only in their own.
  const context = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": `10.${[...randomBytes(3)].join(".")}` } });
  const other = await context.newPage();
  await signUp(other, newUser());
  await expect(other).toHaveURL("/apps");
  expect((await (await other.request.get("/api/shows/library")).json()).data).toEqual([]);
  expect((await other.request.patch(entryUrl(harbor), { data: { status: "completed" } })).status()).toBe(404);
  expect((await other.request.delete(entryUrl(harbor))).status()).toBe(404);
  await context.close();
  expect(await libraryRows(user.username)).toEqual(expected);

  // Removing: once.
  const removed = await page.request.delete(entryUrl(paperMoons));
  expect(removed.status()).toBe(200);
  expect((await removed.json()).data).toBeNull();
  expect((await page.request.delete(entryUrl(paperMoons))).status()).toBe(404);
  expect(await titles()).toEqual(["The Quiet Orchard", "Harbor Lights"]);

  // Logged out: 401.
  const anonymous = await playwright.request.newContext({ baseURL });
  expect((await anonymous.get("/api/shows/library")).status()).toBe(401);
  expect((await anonymous.patch(entryUrl(harbor), { data: { status: "completed" } })).status()).toBe(401);
  expect((await anonymous.delete(entryUrl(harbor))).status()).toBe(401);
  await anonymous.dispose();
});

test("loading the library fetches titles older than 7 days from TMDB again, after answering with the old copy", async ({ page }) => {
  await openShows(page);
  // A title no other test opens.
  const title: Title = { type: "tv", tmdbId: mockBase + 1_000_000 + randomInt(1_000_000) };
  const name = `Mock Series ${title.tmdbId - mockBase}`;
  await add(page, title, "planned");
  const cachedTitle = async () => (await withDatabase((client) => client.query(
    "SELECT title FROM shows WHERE type = 'tv' AND tmdb_id = $1", [title.tmdbId]))).rows[0].title;
  const libraryTitles = async () => ((await (await page.request.get("/api/shows/library")).json()).data as { title: string }[])
    .map((item) => item.title);
  const age = (days: number) => withDatabase((client) => client.query(
    "UPDATE shows SET title = 'Old title', last_updated = now() - make_interval(days => $2) WHERE type = 'tv' AND tmdb_id = $1",
    [title.tmdbId, days]));
  expect(await tmdbRequests(page, `/tv/${title.tmdbId}`)).toHaveLength(1);

  // 6 days old: kept as it is.
  await age(6);
  expect(await libraryTitles()).toEqual(["Old title"]);
  await page.waitForTimeout(500);
  expect(await cachedTitle()).toBe("Old title");
  expect(await tmdbRequests(page, `/tv/${title.tmdbId}`)).toHaveLength(1);

  // 8 days old: the old copy now, the new one after.
  await age(8);
  expect(await libraryTitles()).toEqual(["Old title"]);
  await expect.poll(cachedTitle).toBe(name);
  expect(await libraryTitles()).toEqual([name]);
  expect(await tmdbRequests(page, `/tv/${title.tmdbId}`)).toHaveLength(2);
});
