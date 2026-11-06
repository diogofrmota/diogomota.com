import { randomBytes, randomInt } from "node:crypto";
import { expect, test } from "./fixtures";
import { withDatabase } from "./db";
import { card, expectNoHorizontalScroll, grid, libraryRows, mockBase, openShows, otherPerson, row, section, tab, tmdbRequests, typeSwitch, userId, viewHeading, wholeCard } from "./shows";

async function cachedShow(type: "tv" | "movie", tmdbId: number) {
  const { rows } = await withDatabase((client) => client.query(
    `SELECT title, year, poster_url, vote_average::float8 AS rating, overview, runtime, episode_runtime,
       episodes_per_season, last_updated > now() - interval '1 minute' AS just_updated
     FROM shows WHERE type = $1 AND tmdb_id = $2`, [type, tmdbId]));
  return rows[0];
}

test("Discover shows TMDB's lists, three genres and Added by Friends, for TV shows and for movies", async ({ page, context, isMobile }) => {
  const browserHosts = new Set<string>();
  context.on("request", (request) => browserHosts.add(new URL(request.url()).host));
  await openShows(page);

  // Holds Top Rated's answer, to see its skeleton.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/shows/discover/tv/top-rated", async (route) => { await held; await route.continue(); });
  await tab(page, "Discover").click();
  await expect(viewHeading(page)).toHaveText("Discover");
  const topRated = section(page, "Top Rated");
  await expect(topRated).toHaveAttribute("aria-busy", "true");
  await expect(topRated.getByRole("status")).toHaveText("Loading top rated TV shows…");
  await expect(topRated.getByTestId("skeleton").locator("li")).toHaveCount(8);
  release();

  // One row of 20 that scrolls sideways.
  const topList = grid(page, "Top Rated TV shows");
  await expect(topList.getByRole("button")).toHaveCount(20);
  await expect(topRated).toHaveAttribute("aria-busy", "false");
  await expect(topRated.getByTestId("skeleton")).toHaveCount(0);
  const first = topList.getByRole("button").first();
  await expect(first).toHaveAccessibleName("The Quiet Orchard, 2016, rated 9.1 out of 10");
  await expect(first).toContainText("The Quiet Orchard");
  await expect(wholeCard(first)).toContainText("2016 · ★ 9.1");
  // The poster comes from TMDB's image server, in one of its sizes.
  await expect.poll(() => first.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await first.locator("img").evaluate((img: HTMLImageElement) => img.currentSrc))
    .toMatch(new RegExp(`^https://image\\.tmdb\\.org/t/p/w(92|154|185|342|500|780)/e2e-poster-${mockBase + 1}\\.jpg$`));
  // One without a poster shows its title instead.
  await expect(card(topList, "Top Rated Series 20").locator("img")).toHaveCount(0);
  await expect(card(topList, "Top Rated Series 20")).toContainText("Top Rated Series 20");
  // A 9.9 from 12 votes isn't Top Rated: the next page fills its place.
  await expect(card(topList, "Obscure Gem")).toHaveCount(0);
  await expect(card(topList, "Top Rated Series 21")).toHaveCount(1);
  if (!isMobile) {
    // With a mouse: › and ‹ page through the row, each only where there's more.
    const back = topRated.getByRole("button", { name: "Scroll left" });
    const forward = topRated.getByRole("button", { name: "Scroll right" });
    await expect(back).toBeDisabled();
    await topList.hover();
    await forward.click();
    await expect.poll(() => topList.evaluate((list) => list.scrollLeft)).toBeGreaterThan(0);
    await expect(back).toBeEnabled();
  }

  // Each title in one section only, the first it would be in: Glass Meridian
  // is trending and popular, Harbor Lights popular and a comedy (lib/tmdb-mock.ts).
  // Top Rated repeats what it likes.
  const trending = grid(page, "Trending This Week TV shows");
  await expect(trending.getByRole("button").first()).toHaveAccessibleName("Glass Meridian, 2026, rated 8.2 out of 10");
  const popular = grid(page, "Popular TV shows");
  await expect(popular.getByRole("button")).toHaveCount(20);
  await expect(popular.getByRole("button").first()).toHaveAccessibleName("Harbor Lights, 2021, rated 7.8 out of 10");
  await expect(card(popular, "Glass Meridian")).toHaveCount(0);
  const comedy = grid(page, "Comedy TV shows");
  await expect(comedy.getByRole("button")).toHaveCount(20);
  await expect(comedy.getByRole("button").first()).toHaveAccessibleName("Laugh Track, 2022, rated 7.9 out of 10");
  await expect(card(comedy, "Harbor Lights")).toHaveCount(0);
  await expect(grid(page, "Crime TV shows").getByRole("button").first()).toHaveAccessibleName("Cold Case Avenue, 2020, rated 8.0 out of 10");
  await expect(grid(page, "Sci-Fi & Fantasy TV shows").getByRole("button").first()).toHaveAccessibleName("Starbound, 2024, rated 8.1 out of 10");
  await expect(section(page, "Added by Friends")).toContainText("No TV shows from friends yet.");
  // In this order. For You is made from the library's titles: none without any.
  const headings = page.getByRole("main").getByRole("heading", { level: 2 });
  await expect(headings).toHaveText(["Trending This Week", "Popular", "Top Rated", "Comedy", "Crime", "Sci-Fi & Fantasy", "Added by Friends"]);

  // Movies: the same, with what's in cinemas soon, and their own genres.
  await typeSwitch(page, "Movies").click();
  await expect(typeSwitch(page, "Movies")).toHaveAttribute("aria-pressed", "true");
  await expect(typeSwitch(page, "TV Shows")).toHaveAttribute("aria-pressed", "false");
  await expect(grid(page, "Top Rated movies").getByRole("button")).toHaveCount(20);
  await expect(grid(page, "Top Rated movies").getByRole("button").first()).toHaveAccessibleName("Paper Moons, 1994, rated 8.9 out of 10");
  await expect(grid(page, "Popular movies").getByRole("button").first()).toHaveAccessibleName("Northern Line, 2025, rated 7.2 out of 10");
  await expect(section(page, "Added by Friends")).toContainText("No movies from friends yet.");
  // A 9.8 from 7 votes isn't trending either.
  const trendingMovies = grid(page, "Trending This Week movies");
  await expect(trendingMovies.getByRole("button").first()).toHaveAccessibleName("Copper Sky, 2026, rated 7.6 out of 10");
  await expect(trendingMovies.getByRole("button")).toHaveCount(20);
  await expect(card(trendingMovies, "Festival Darling")).toHaveCount(0);
  await expect(section(page, "Coming Soon")).toHaveAccessibleDescription("In cinemas soon.");
  await expect(grid(page, "Coming Soon movies").getByRole("button").first()).toHaveAccessibleName("Tomorrow's Tide, 2027, rated 7.0 out of 10");
  await expect(grid(page, "Action movies").getByRole("button").first()).toHaveAccessibleName("Iron Tide, 2025, rated 7.4 out of 10");
  await expect(grid(page, "Comedy movies").getByRole("button").first()).toHaveAccessibleName("Best Man Down, 2023, rated 7.1 out of 10");
  await expect(grid(page, "Science Fiction movies").getByRole("button").first()).toHaveAccessibleName("Orbit Nine, 2026, rated 7.7 out of 10");
  await expect(headings).toHaveText(["Trending This Week", "Popular", "Coming Soon", "Top Rated", "Action", "Comedy", "Science Fiction", "Added by Friends"]);

  // Back to TV shows: shown at once, from what the page already loaded.
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/shows/")) requests.push(request.url()); });
  await typeSwitch(page, "TV Shows").click();
  await expect(grid(page, "Top Rated TV shows").getByRole("button")).toHaveCount(20);
  await expect(grid(page, "Popular TV shows").getByRole("button")).toHaveCount(20);
  expect(requests).toEqual([]);

  // TMDB's logo and notice, as its terms require.
  const logo = page.getByRole("main").getByRole("link", { name: "TMDB" });
  await expect(logo).toHaveAttribute("href", "https://www.themoviedb.org/");
  await expect(logo.getByRole("img", { name: "TMDB" })).toBeVisible();
  // Discover's own: the hidden Home (the guide, on a new account) has one too.
  await expect(page.getByRole("main").getByText(
    "This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.").filter({ visible: true })).toBeVisible();

  // The server asked TMDB with its token (Top Rated and the genres are its /discover);
  // the browser only ever loaded images from TMDB.
  const calls = await tmdbRequests(page, "/discover/tv");
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((call) => call.authorized)).toBe(true);
  expect([...browserHosts].filter((host) => /themoviedb|tmdb/.test(host))).toEqual(["image.tmdb.org"]);
});

test("search opens from Discover and an empty Home (not the top bar), waits for typing to pause, and finds TV shows and movies", async ({ page }) => {
  await openShows(page);
  const searches: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/shows/discover/search") searches.push(url.searchParams.get("q") ?? "");
  });
  const dialog = page.getByRole("dialog", { name: "Search" });
  const input = dialog.getByRole("searchbox", { name: "Search TV shows and movies" });
  // The top bar has the tabs and the account menu, no search.
  await expect(page.getByRole("banner").getByRole("button", { name: /search/i })).toHaveCount(0);
  // An empty Home without its guide (which searches in itself).
  await page.getByRole("main").getByRole("button", { name: "Skip" }).click();

  // Discover's search field at the top, and the Search button of an empty library.
  const launchers = {
    Home: page.getByRole("main").getByRole("button", { name: "Search", exact: true }),
    Discover: page.getByRole("main").getByRole("button", { name: "Search TV shows and movies" }),
  };
  for (const [view, launcher] of Object.entries(launchers)) {
    await tab(page, view).click();
    await expect(viewHeading(page)).toHaveText(view);
    await launcher.click();
    await expect(dialog).toBeVisible();
    await expect(input).toBeFocused();
    await expect(dialog).toContainText("Find any TV show or movie by its title.");
    // Back closes it, on the same view.
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(viewHeading(page)).toHaveText(view);
  }
  await launchers.Discover.click();
  await expect(input).toBeFocused();

  // Typing at a normal pace sends one search, once typing stops.
  await input.pressSequentially("Harbor", { delay: 60 });
  const results = grid(dialog, "Search results");
  await expect(results.getByRole("button")).toHaveCount(2);
  expect(searches).toEqual(["Harbor"]);
  // TV shows and movies alike; the person TMDB also finds is left out.
  await expect(results.getByRole("button").nth(0)).toHaveAccessibleName("Harbor Lights, TV show, 2021, rated 7.8 out of 10");
  await expect(results.getByRole("button").nth(1)).toHaveAccessibleName("Harbor Lights: Low Tide, Movie, 2024, rated 6.4 out of 10");
  await expect(dialog.getByRole("status")).toHaveText("2 results for “Harbor”");

  // A result's detail opens over the search; back returns to the results.
  await card(results, "Harbor Lights: Low Tide").click();
  const detail = page.getByRole("dialog", { name: "Harbor Lights: Low Tide" });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Movie · 2024 · ★ 6.4");
  await page.goBack();
  await expect(detail).toBeHidden();
  await expect(input).toHaveValue("Harbor");
  await expect(results.getByRole("button")).toHaveCount(2);

  await input.fill("Nothing like this");
  await expect(dialog.getByRole("status")).toHaveText("No TV shows or movies found for “Nothing like this”.");

  // When TMDB fails: a friendly message, and Retry asks again.
  await input.fill("tmdb-down");
  const alert = dialog.getByRole("alert");
  await expect(alert).toContainText("TMDB isn't answering right now. Try again in a moment.");
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => searches.filter((q) => q === "tmdb-down").length).toBe(2);
  await expect(alert).toContainText("TMDB isn't answering right now.");

  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(viewHeading(page)).toHaveText("Discover");
  // Reopened, it still has the last search.
  await launchers.Discover.click();
  await expect(input).toHaveValue("tmdb-down");
  // Escape closes it (in a filled search field, browsers may clear it first).
  await input.fill("");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(viewHeading(page)).toHaveText("Discover");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the detail panel adds a title to the library, as Watching or Planned", async ({ page }) => {
    const user = await openShows(page);
    await tab(page, "Discover").tap();
    await card(grid(page, "Popular TV shows"), "Harbor Lights").tap();
    const detail = page.getByRole("dialog", { name: "Harbor Lights" });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("TV show · 2021 · ★ 7.8");
    await expect(detail).toContainText("2 seasons · 18 episodes · 52 min episodes");
    await expect(detail).toContainText("Overview of Harbor Lights.");
    await expect(detail.getByRole("region", { name: "Seasons" }).getByRole("listitem"))
      .toHaveText([/^Season 1\s*10 episodes$/, /^Season 2\s*8 episodes$/]);
    // A bottom sheet.
    const box = (await detail.boundingBox())!;
    expect(box.width).toBe(390);
    expect(box.y + box.height).toBeCloseTo(844, 0);
    await expectNoHorizontalScroll(page);

    // Opening it cached the title, with its seasons (no specials, no empty
    // announced season) and the latest episode's runtime, as TMDB has no
    // typical one for it.
    expect(await cachedShow("tv", mockBase + 101)).toMatchObject({
      title: "Harbor Lights", year: 2021, poster_url: `/e2e-poster-${mockBase + 101}.jpg`, rating: 7.8,
      overview: "Overview of Harbor Lights.", runtime: null, episode_runtime: 52, episodes_per_season: [10, 8],
    });
    expect(await libraryRows(user.username)).toEqual([]);

    await detail.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Watching" }).tap();
    await expect(detail.getByRole("status")).toHaveText("✓ In your library");
    await expect(detail.getByRole("group", { name: "Status" }).getByRole("button", { name: "Watching" })).toHaveAttribute("aria-pressed", "true");
    await expect(detail.getByRole("group", { name: "Add to Library" })).toHaveCount(0);
    expect(await libraryRows(user.username)).toEqual([row("tv", mockBase + 101)]);

    // Back closes it; opened again, it knows the title is in the library.
    await page.goBack();
    await expect(detail).toBeHidden();
    await card(grid(page, "Popular TV shows"), "Harbor Lights").tap();
    await expect(detail.getByRole("status")).toHaveText("✓ In your library");
    await expect(detail.getByRole("group", { name: "Status" }).getByRole("button", { name: "Watching" })).toHaveAttribute("aria-pressed", "true");
    await detail.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(detail).toBeHidden();

    await typeSwitch(page, "Movies").tap();
    await card(grid(page, "Top Rated movies"), "Paper Moons").tap();
    const movie = page.getByRole("dialog", { name: "Paper Moons" });
    await expect(movie).toContainText("Movie · 1994 · ★ 8.9");
    await expect(movie).toContainText("2h 8m");
    await movie.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Planned" }).tap();
    await expect(movie.getByRole("status")).toHaveText("✓ In your library");
    await expect(movie.getByRole("group", { name: "Status" }).getByRole("button", { name: "Planned" })).toHaveAttribute("aria-pressed", "true");
    expect(await cachedShow("movie", mockBase + 201)).toMatchObject({
      title: "Paper Moons", year: 1994, runtime: 128, episode_runtime: null, episodes_per_season: null,
    });
    expect(await libraryRows(user.username)).toEqual([row("tv", mockBase + 101), row("movie", mockBase + 201, { status: "planned" })]);
    await page.keyboard.press("Escape");
    await expect(movie).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test("the search panel fills the screen", async ({ page }) => {
    await openShows(page);
    await tab(page, "Discover").tap();
    await page.getByRole("main").getByRole("button", { name: "Search TV shows and movies" }).tap();
    const dialog = page.getByRole("dialog", { name: "Search" });
    // Popular Series 2 to 20 but 6 (the first popular TV show is Harbor Lights, the sixth Glass Meridian).
    await dialog.getByRole("searchbox").fill("Popular Series");
    await expect(grid(dialog, "Search results").getByRole("button")).toHaveCount(18);
    expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    // At least 16px, so iOS doesn't zoom in on it.
    await expect(dialog.getByRole("searchbox")).toHaveCSS("font-size", "16px");
    await expectNoHorizontalScroll(page);
  });
});

test("the library API checks what it adds, and who asks", async ({ page, baseURL, playwright }) => {
  const user = await openShows(page);
  const add = (data: object, headers: Record<string, string> = {}) => page.request.post("/api/shows/library", { data, headers });

  const added = await add({ type: "tv", tmdbId: mockBase + 2, status: "planned" });
  expect(added.status()).toBe(201);
  expect((await added.json()).data).toMatchObject({
    type: "tv", tmdbId: mockBase + 2, title: "Top Rated Series 2", episodesPerSeason: [10, 8], episodeRuntime: 45,
    library: { status: "planned", rating: null, isFavourite: false },
  });
  const again = await add({ type: "tv", tmdbId: mockBase + 2, status: "watching" });
  expect(again.status()).toBe(409);
  expect((await again.json()).error).toBe("This title is already in your library.");

  expect((await add({ type: "tv", tmdbId: mockBase + 3, status: "completed" })).status()).toBe(400);
  expect((await add({ type: "book", tmdbId: mockBase + 3, status: "planned" })).status()).toBe(404);
  for (const tmdbId of [-4, 0, 1.5, "12abc", 2 ** 31]) expect((await add({ type: "tv", tmdbId, status: "planned" })).status()).toBe(404);
  const unknown = await add({ type: "movie", tmdbId: 12345, status: "planned" });
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).error).toBe("TMDB doesn't have this title.");
  expect((await add({ type: "tv", tmdbId: mockBase + 3, status: "planned" }, { Origin: "https://evil.example" })).status()).toBe(403);
  expect((await page.request.post("/api/shows/library", { data: "not json", headers: { "Content-Type": "text/plain" } })).status()).toBe(415);
  expect(await libraryRows(user.username)).toEqual([row("tv", mockBase + 2, { status: "planned" })]);

  for (const path of ["/discover/tv/upcoming", "/discover/anime/popular", "/discover/tv", "/titles/book/1", "/titles/tv/abc"]) {
    expect((await page.request.get(`/api/shows${path}`)).status(), path).toBe(404);
  }
  expect((await page.request.get(`/api/shows/discover/search?q=${"x".repeat(101)}`)).status()).toBe(400);
  expect((await (await page.request.get("/api/shows/discover/search?q=%20%20")).json()).data).toEqual([]);

  // Logged out, every endpoint answers 401.
  const anonymous = await playwright.request.newContext({ baseURL });
  for (const path of ["/discover/tv/popular", "/discover/search?q=Harbor", `/titles/tv/${mockBase + 2}`]) {
    expect((await anonymous.get(`/api/shows${path}`)).status()).toBe(401);
  }
  expect((await anonymous.post("/api/shows/library", { data: { type: "tv", tmdbId: mockBase + 2, status: "planned" } })).status()).toBe(401);
  await anonymous.dispose();
});

test("details are cached in the shows table and fetched again after 7 days; lists and searches for a few minutes", async ({ page }) => {
  await openShows(page);
  // A title no other test opens.
  const tmdbId = mockBase + 1_000_000 + randomInt(1_000_000);
  const path = `/tv/${tmdbId}`;
  const read = async () => {
    const response = await page.request.get(`/api/shows/titles/tv/${tmdbId}`);
    expect(response.status()).toBe(200);
    return (await response.json()).data;
  };
  const age = (days: number) => withDatabase((client) => client.query(
    "UPDATE shows SET title = 'Old title', last_updated = now() - make_interval(days => $2) WHERE type = 'tv' AND tmdb_id = $1",
    [tmdbId, days]));

  expect(await read()).toMatchObject({ title: `Mock Series ${tmdbId - mockBase}`, episodesPerSeason: [10, 8], episodeRuntime: 45, library: null });
  expect(await tmdbRequests(page, path)).toHaveLength(1);
  expect(await cachedShow("tv", tmdbId)).toMatchObject({ title: `Mock Series ${tmdbId - mockBase}`, just_updated: true });
  await read();
  expect(await tmdbRequests(page, path)).toHaveLength(1);

  // 6 days old: still the cached copy.
  await age(6);
  expect((await read()).title).toBe("Old title");
  expect(await tmdbRequests(page, path)).toHaveLength(1);
  // 8 days old: fetched again.
  await age(8);
  expect((await read()).title).toBe(`Mock Series ${tmdbId - mockBase}`);
  expect(await tmdbRequests(page, path)).toHaveLength(2);
  expect(await cachedShow("tv", tmdbId)).toMatchObject({ title: `Mock Series ${tmdbId - mockBase}`, just_updated: true });

  // The same search twice (in any case) asks TMDB once.
  const query = `Orchard ${randomBytes(4).toString("hex")}`;
  for (const q of [query, query.toUpperCase()]) {
    expect((await page.request.get(`/api/shows/discover/search?${new URLSearchParams({ q })}`)).ok()).toBe(true);
  }
  expect((await tmdbRequests(page, "/search/multi")).filter((call) => call.query?.toLowerCase() === query.toLowerCase())).toHaveLength(1);
  // And a list that was just loaded isn't asked for again.
  expect((await page.request.get("/api/shows/discover/movie/popular")).ok()).toBe(true);
  const before = (await tmdbRequests(page, "/movie/popular")).length;
  expect((await page.request.get("/api/shows/discover/movie/popular")).ok()).toBe(true);
  expect(await tmdbRequests(page, "/movie/popular")).toHaveLength(before);
});

test("For You recommends titles like the ones in the library, leaving out the ones already in it", async ({ page }) => {
  await openShows(page);
  // Top Rated Series 2, and The Quiet Orchard, which TMDB recommends first for any title (lib/tmdb-mock.ts).
  for (const tmdbId of [mockBase + 2, mockBase + 1]) {
    expect((await page.request.post("/api/shows/library", { data: { type: "tv", tmdbId, status: "watching" } })).status()).toBe(201);
  }
  await page.reload();
  await tab(page, "Discover").click();
  const forYou = section(page, "For You");
  await expect(forYou).toHaveAccessibleDescription("Picked from TMDB's recommendations for the titles in your library.");
  const list = grid(forYou, "For You TV shows");
  await expect(list.getByRole("button").first()).toHaveAccessibleName("Lanterns at Dusk, 2019, rated 8.4 out of 10");
  await expect(card(list, "The Quiet Orchard")).toHaveCount(0);
  await expect(card(list, "Top Rated Series 2")).toHaveCount(0);
  // First of all.
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText("For You");
  for (const tmdbId of [mockBase + 1, mockBase + 2]) expect(await tmdbRequests(page, `/tv/${tmdbId}/recommendations`)).not.toHaveLength(0);

  // No movies in the library: no For You for movies, until one is added.
  await typeSwitch(page, "Movies").click();
  await expect(grid(page, "Popular movies").getByRole("button")).toHaveCount(20);
  await expect(section(page, "For You")).toHaveCount(0);
  await card(grid(page, "Popular movies"), "Northern Line").click();
  const detail = page.getByRole("dialog", { name: "Northern Line" });
  await detail.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Planned" }).click();
  await expect(detail.getByRole("status")).toHaveText("✓ In your library");
  await page.keyboard.press("Escape");
  const movies = grid(section(page, "For You"), "For You movies").getByRole("button");
  await expect(movies.nth(0)).toHaveAccessibleName("Paper Moons, 1994, rated 8.9 out of 10");
  await expect(movies.nth(1)).toHaveAccessibleName("The Last Ferry, 2018, rated 8.1 out of 10");
});

test("Added by Friends shows the titles in accepted friends' libraries", async ({ page, browser }) => {
  const me = await openShows(page);
  const meId = await userId(me.username);
  // A friend (Harbor Lights, Northern Line, Paper Moons), and someone whose
  // friend request is still pending (The Quiet Orchard, Paper Moons).
  const libraries: [string, number][][] = [
    [["tv", mockBase + 101], ["movie", mockBase + 301], ["movie", mockBase + 201]],
    [["tv", mockBase + 1], ["movie", mockBase + 201]],
  ];
  const people = [];
  for (const titles of libraries) {
    const person = await otherPerson(browser);
    for (const [type, tmdbId] of titles) {
      expect((await person.page.request.post("/api/shows/library", { data: { type, tmdbId, status: "watching" } })).status()).toBe(201);
    }
    people.push(person);
  }
  const friends = (type: string) => page.request.get(`/api/shows/discover/${type}/friends`).then(async (r) => (await r.json()).data);
  expect(await friends("tv")).toEqual([]);

  // The first asked me and I accepted; I asked the second, who hasn't answered.
  expect((await people[0].page.request.post("/api/shows/friends", { data: { username: me.username } })).status()).toBe(201);
  expect((await page.request.post(`/api/shows/friends/${people[0].id}/accept`, { data: {} })).status()).toBe(200);
  expect((await page.request.post("/api/shows/friends", { data: { username: people[1].user.username } })).status()).toBe(201);

  await tab(page, "Discover").click();
  const friendsSection = section(page, "Added by Friends");
  await expect(grid(friendsSection, "Added by Friends TV shows").getByRole("button")).toHaveCount(1);
  await expect(grid(friendsSection, "Added by Friends TV shows").getByRole("button")).toHaveAccessibleName("Harbor Lights, 2021, rated 7.8 out of 10");
  await typeSwitch(page, "Movies").click();
  await expect(grid(friendsSection, "Added by Friends movies").getByRole("button"))
    .toHaveText([/Northern Line/, /Paper Moons/]);
  // Cards open the same detail panel.
  await card(grid(friendsSection, "Added by Friends movies"), "Northern Line").click();
  await expect(page.getByRole("dialog", { name: "Northern Line" }).getByRole("group", { name: "Add to Library" })).toBeVisible();

  // Once accepted, the second friend's titles count too. The ones most friends
  // have come first (Paper Moons, in both libraries), then by title.
  expect((await people[1].page.request.post(`/api/shows/friends/${meId}/accept`, { data: {} })).status()).toBe(200);
  const titles = async (type: string) => (await friends(type)).map((title: { title: string }) => title.title);
  expect(await titles("movie")).toEqual(["Paper Moons", "Northern Line"]);
  expect(await titles("tv")).toEqual(["Harbor Lights", "The Quiet Orchard"]);
  for (const person of people) await person.context.close();
});
