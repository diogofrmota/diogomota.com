import { randomBytes, randomInt } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, newUser, signUp, test } from "./fixtures";
import { withDatabase } from "./db";
import {
  card,
  expectNoHorizontalScroll,
  grid,
  libraryRows,
  mockBase,
  openShows,
  otherPerson,
  row,
  section,
  tab,
  tmdbRequests,
  typeSwitch,
  viewHeading,
  wholeCard,
} from "./shows";

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

test("a new account's Library is a guide: their TV shows, then their movies (each Planned, Watching or Completed), friends, and what they added", async ({
  page,
  browser,
}) => {
  const user = await openShows(page);
  const friend = await otherPerson(browser);
  const main = page.getByRole("main");
  await expect(viewHeading(page)).toHaveText("Library");
  const shows = main.getByRole("region", { name: "Which TV shows do you watch?" });
  await expect(shows).toContainText("Set up your library · Step 1 of 3");
  // What each status means, over the posters.
  await expect(shows.getByRole("list", { name: "Where a title can go" }).getByRole("listitem")).toHaveText([
    /^Planned/,
    /^Watching/,
    /^Completed/,
  ]);

  // What's trending and popular: a tap on a poster opens the chooser over it.
  const glass = card(grid(shows, "TV shows to choose from"), "Glass Meridian");
  await expect(glass).toHaveAttribute("aria-expanded", "false");
  await glass.click();
  await expect(glass).toHaveAttribute("aria-expanded", "true");
  const chooser = shows.getByRole("group", { name: "Add Glass Meridian as" });
  await expect(chooser.getByRole("button", { name: "Planned" })).toBeFocused();
  // Watching a TV show goes on to the last episode watched, over the poster: the first one to start with.
  await chooser.getByRole("button", { name: "Watching" }).click();
  const lastWatched = shows.getByRole("group", { name: "Last watched" });
  await expect(lastWatched.getByLabel("Season", { exact: true })).toBeFocused();
  await expect(lastWatched.getByLabel("Season", { exact: true })).toHaveValue("1");
  await expect(lastWatched.getByLabel("Episode", { exact: true })).toHaveValue("1");
  await expect.poll(() => libraryRows(user.username)).toEqual([row("tv", mockBase + 401)]);
  await lastWatched.getByLabel("Season", { exact: true }).selectOption("2");
  await expect(lastWatched.getByLabel("Episode", { exact: true }).locator("option")).toHaveCount(8);
  await lastWatched.getByLabel("Episode", { exact: true }).selectOption("3");
  await lastWatched.getByRole("button", { name: "Save" }).click();
  await expect(lastWatched).toBeHidden();
  await expect(glass).toBeFocused();
  await expect(glass).toHaveAccessibleName("Glass Meridian, 2026, rated 8.2 out of 10, in your library as Watching");
  // Its status on the poster, and under it.
  await expect(wholeCard(glass)).toContainText("Watching");
  await expect(main.getByText("1 TV show added")).toBeVisible();
  await expect
    .poll(() => libraryRows(user.username))
    .toEqual([row("tv", mockBase + 401, { current_season: 2, current_episode: 3 })]);
  // Another status moves it there; its own status again takes it out.
  await glass.click();
  const glassChooser = shows.getByRole("group", { name: "Glass Meridian", exact: true });
  await pressed(glassChooser.getByRole("button", { name: "Watching" }));
  await glassChooser.getByRole("button", { name: "Completed" }).click();
  await expect
    .poll(() => libraryRows(user.username))
    .toEqual([row("tv", mockBase + 401, { status: "completed", current_season: 2, current_episode: 3 })]);
  await glass.click();
  await glassChooser.getByRole("button", { name: "Completed" }).click();
  await expect.poll(() => libraryRows(user.username)).toEqual([]);
  await expect(glass).toHaveAccessibleName("Glass Meridian, 2026, rated 8.2 out of 10");
  // Escape, or a tap elsewhere, closes it with nothing changed.
  await glass.click();
  await page.keyboard.press("Escape");
  await expect(chooser).toBeHidden();
  await expect(glass).toBeFocused();
  await glass.click();
  await shows.getByRole("heading", { level: 2 }).click();
  await expect(chooser).toBeHidden();
  // Leaving the last episode watched (Escape) keeps it Not started.
  await glass.click();
  await chooser.getByRole("button", { name: "Watching" }).click();
  await expect(lastWatched).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(lastWatched).toBeHidden();
  await expect(glass).toBeFocused();

  // Or one found by a search, of the step's kind only.
  await shows.getByRole("searchbox", { name: "Search for a TV show" }).fill("Harbor");
  const results = grid(shows, "Results for “Harbor”");
  await expect(card(results, "Harbor Lights")).toBeVisible();
  await expect(results.getByRole("button", { name: /^Harbor Lights: Low Tide,/ })).toHaveCount(0);
  await card(results, "Harbor Lights").click();
  await shows.getByRole("group", { name: "Add Harbor Lights as" }).getByRole("button", { name: "Completed" }).click();
  await expect(main.getByText("2 TV shows added")).toBeVisible();
  await expect(wholeCard(card(results, "Harbor Lights"))).toContainText("Completed");

  // Then movies, the same way. Focus moves to the step.
  await main.getByRole("button", { name: "Next" }).click();
  const movies = main.getByRole("region", { name: "And which movies?" });
  await expect(movies.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(movies).toContainText("Step 2 of 3");
  const northern = card(grid(movies, "Movies to choose from"), "Northern Line");
  await northern.click();
  await movies.getByRole("group", { name: "Add Northern Line as" }).getByRole("button", { name: "Planned" }).click();
  await expect(northern).toHaveAccessibleName("Northern Line, 2025, rated 7.2 out of 10, in your library as Planned");
  await expect(main.getByText("1 movie added")).toBeVisible();
  await expect
    .poll(() => libraryRows(user.username))
    .toEqual([
      row("tv", harbor.tmdbId, { status: "completed" }),
      row("tv", mockBase + 401),
      row("movie", mockBase + 301, { status: "planned" }),
    ]);

  // Their friends, by username: the field says the account is there before sending.
  await main.getByRole("button", { name: "Next" }).click();
  const friends = main.getByRole("region", { name: "Watch together" });
  await expect(friends.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(friends).toContainText("Step 3 of 3");
  await friends.getByLabel("Add a friend").fill(friend.user.username);
  await expect(friends.getByText(`${friend.user.username} has an account`)).toBeVisible();
  await friends.getByRole("button", { name: "Send request" }).click();
  await expect(friends.getByRole("status")).toHaveText(`Friend request sent to ${friend.user.username}.`);
  await expect(friends.getByLabel("Add a friend")).toHaveValue("");

  // Back keeps what was picked.
  await main.getByRole("button", { name: "Back" }).click();
  await expect(movies.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(card(grid(movies, "Movies to choose from"), "Northern Line")).toHaveAccessibleName(
    /, in your library as Planned$/,
  );
  await main.getByRole("button", { name: "Next" }).click();

  // Finish: what they added, by status; then the Library is the library, and the request is in Profile.
  await main.getByRole("button", { name: "Finish" }).click();
  const allSet = main.getByRole("region", { name: "You’re all set!" });
  await expect(allSet.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(allSet.getByRole("list", { name: "In your library" }).getByRole("listitem")).toHaveText([
    "1 Planned",
    "1 Watching",
    "1 Completed",
  ]);
  await expect(main.getByRole("button", { name: "Skip" })).toHaveCount(0);
  await allSet.getByRole("button", { name: "Go to my library" }).click();
  await expect(card(grid(section(page, "Watching"), "Watching TV shows"), "Glass Meridian")).toBeVisible();
  await expect(card(grid(section(page, "Completed"), "Completed TV shows"), "Harbor Lights")).toBeVisible();
  await tab(page, "Profile").click();
  await expect(page.getByRole("list", { name: "Sent requests" })).toContainText(friend.user.username);
  await friend.context.close();
});

test("the guide gives way to the library when the Library is shown again with titles in it, and comes back from an empty Library", async ({
  page,
}) => {
  await openShows(page);
  const main = page.getByRole("main");
  const guide = main.getByRole("region", { name: "Which TV shows do you watch?" });
  // Away and back with nothing added: still the guide.
  await expect(guide).toBeVisible();
  await tab(page, "Discover").click();
  await expect(viewHeading(page)).toHaveText("Discover");
  await tab(page, "Library").click();
  await expect(guide).toBeVisible();

  await card(grid(guide, "TV shows to choose from"), "Glass Meridian").click();
  await guide.getByRole("group", { name: "Add Glass Meridian as" }).getByRole("button", { name: "Watching" }).click();
  await guide.getByRole("group", { name: "Last watched" }).getByRole("button", { name: "Save" }).click();
  await expect(main.getByText("1 TV show added")).toBeVisible();
  await tab(page, "Discover").click();
  await expect(viewHeading(page)).toHaveText("Discover");
  await tab(page, "Library").click();
  await expect(guide).toHaveCount(0);
  await expect(card(grid(section(page, "Watching"), "Watching TV shows"), "Glass Meridian")).toBeVisible();
});

test("a poster's + adds the title as Planned, Watching or Completed; once it's in the library, its tick opens the quick actions", async ({
  page,
}) => {
  const user = await openShows(page);
  await page.getByRole("main").getByRole("button", { name: "Skip" }).click();
  await tab(page, "Discover").click();
  const trending = grid(page, "Trending This Week TV shows");
  const glass = card(trending, "Glass Meridian");
  const add = trending.getByRole("button", { name: "Add Glass Meridian to your library" });
  // At the poster's bottom right, with the + in the middle of its circle.
  const poster = (await glass.locator("img").boundingBox())!;
  const button = (await add.boundingBox())!;
  expect(Math.abs(button.x + button.width - (poster.x + poster.width))).toBeLessThanOrEqual(1);
  expect(Math.abs(button.y + button.height - (poster.y + poster.height))).toBeLessThanOrEqual(1);
  const circle = (await add.locator("span").first().boundingBox())!;
  const plus = (await add.locator("svg").boundingBox())!;
  expect(Math.abs(circle.x + circle.width / 2 - (plus.x + plus.width / 2))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(circle.y + circle.height / 2 - (plus.y + plus.height / 2))).toBeLessThanOrEqual(0.5);

  await add.click();
  const chooser = trending.getByRole("group", { name: "Add Glass Meridian as" });
  await expect(chooser.getByRole("button")).toHaveText(["Planned", "Watching", "Completed", "Cancel"]);
  // Each option's icon and name are in the middle of its pill.
  for (const option of await chooser.getByRole("button", { name: /^(Planned|Watching|Completed)$/ }).all()) {
    const pill = (await option.boundingBox())!;
    const icon = (await option.locator("svg").boundingBox())!;
    const name = (await option.locator("span").boundingBox())!;
    expect(Math.abs((icon.x + name.x + name.width) / 2 - (pill.x + pill.width / 2))).toBeLessThanOrEqual(1);
  }
  await chooser.getByRole("button", { name: "Completed" }).click();
  await expect.poll(() => libraryRows(user.username)).toEqual([row("tv", mockBase + 401, { status: "completed" })]);
  const tick = trending.getByRole("button", { name: "Quick actions for Glass Meridian" });
  await expect(tick).toBeFocused();
  // Completed, on the poster and in the card's name.
  await expect(glass).toHaveAccessibleName("Glass Meridian, 2026, rated 8.2 out of 10, Completed");
  await expect(wholeCard(glass)).toContainText("Completed");
  await tick.click();
  const actions = page.getByRole("dialog", { name: "Glass Meridian" });
  await pressed(actions.getByRole("group", { name: "Status" }).getByRole("button", { name: "Completed" }));
  // Watching a TV show there: its season and episode too.
  await expect(actions.getByLabel("Season", { exact: true })).toHaveCount(0);
  await actions.getByRole("group", { name: "Status" }).getByRole("button", { name: "Watching" }).click();
  await actions.getByLabel("Season", { exact: true }).selectOption("1");
  await actions.getByLabel("Episode", { exact: true }).selectOption("4");
  await expect
    .poll(() => libraryRows(user.username))
    .toEqual([row("tv", mockBase + 401, { current_season: 1, current_episode: 4 })]);
  await page.keyboard.press("Escape");
  await expect(actions).toBeHidden();
  await expect(wholeCard(glass)).toContainText("Watching");

  // The poster itself still opens the title; so does a tap on it while the chooser is open, which only closes it.
  await trending.getByRole("button", { name: /^Add Trending Series 2 to your library$/ }).click();
  await expect(trending.getByRole("group", { name: "Add Trending Series 2 as" })).toBeVisible();
  await page.keyboard.press("Escape");
  await glass.click();
  await expect(page.getByRole("dialog", { name: "Glass Meridian" })).toBeVisible();
  await page.keyboard.press("Escape");

  // In search results too, where Escape closes the chooser and not the search.
  await page.getByRole("main").getByRole("button", { name: "Search TV shows and movies" }).click();
  const search = page.getByRole("dialog", { name: "Search" });
  await search.getByRole("searchbox").fill("Northern");
  await search.getByRole("button", { name: "Add Northern Line to your library" }).click();
  await page.keyboard.press("Escape");
  await expect(search.getByRole("group", { name: "Add Northern Line as" })).toBeHidden();
  await expect(search).toBeVisible();
  await search.getByRole("button", { name: "Add Northern Line to your library" }).click();
  await search.getByRole("group", { name: "Add Northern Line as" }).getByRole("button", { name: "Planned" }).click();
  await expect(search.getByRole("button", { name: "Quick actions for Northern Line" })).toBeVisible();
  await expect
    .poll(() => libraryRows(user.username))
    .toEqual([
      row("tv", mockBase + 401, { current_season: 1, current_episode: 4 }),
      row("movie", mockBase + 301, { status: "planned" }),
    ]);

  // A TV show added as Watching from its +: then the last episode watched, over the poster.
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
  await trending.getByRole("button", { name: /^Add Trending Series 2 to your library$/ }).click();
  await trending
    .getByRole("group", { name: "Add Trending Series 2 as" })
    .getByRole("button", { name: "Watching" })
    .click();
  const lastWatched = trending.getByRole("group", { name: "Last watched" });
  await lastWatched.getByLabel("Episode", { exact: true }).selectOption("6");
  await lastWatched.getByRole("button", { name: "Save" }).click();
  await expect(lastWatched).toBeHidden();
  await expect(trending.getByRole("button", { name: "Quick actions for Trending Series 2" })).toBeFocused();
  await expect(card(trending, "Trending Series 2")).toHaveAccessibleName(/, Watching$/);
  await expect
    .poll(() => libraryRows(user.username))
    .toContainEqual(expect.objectContaining({ type: "tv", status: "watching", current_season: 1, current_episode: 6 }));
});

test("the Library starts with a welcome, fills up from Discover, and the TV Shows | Movies switch filters every section", async ({
  page,
}) => {
  const user = await openShows(page);
  const main = page.getByRole("main");
  await expect(viewHeading(page)).toHaveText("Library");
  // Without the guide: the welcome, which can start the guide again.
  await main.getByRole("button", { name: "Skip" }).click();
  await expect(main.getByRole("heading", { name: "Start by discovering shows!" })).toBeVisible();
  await main.getByRole("button", { name: "Set up step by step" }).click();
  await expect(main.getByRole("region", { name: "Which TV shows do you watch?" })).toBeVisible();
  await main.getByRole("button", { name: "Skip" }).click();
  await expect(main.getByRole("heading", { name: "Start by discovering shows!" })).toBeVisible();
  await expect(typeSwitch(page, "TV Shows")).toHaveCount(0);
  await main.getByRole("button", { name: "Go to Discover" }).click();
  await expect(viewHeading(page)).toHaveText("Discover");
  // Discover's search field and its TV Shows | Movies switch are in the middle.
  const middle = async (locator: Locator) => {
    const box = (await locator.boundingBox())!;
    return box.x + box.width / 2;
  };
  const center = await middle(main);
  expect(
    Math.abs((await middle(main.getByRole("button", { name: "Search TV shows and movies" }))) - center),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs((await middle(page.getByRole("group", { name: "Show" }))) - center)).toBeLessThanOrEqual(1);

  // Added in Discover: on the Library at once.
  await card(grid(page, "Popular TV shows"), "Harbor Lights").click();
  const detail = page.getByRole("dialog", { name: "Harbor Lights" });
  await detail.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Watching" }).click();
  await expect(detail.getByRole("status")).toHaveText("In your library");
  await page.keyboard.press("Escape");
  await typeSwitch(page, "Movies").click();
  await card(grid(page, "Top Rated movies"), "Paper Moons").click();
  const movie = page.getByRole("dialog", { name: "Paper Moons" });
  await movie.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Planned" }).click();
  await expect(movie.getByRole("status")).toHaveText("In your library");
  await page.keyboard.press("Escape");
  expect(await libraryRows(user.username)).toEqual([
    row("tv", harbor.tmdbId),
    row("movie", paperMoons.tmdbId, { status: "planned" }),
  ]);

  await tab(page, "Library").click();
  await expect(main.getByRole("heading", { name: "Start by discovering shows!" })).toHaveCount(0);
  // Watching, Planned, then Completed.
  await expect(main.getByRole("heading", { level: 2 })).toHaveText(["Watching", "Planned", "Completed"]);
  // TV shows first; the switch on Discover is its own. On the left, lined up with the posters under it.
  await pressed(typeSwitch(page, "TV Shows"));
  const watching = section(page, "Watching");
  await expect(grid(watching, "Watching TV shows").getByRole("listitem")).toHaveCount(1);
  const switchBox = (await page.getByRole("group", { name: "Show" }).boundingBox())!;
  const gridBox = (await grid(watching, "Watching TV shows").boundingBox())!;
  expect(Math.abs(switchBox.x - gridBox.x)).toBeLessThanOrEqual(1);
  const harborCard = card(watching, "Harbor Lights");
  await expect(harborCard).toHaveAccessibleName("Harbor Lights, 2021, Watching, not started");
  // Not "Watching" on the poster: the section says it. Its next episode, a tap away.
  await expect(wholeCard(harborCard).getByText("Watching", { exact: true })).toHaveCount(0);
  await expect(wholeCard(harborCard)).toContainText("2021 · Next: S1 E1");
  await wholeCard(harborCard).getByRole("button", { name: "S1 E1 of Harbor Lights watched" }).click();
  await expect(wholeCard(harborCard)).toContainText("2021 · S1 E1");
  await expect(wholeCard(harborCard).getByRole("button", { name: "S1 E2 of Harbor Lights watched" })).toBeVisible();
  await expect
    .poll(async () => (await libraryRows(user.username)).find((entry) => entry.tmdb_id === harbor.tmdbId))
    .toMatchObject({ current_season: 1, current_episode: 1 });
  await expect(harborCard.locator("img")).toHaveAttribute("src", new RegExp(`/e2e-poster-${harbor.tmdbId}\\.jpg$`));
  await expect(section(page, "Planned")).toHaveText(/No shows planned yet — explore Discover!/);
  await expect(section(page, "Completed")).toHaveText(/No shows completed yet\./);
  await expect(main.getByRole("button", { name: /^Paper Moons,/ })).toHaveCount(0);

  await typeSwitch(page, "Movies").click();
  await pressed(typeSwitch(page, "Movies"));
  await expect(section(page, "Watching")).toHaveText(/not watching any movies yet — explore Discover!/);
  await expect(grid(section(page, "Planned"), "Planned movies").getByRole("listitem")).toHaveCount(1);
  await expect(card(section(page, "Planned"), "Paper Moons")).toHaveAccessibleName("Paper Moons, 1994, Planned");
  // Planned isn't on the poster: the section's heading says it.
  await expect(wholeCard(card(section(page, "Planned"), "Paper Moons"))).not.toContainText("Planned");
  await expect(section(page, "Completed")).toHaveText(/No movies completed yet\./);
  await expect(main.getByRole("button", { name: /^Harbor Lights,/ })).toHaveCount(0);

  // Each section lists the latest added or changed first, and says how many it has.
  await add(page, orchard, "planned");
  await add(page, series2, "planned");
  await page.reload();
  // The switch is remembered on this device: Movies, as it was left.
  await pressed(typeSwitch(page, "Movies"));
  await typeSwitch(page, "TV Shows").click();
  await expect(grid(section(page, "Planned"), "Planned TV shows").getByRole("listitem")).toHaveText([
    /Top Rated Series 2/,
    /The Quiet Orchard/,
  ]);
  await expect(section(page, "Planned").getByText("2", { exact: true })).toBeVisible();
  // No TMDB notice here (Discover's, hidden while Library shows, stays in the page).
  await expect(page.getByRole("main").locator("footer").filter({ visible: true })).toHaveCount(0);

  // An empty section's link goes to Discover.
  await typeSwitch(page, "Movies").click();
  await section(page, "Watching").getByRole("button", { name: "explore Discover!" }).click();
  await expect(viewHeading(page)).toHaveText("Discover");
});

test("the detail panel changes status, progress and favourite, and removes the title", async ({ page }) => {
  const user = await openShows(page);
  await add(page, harbor, "watching");
  await page.reload();
  await card(section(page, "Watching"), "Harbor Lights").click();
  const detail = page.getByRole("dialog", { name: "Harbor Lights" });
  await expect(detail).toContainText("TV show · 2021 · ★ 7.8");
  await expect(detail).toContainText("2 seasons · 18 episodes");
  await expect(detail).not.toContainText("min episodes");
  await expect(detail).not.toContainText("Rating and details from TMDB");
  await expect(detail).toContainText("Overview of Harbor Lights.");
  // On a wide screen: the title and its facts under the poster, and beside them, being watched, its
  // progress at the top (what the panel is opened for), then the overview.
  const posterBox = (await detail.locator("img").nth(1).boundingBox())!;
  const headingBox = (await detail.getByRole("heading", { level: 2 }).boundingBox())!;
  const overviewBox = (await detail.getByText("Overview of Harbor Lights.").boundingBox())!;
  const progressBox = (await detail.getByRole("group", { name: "Progress" }).boundingBox())!;
  expect(headingBox.y).toBeGreaterThanOrEqual(posterBox.y + posterBox.height);
  expect(Math.abs(headingBox.x - posterBox.x)).toBeLessThanOrEqual(1);
  expect(overviewBox.x).toBeGreaterThan(posterBox.x + posterBox.width);
  expect(progressBox.y).toBeLessThan(posterBox.y + posterBox.height / 2);
  expect(overviewBox.y).toBeGreaterThan(progressBox.y + progressBox.height);
  // The overview under Synopsis.
  const synopsisBox = (await detail.getByRole("heading", { level: 3, name: "Synopsis" }).boundingBox())!;
  expect(synopsisBox.y).toBeLessThan(overviewBox.y);
  expect(Math.abs(synopsisBox.x - overviewBox.x)).toBeLessThanOrEqual(1);
  // No rating of your own, and no "In your library" on screen (it's said to screen readers).
  await expect(detail.getByRole("group", { name: "Your rating" })).toHaveCount(0);
  await expect(detail.getByRole("status")).toHaveText("In your library");
  await expect(detail.getByRole("status")).toHaveCSS("clip-path", "inset(50%)");
  // The status, then Favourite, under the poster and the facts, one over the other.
  const status = detail.getByRole("group", { name: "Status" });
  await expect(status.getByRole("button")).toHaveText(["Planned", "Watching", "Completed"]);
  await pressed(status.getByRole("button", { name: "Watching" }));
  const statusBox = (await status.boundingBox())!;
  const [plannedBox, completedBox] = [
    (await status.getByRole("button", { name: "Planned" }).boundingBox())!,
    (await status.getByRole("button", { name: "Completed" }).boundingBox())!,
  ];
  const favouriteBox = (await detail.getByRole("button", { name: "Favourite" }).boundingBox())!;
  expect(statusBox.y).toBeGreaterThan(headingBox.y + headingBox.height);
  expect(Math.abs(statusBox.x - posterBox.x)).toBeLessThanOrEqual(1);
  expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(posterBox.x + posterBox.width + 1);
  expect(completedBox.y).toBeGreaterThan(plannedBox.y + plannedBox.height - 1);
  expect(favouriteBox.y).toBeGreaterThan(statusBox.y + statusBox.height - 1);
  expect(favouriteBox.x + favouriteBox.width).toBeLessThanOrEqual(posterBox.x + posterBox.width + 1);
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
  // Season 1 watched: a tick, on the faded green of a completed title; season 2 as far as it's got.
  const seasons = detail.getByRole("region", { name: "Seasons" }).getByRole("listitem");
  await expect(seasons).toHaveText([/^Season 1\s*10 episodes, watched$/, /^Season 2\s*7 of 8 episodes$/]);
  const [red, green, blue] = (await seasons.first().evaluate((el) => getComputedStyle(el).backgroundColor))
    .match(/[\d.]+/g)!
    .map(Number);
  expect(green).toBeGreaterThan(red);
  expect(green).toBeGreaterThan(blue);
  await expect(seasons.first().locator("svg")).toHaveCSS("color", "rgb(21, 128, 61)");

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

  const favourite = detail.getByRole("button", { name: "Favourite" });
  await expect(favourite).toHaveAttribute("aria-pressed", "false");
  await favourite.click();
  await pressed(favourite);
  await expectRow({ status: "completed", current_season: 2, current_episode: 8, is_favourite: true });

  // On the Library, Completed on its poster, and still there after a reload.
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(section(page, "Watching")).toHaveText(/not watching any shows yet/);
  const completed = card(section(page, "Completed"), "Harbor Lights");
  await expect(completed).toHaveAccessibleName("Harbor Lights, 2021, Completed, favourite");
  // No status on the poster in Library: its section says it.
  await expect(wholeCard(completed)).toHaveText(/^Harbor Lights2021$/);
  await page.reload();
  await expect(completed).toHaveAccessibleName("Harbor Lights, 2021, Completed, favourite");

  // Back to Watching: the progress is still there.
  await completed.click();
  await status.getByRole("button", { name: "Watching" }).click();
  await expect(progress).toContainText("S2 E8");
  await status.getByRole("button", { name: "Completed" }).click();

  // Remove: at once, with Undo (no "are you sure?"), which adds it back as it was.
  const remove = detail.getByRole("button", { name: "Remove from library" });
  await remove.click();
  const removed = detail.getByRole("status").filter({ hasText: "Removed from your library." });
  await expect(removed).toBeVisible();
  const addGroup = detail.getByRole("group", { name: "Add to Library" });
  await expect(addGroup.getByRole("button", { name: "Planned" })).toBeFocused();
  await expect.poll(() => libraryRows(user.username)).toEqual([]);
  await removed.getByRole("button", { name: "Undo" }).click();
  await expect(remove).toBeVisible();
  await expect.poll(async () => (await libraryRows(user.username)).length).toBe(1);
  await remove.click();
  await expect(removed).toBeVisible();
  await expect.poll(() => libraryRows(user.username)).toEqual([]);

  // The Library is empty again; adding it back starts afresh.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("main").getByRole("heading", { name: "Start by discovering shows!" })).toBeVisible();
});

test("the quick actions menu changes the status from a card, and undoes a refused change", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    'The ⋯ button and the menu beside the card are for a mouse; phones long-press ("on a phone" below).',
  );
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
  const gap =
    menuBox.y >= buttonBox.y + buttonBox.height
      ? menuBox.y - (buttonBox.y + buttonBox.height)
      : buttonBox.y - (menuBox.y + menuBox.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(20);
  await expect(menu).not.toContainText("Overview");

  await menu.getByRole("group", { name: "Status" }).getByRole("button", { name: "Completed" }).click();
  await pressed(menu.getByRole("group", { name: "Status" }).getByRole("button", { name: "Completed" }));
  await expect(menu.getByRole("group", { name: "Your rating" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(planned).toHaveText(/No shows planned yet/);
  await expect(card(section(page, "Completed"), "The Quiet Orchard")).toHaveAccessibleName(
    "The Quiet Orchard, 2016, Completed",
  );
  await expect
    .poll(() => libraryRows(user.username))
    .toEqual([row("tv", orchard.tmdbId, { status: "completed" }), row("tv", harbor.tmdbId)]);

  // A right click opens it too, and Back closes it.
  const harborCard = card(section(page, "Watching"), "Harbor Lights");
  await harborCard.click({ button: "right" });
  const harborMenu = page.getByRole("dialog", { name: "Harbor Lights" });
  await expect(harborMenu.getByRole("group", { name: "Status" })).toBeVisible();
  await page.goBack();
  await expect(harborMenu).toBeHidden();
  await expect(viewHeading(page)).toHaveText("Library");

  // When the server refuses a change, it is undone, with a message.
  await page.route(`**${entryUrl(harbor)}`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, json: { error: "Something went wrong. Please try again." } })
      : route.fallback(),
  );
  await harborCard.click({ button: "right" });
  await harborMenu.getByRole("group", { name: "Status" }).getByRole("button", { name: "Planned" }).click();
  await expect(harborMenu.getByRole("alert")).toHaveText(
    /Something went wrong\. Please try again\. Your change was undone\./,
  );
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

  test("a long press on a card opens the quick actions as a bottom sheet; a tap opens the details", async ({
    page,
  }) => {
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
    expect(box.width).toBeLessThan(390);
    expect(box.y).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThan(844);
    await expectNoHorizontalScroll(page);

    await menu.getByRole("group", { name: "Status" }).getByRole("button", { name: "Completed" }).tap();
    await page.goBack();
    await expect(menu).toBeHidden();
    const completed = card(section(page, "Completed"), "Harbor Lights");
    await expect(completed).toHaveAccessibleName("Harbor Lights, 2021, Completed");
    await expect.poll(() => libraryRows(user.username)).toEqual([row("tv", harbor.tmdbId, { status: "completed" })]);

    // A tap opens the details, a bottom sheet with the same controls.
    await completed.tap();
    const detail = page.getByRole("dialog", { name: "Harbor Lights" });
    await expect(detail).toContainText("Overview of Harbor Lights.");
    await pressed(detail.getByRole("group", { name: "Status" }).getByRole("button", { name: "Completed" }));
    await detail.getByRole("group", { name: "Status" }).getByRole("button", { name: "Watching" }).tap();
    await detail
      .getByRole("group", { name: "Progress" })
      .getByRole("button", { name: /^Next episode/ })
      .tap();
    await expect(detail.getByRole("group", { name: "Progress" })).toContainText("S1 E1");
    // At least 16px, so iOS doesn't zoom in on the pickers.
    await expect(detail.getByLabel("Season", { exact: true })).toHaveCSS("font-size", "16px");
    await expectNoHorizontalScroll(page);
    await page.goBack();
    await expect(card(section(page, "Watching"), "Harbor Lights")).toHaveAccessibleName(
      "Harbor Lights, 2021, Watching, season 1 episode 1",
    );
    await expect(wholeCard(card(section(page, "Watching"), "Harbor Lights"))).toContainText("2021 · S1 E1");
  });
});

test("the library API lists, changes and removes titles, and checks every change", async ({
  page,
  browser,
  baseURL,
  playwright,
}) => {
  const user = await openShows(page);
  await add(page, orchard, "planned");
  await add(page, harbor, "watching");
  await add(page, paperMoons, "planned");
  const library = async () => {
    const response = await page.request.get("/api/shows/library");
    expect(response.status()).toBe(200);
    return (await response.json()).data as { title: string }[];
  };
  const patch = (title: Title, data: object, headers: Record<string, string> = {}) =>
    page.request.patch(entryUrl(title), { data, headers });

  // The latest added or changed first.
  const titles = async () => (await library()).map((item) => item.title);
  expect(await titles()).toEqual(["Paper Moons", "Harbor Lights", "The Quiet Orchard"]);
  expect((await library())[1]).toEqual({
    type: "tv",
    tmdbId: harbor.tmdbId,
    title: "Harbor Lights",
    year: 2021,
    posterPath: `/e2e-poster-${harbor.tmdbId}.jpg`,
    rating: 7.8,
    runtime: null,
    episodeRuntime: 52,
    episodesPerSeason: [10, 8],
    library: {
      id: expect.any(String),
      status: "watching",
      currentSeason: null,
      currentEpisode: null,
      isFavourite: false,
    },
  });

  const changed = await patch(orchard, { status: "watching", currentSeason: 2, currentEpisode: 8, isFavourite: true });
  expect(changed.status()).toBe(200);
  expect((await changed.json()).data).toEqual({
    id: expect.any(String),
    status: "watching",
    currentSeason: 2,
    currentEpisode: 8,
    isFavourite: true,
  });
  expect(await titles()).toEqual(["The Quiet Orchard", "Paper Moons", "Harbor Lights"]);
  expect((await patch(orchard, { currentSeason: null, currentEpisode: null })).status()).toBe(200);
  expect((await patch(paperMoons, { status: "completed" })).status()).toBe(200);

  // Refused changes, which change nothing. A rating of your own is no more: nothing to change.
  const refused: [Title, object, number, string][] = [
    [harbor, { status: "dropped" }, 400, "Choose Watching, Planned or Completed."],
    [harbor, { isFavourite: "yes" }, 400, "Mark it as a favourite or not."],
    ...[
      { currentSeason: 3, currentEpisode: 1 },
      { currentSeason: 2, currentEpisode: 9 },
      { currentSeason: 0, currentEpisode: 1 },
      { currentSeason: 1 },
      { currentSeason: null, currentEpisode: 2 },
      { currentSeason: 1.5, currentEpisode: 1 },
    ].map((value): [Title, object, number, string] => [harbor, value, 400, "This show has no such episode."]),
    [harbor, {}, 400, "Nothing to change."],
    [harbor, { title: "Renamed" }, 400, "Nothing to change."],
    [harbor, { rating: 4 }, 400, "Nothing to change."],
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
  expect(
    (
      await page.request.patch(entryUrl(harbor), { data: "status=planned", headers: { "Content-Type": "text/plain" } })
    ).status(),
  ).toBe(415);
  expect((await page.request.delete(entryUrl(harbor), { headers: { Origin: "https://evil.example" } })).status()).toBe(
    403,
  );
  const expected = [
    row("tv", orchard.tmdbId, { is_favourite: true }),
    row("tv", harbor.tmdbId),
    row("movie", paperMoons.tmdbId, { status: "completed" }),
  ];
  expect(await libraryRows(user.username)).toEqual(expected);

  // Someone else can't change or remove titles in this library: only in their own.
  const context = await browser.newContext({
    extraHTTPHeaders: { "X-Forwarded-For": `10.${[...randomBytes(3)].join(".")}` },
  });
  const other = await context.newPage();
  await signUp(other, newUser());
  await expect(other).toHaveURL("/");
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

test("loading the library fetches titles older than 7 days from TMDB again, after answering with the old copy", async ({
  page,
}) => {
  await openShows(page);
  // A title no other test opens.
  const title: Title = { type: "tv", tmdbId: mockBase + 1_000_000 + randomInt(1_000_000) };
  const name = `Mock Series ${title.tmdbId - mockBase}`;
  await add(page, title, "planned");
  const cachedTitle = async () =>
    (
      await withDatabase((client) =>
        client.query("SELECT title FROM shows WHERE type = 'tv' AND tmdb_id = $1", [title.tmdbId]),
      )
    ).rows[0].title;
  const libraryTitles = async () =>
    ((await (await page.request.get("/api/shows/library")).json()).data as { title: string }[]).map(
      (item) => item.title,
    );
  const age = (days: number) =>
    withDatabase((client) =>
      client.query(
        "UPDATE shows SET title = 'Old title', last_updated = now() - make_interval(days => $2) WHERE type = 'tv' AND tmdb_id = $1",
        [title.tmdbId, days],
      ),
    );
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
