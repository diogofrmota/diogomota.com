import { randomBytes } from "node:crypto";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, fakeTmdbImages, newUser, signUp } from "./fixtures";
import { withDatabase } from "./db";

// Helpers for the Shows app tests. The dev server runs with test hooks, so the
// app's server asks a fake TMDB (lib/tmdb-mock.ts) and never the real one;
// fixtures.ts fakes the poster images. The fake's ids start above this
// (lib/tmdb-mock.ts can't be imported here: it is server-only).
export const mockBase = 2_100_000_000;

/** Signs up a new account straight into /shows. */
export async function openShows(page: Page) {
  const user = newUser();
  await signUp(page, user, "/signup?next=/shows");
  await expect(page).toHaveURL("/shows");
  return user;
}

/** Someone else, in a browser context of their own (from their own address), signed up into /shows. */
export async function otherPerson(browser: Browser, options: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext({ ...options, extraHTTPHeaders: { "X-Forwarded-For": `10.${[...randomBytes(3)].join(".")}` } });
  await fakeTmdbImages(context);
  const page = await context.newPage();
  const user = await openShows(page);
  return { context, page, user, id: await userId(user.username) };
}

export async function userId(username: string): Promise<string> {
  const { rows } = await withDatabase((client) => client.query("SELECT id FROM users WHERE username = $1", [username]));
  return rows[0].id;
}

export const tab = (page: Page, view: string) =>
  page.getByRole("navigation", { name: "Shows", exact: true }).getByRole("button", { name: view, exact: true });
export const viewHeading = (page: Page) => page.getByRole("main").getByRole("heading", { level: 1 });
export const section = (scope: Page | Locator, heading: string) => scope.getByRole("region", { name: heading, exact: true });
export const grid = (scope: Page | Locator, name: string) => scope.getByRole("list", { name, exact: true });
/** A card by its title: cards are named "<title>, <year>, ...". */
export const card = (scope: Page | Locator, title: string) =>
  scope.getByRole("button", { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`) });
/**
 * The cards of a list of titles, by their buttons (the poster and title): each
 * card in Discover and search also has its + (or tick) button, left out here.
 */
export const cardButtons = (list: Locator) =>
  list.getByRole("listitem").getByRole("button", { name: /^(?!Add .* to your library$|Quick actions for )/ });
/** All of a card: its button (the poster and title), with its status badge and the facts under it. */
export const wholeCard = (cardButton: Locator) => cardButton.locator("..");
export const typeSwitch = (page: Page, name: "TV Shows" | "Movies") =>
  page.getByRole("group", { name: "Show" }).getByRole("button", { name, exact: true });

/** The requests the fake TMDB answered for this path, e.g. "/tv/top_rated". */
export async function tmdbRequests(page: Page, path: string): Promise<{ path: string; query: string | null; authorized: boolean }[]> {
  return (await (await page.request.get(`/api/test/tmdb?${new URLSearchParams({ path })}`)).json()).requests;
}

export type LibraryRow = {
  type: "tv" | "movie"; tmdb_id: number; status: string; rating: number | null;
  current_season: number | null; current_episode: number | null; is_favourite: boolean;
};

/** The user's user_shows rows, TV shows first, by TMDB id. */
export async function libraryRows(username: string): Promise<LibraryRow[]> {
  const { rows } = await withDatabase((client) => client.query(
    `SELECT s.type, s.tmdb_id, us.status, us.rating, us.current_season, us.current_episode, us.is_favourite
     FROM user_shows us JOIN users u ON u.id = us.user_id JOIN shows s ON s.id = us.show_id
     WHERE u.username = $1 ORDER BY s.type DESC, s.tmdb_id`, [username]));
  return rows;
}

/** A library row as added from Discover, with `fields` changed. */
export const row = (type: "tv" | "movie", tmdbId: number, fields: Partial<LibraryRow> = {}): LibraryRow => ({
  type, tmdb_id: tmdbId, status: "watching", rating: null, current_season: null, current_episode: null, is_favourite: false, ...fields,
});

export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}
