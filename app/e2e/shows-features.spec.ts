import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { card, mockBase, openShows, otherPerson, section, tab, typeSwitch, userId } from "./shows";

// Shows' newer features: genres and More like this on a title, the friends who
// have it, recommending it to a friend, what you both planned, your friends'
// activity, the TMDB notice, and Discover remembering TV Shows or Movies.

type Title = { type: "tv" | "movie"; tmdbId: number };
const harbor: Title = { type: "tv", tmdbId: mockBase + 101 }; // Harbor Lights, 2021
const orchard: Title = { type: "tv", tmdbId: mockBase + 1 }; // The Quiet Orchard, 2016

async function add(page: Page, title: Title, status: "watching" | "planned" | "completed") {
  expect((await page.request.post("/api/shows/library", { data: { ...title, status } })).status()).toBe(201);
}

/** Sends a friend request through the API (the other one then accepts it). */
async function befriend(page: Page, other: { user: { username: string } }) {
  expect((await page.request.post("/api/shows/friends", { data: { username: other.user.username } })).status()).toBe(
    201,
  );
}

test("a library title's mobile popup fits its controls with wider font metrics", async ({ page }) => {
  await openShows(page);
  await add(page, harbor, "watching");
  await page.goto(`/shows?p=title:tv:${harbor.tmdbId}`);
  const panel = page.getByRole("dialog", { name: "Harbor Lights" });
  await expect(panel.getByRole("group", { name: "Progress", exact: true })).toBeVisible();
  // The Linux CI font is wider than Windows' system font. Exercise a wider
  // fallback too, so the test does not depend on the host's font metrics.
  await page.addStyleTag({ content: "[data-theme] { font-family: Verdana, sans-serif; }" });
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await panel.evaluate((dialog) => {
        const body = dialog.firstElementChild!;
        return body.scrollWidth - body.clientWidth;
      }),
      `popup overflow at ${width}px`,
    ).toBeLessThanOrEqual(1);
    for (const button of await panel.getByRole("group", { name: "Status", exact: true }).getByRole("button").all()) {
      expect(await button.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    }
    await panel.getByLabel("Season", { exact: true }).selectOption("2");
    await panel.getByLabel("Episode", { exact: true }).selectOption("8");
    await expect(panel.getByLabel("Episode", { exact: true })).toHaveValue("8");
  }
});

test("title sections put recommendations before similar titles and removal, with a visible scrollbar", async ({
  page,
}) => {
  await openShows(page);
  await add(page, harbor, "watching");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/shows?p=title:tv:${harbor.tmdbId}`);
    const panel = page.getByRole("dialog", { name: "Harbor Lights" });
    const similar = panel.getByRole("list", { name: "More like this", exact: true });
    await expect(similar.getByRole("listitem").first()).toBeVisible();
    expect(
      await panel.evaluate((element) =>
        [...element.querySelectorAll("h3, button")]
          .map((node) => node.textContent?.trim())
          .filter((text) =>
            ["Seasons", "Recommend to a friend", "More like this", "Remove from library"].includes(text ?? ""),
          ),
      ),
    ).toEqual(["Seasons", "Recommend to a friend", "More like this", "Remove from library"]);
    await expect(similar).toHaveCSS("scrollbar-width", "thin");
    await expect(panel.getByRole("button", { name: /^Scroll (left|right)$/ })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Remove from library" }).locator("..")).toHaveCSS(
      "border-top-width",
      "0px",
    );
    await page.keyboard.press("Escape");
  }
});

test("a title's panel: its genres, the friends who have it, More like this, Recommend to a friend and TMDB's notice", async ({
  page,
  browser,
}) => {
  const me = await openShows(page);
  const ana = await otherPerson(browser);
  try {
    await befriend(page, ana);
    const meId = await userId(me.username);
    expect((await ana.page.request.post(`/api/shows/friends/${meId}/accept`, { data: {} })).ok()).toBe(true);
    await add(ana.page, harbor, "watching");

    await page.goto(`/shows/discover?p=title:tv:${harbor.tmdbId}`);
    const panel = page.getByRole("dialog", { name: "Harbor Lights" });
    await expect(panel).toBeVisible();
    // Genres, under the facts.
    await expect(panel).toContainText("Drama · Mystery");
    // The friends who have it, and how far they are.
    const friends = panel.getByRole("region", { name: "Friends" });
    await expect(friends).toContainText(ana.user.name);
    await expect(friends).toContainText("Watching");
    // More like this: posters that open their own panel.
    const more = panel.getByRole("region", { name: "More like this" });
    await expect(more.getByRole("listitem").first()).toBeVisible();
    // TMDB's logo and notice.
    await expect(panel.getByRole("link", { name: "TMDB" })).toHaveAttribute("href", "https://www.themoviedb.org/");
    await expect(panel).toContainText("This product uses the TMDB API but is not endorsed or certified by TMDB.");

    // Recommend it to Ana: it shows in her Discover, from me, until she adds it.
    await panel.getByRole("button", { name: "Recommend to a friend" }).click();
    const row = panel.getByRole("listitem").filter({ hasText: ana.user.name });
    await row.getByRole("button", { name: "Send" }).click();
    await expect(
      panel.getByRole("status").filter({ hasText: `Sent Harbor Lights to ${ana.user.name}.` }),
    ).toBeVisible();
    await expect(row.getByRole("button", { name: "Sent" })).toBeDisabled();

    await add(page, orchard, "watching");
    await ana.page.request.delete(`/api/shows/library/tv/${harbor.tmdbId}`);
    await ana.page.goto("/shows/discover");
    const recommended = section(ana.page, "Recommended by Friends");
    await expect(card(recommended, "Harbor Lights")).toBeVisible();
    await expect(recommended).toContainText(`From ${me.name}`);

    // Her Profile has what her friends did: I started watching The Quiet Orchard, and recommended Harbor Lights.
    await ana.page.goto("/shows/profile");
    const activity = section(ana.page, "Friends’ activity");
    await expect(activity).toContainText(`${me.name} started watching The Quiet Orchard`);
    await expect(activity).toContainText(`${me.name} recommended Harbor Lights to ${ana.user.name}`);
    await activity.getByRole("button", { name: "The Quiet Orchard" }).click();
    await expect(ana.page.getByRole("dialog", { name: "The Quiet Orchard" })).toBeVisible();
  } finally {
    await ana.context.close();
  }
});

test("a friend's profile has what you both want to watch", async ({ page, browser }) => {
  const me = await openShows(page);
  const ana = await otherPerson(browser);
  try {
    await befriend(page, ana);
    expect(
      (await ana.page.request.post(`/api/shows/friends/${await userId(me.username)}/accept`, { data: {} })).ok(),
    ).toBe(true);
    await add(page, harbor, "planned");
    await add(ana.page, harbor, "planned");
    await add(page, orchard, "planned");
    await page.goto(`/shows/profile?p=friend:${ana.id}`);
    const together = page.getByRole("dialog").getByRole("region", { name: "You both want to watch" });
    await expect(card(together, "Harbor Lights")).toBeVisible();
    await expect(card(together, "The Quiet Orchard")).toHaveCount(0);
  } finally {
    await ana.context.close();
  }
});

test("Discover remembers TV Shows or Movies on this device, and loads its sections as they come near", async ({
  page,
}) => {
  await openShows(page);
  // With a title, so the Library has its switch too (and not the guide).
  await add(page, harbor, "watching");
  await tab(page, "Discover").click();
  await typeSwitch(page, "Movies").click();
  await page.reload();
  await expect(typeSwitch(page, "Movies")).toHaveAttribute("aria-pressed", "true");
  // Library has its own.
  await tab(page, "Library").click();
  await expect(typeSwitch(page, "TV Shows")).toHaveAttribute("aria-pressed", "true");
  // The last section only loads once scrolled to.
  await tab(page, "Discover").click();
  const last = section(page, "Added by Friends");
  await last.scrollIntoViewIfNeeded();
  await expect(last).toContainText("No movies from friends yet.");
  await expect(page.getByRole("link", { name: "TMDB" })).toBeVisible();
});
