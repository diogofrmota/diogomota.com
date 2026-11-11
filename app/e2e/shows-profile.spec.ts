import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, newUser, test } from "./fixtures";
import { card, cardButtons, expectNoHorizontalScroll, grid, libraryRows, mockBase, openShows, otherPerson, row, section, tab, userId, viewHeading } from "./shows";

// Titles of the fake TMDB (lib/tmdb-mock.ts). Its TV shows have two seasons, of
// 10 and 8 episodes, 45 minutes each (Harbor Lights: 52, its latest episode's).
// Movies run 90 minutes plus their id modulo 60 (Paper Moons: 128).
type Title = { type: "tv" | "movie"; tmdbId: number };
const harbor: Title = { type: "tv", tmdbId: mockBase + 101 }; // Harbor Lights, 2021
const orchard: Title = { type: "tv", tmdbId: mockBase + 1 }; // The Quiet Orchard, 2016
const series2: Title = { type: "tv", tmdbId: mockBase + 2 }; // Top Rated Series 2, 2001
const paperMoons: Title = { type: "movie", tmdbId: mockBase + 201 }; // Paper Moons, 1994, 128 minutes
const northernLine: Title = { type: "movie", tmdbId: mockBase + 301 }; // Northern Line, 2025, 91 minutes
const lowTide: Title = { type: "movie", tmdbId: mockBase + 302 }; // Harbor Lights: Low Tide, 2024, 92 minutes

/** Adds a title to the library of whoever is logged in on `page`, then makes each change to its entry in turn. */
async function addTitle(page: Page, title: Title, status: "watching" | "planned", ...changes: object[]) {
  expect((await page.request.post("/api/shows/library", { data: { ...title, status } })).status()).toBe(201);
  for (const data of changes) {
    expect((await page.request.patch(`/api/shows/library/${title.type}/${title.tmdbId}`, { data })).status()).toBe(200);
  }
}

async function addFriend(page: Page, username: string) {
  await page.getByLabel("Add a friend").fill(username);
  await page.getByRole("button", { name: "Send request" }).click();
}

const friendsList = (page: Page) => page.getByRole("list", { name: "Your friends" });
const friendButton = (page: Page, username: string) => friendsList(page).getByRole("button", { name: username, exact: true });
const statValues = (scope: Page | Locator) => section(scope, "Stats").getByRole("definition");
const friendsState = async (page: Page) => (await (await page.request.get("/api/shows/friends")).json()).data;

test("Profile shows the user's favourites and stats, and the stats add up", async ({ page }) => {
  await openShows(page);
  await tab(page, "Profile").click();
  await expect(viewHeading(page)).toHaveText("Profile");
  // Hours watched (with its episodes and movies), TV shows completed, movies completed.
  await expect(statValues(page)).toHaveText(["0", "0 episodes · 0 movies", "0", "0"]);
  await expect(section(page, "Favourites")).toContainText("No favourites yet.");
  await expect(section(page, "Friends")).toContainText("No friends yet.");
  await expect(section(page, "Friend requests")).toHaveCount(0);

  // A show being watched counts up to its current episode, a completed one in
  // full, a planned one not at all (even with progress); movies once completed.
  await addTitle(page, harbor, "watching", { currentSeason: 2, currentEpisode: 3, isFavourite: true }); // 13 × 52 minutes
  await addTitle(page, orchard, "planned", { status: "completed", rating: 4 }); // 18 × 45 minutes
  await addTitle(page, series2, "watching", { currentSeason: 1, currentEpisode: 5 }, { status: "planned" }); // nothing
  await addTitle(page, paperMoons, "planned", { status: "completed", isFavourite: true }); // 128 minutes
  await addTitle(page, northernLine, "watching"); // nothing yet
  await addTitle(page, lowTide, "planned", { status: "completed" }); // 92 minutes
  // 676 + 810 + 128 + 92 = 1,706 minutes: 28.4 hours.
  await page.reload();
  await tab(page, "Profile").click();
  await expect(statValues(page)).toHaveText(["28.4", "31 episodes · 2 movies", "1", "2"]);

  // Favourites: TV shows and movies together, the latest changed first.
  const favourites = grid(section(page, "Favourites"), "Your favourites");
  await expect(favourites.getByRole("listitem")).toHaveCount(2);
  await expect(favourites.getByRole("listitem")).toHaveText([/Paper Moons/, /Harbor Lights/]);
  await expect(card(favourites, "Harbor Lights")).toHaveAccessibleName("Harbor Lights, 2021, Watching, season 2 episode 3, favourite");

  // The stats follow every change at once: one more episode is 52 more minutes.
  await card(favourites, "Harbor Lights").click();
  const detail = page.getByRole("dialog", { name: "Harbor Lights" });
  await detail.getByRole("button", { name: /^Next episode/ }).click();
  await expect(detail.getByText("S2 E4", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(statValues(page)).toHaveText(["29.3", "32 episodes · 2 movies", "1", "2"]);

  // Completed from its card's quick actions: all 18 episodes (1,966 minutes).
  // With the keyboard: the ⋯ button only shows where there is a mouse (phones long-press, see shows-home.spec.ts).
  await favourites.getByRole("button", { name: "Quick actions for Harbor Lights" }).press("Enter");
  const menu = page.getByRole("dialog", { name: "Harbor Lights" });
  await menu.getByRole("group", { name: "Status" }).getByRole("button", { name: "Completed" }).click();
  await page.keyboard.press("Escape");
  await expect(statValues(page)).toHaveText(["32.8", "36 episodes · 2 movies", "2", "2"]);
  await expect(card(favourites, "Harbor Lights")).toHaveAccessibleName("Harbor Lights, 2021, Completed, favourite");

  // No longer a favourite: gone from Favourites.
  await card(favourites, "Paper Moons").click();
  await page.getByRole("dialog", { name: "Paper Moons" }).getByRole("button", { name: "Favourite" }).click();
  await page.keyboard.press("Escape");
  await expect(favourites.getByRole("listitem")).toHaveText([/Harbor Lights/]);
});

test("two people become friends: a request, accepting it, each other's libraries, and removing", async ({ page, browser }) => {
  const me = await openShows(page);
  const bob = await otherPerson(browser);
  const bobName = bob.user.username;
  // What a friend sees: watching, completed and favourites, not a planned title.
  await addTitle(bob.page, harbor, "watching", { currentSeason: 2, currentEpisode: 5, isFavourite: true });
  await addTitle(bob.page, orchard, "planned", { status: "completed", rating: 4 });
  await addTitle(bob.page, paperMoons, "planned");
  await addTitle(bob.page, series2, "planned", { isFavourite: true });

  await tab(page, "Profile").click();
  const friends = section(page, "Friends");
  await expect(friends).toContainText("No friends yet.");
  await expect(friends).toContainText(`Friends add you by your username, ${me.username}.`);
  // In any case, with or without an @.
  await addFriend(page, `@${bobName.toUpperCase()}`);
  await expect(friends.getByRole("status")).toHaveText(`Friend request sent to ${bobName}.`);
  await expect(page.getByLabel("Add a friend")).toHaveValue("");
  const sent = page.getByRole("list", { name: "Sent requests" });
  await expect(sent.getByRole("listitem")).toHaveCount(1);
  await expect(sent.getByRole("listitem")).toContainText(bobName);
  await expect(friends).toContainText("No friends yet.");

  // Asking again: refused, saying why.
  await addFriend(page, bobName);
  await expect(friends.getByRole("alert")).toHaveText(`You've already sent ${bobName} a friend request.`);
  await expect(page.getByLabel("Add a friend")).toHaveValue(bobName);

  // A pending request isn't enough to see a library.
  expect((await page.request.get(`/api/shows/friends/${bob.id}`)).status()).toBe(404);
  await tab(page, "Discover").click();
  await expect(section(page, "Added by Friends")).toContainText("No TV shows from friends yet.");

  // Bob accepts on his Profile.
  await tab(bob.page, "Profile").click();
  const requests = section(bob.page, "Friend requests");
  await expect(requests.getByRole("listitem")).toHaveCount(1);
  await expect(requests.getByRole("listitem")).toContainText(me.username);
  await requests.getByRole("button", { name: `Accept ${me.username}` }).click();
  await expect(requests.getByRole("status")).toHaveText(`You and ${me.username} are now friends.`);
  // The button went away with its row: focus is on what happened.
  await expect(requests.getByRole("status")).toBeFocused();
  await expect(requests.getByRole("list")).toHaveCount(0);
  await expect(friendButton(bob.page, me.username)).toBeVisible();

  // On my side once Profile loads again; Added by Friends then lists Bob's titles.
  await tab(page, "Profile").click();
  await expect(friendButton(page, bobName)).toBeVisible();
  await expect(sent).toHaveCount(0);
  await tab(page, "Discover").click();
  await expect(cardButtons(grid(section(page, "Added by Friends"), "Added by Friends TV shows")))
    .toHaveText([/Harbor Lights/, /The Quiet Orchard/, /Top Rated Series 2/]);

  // Bob's profile: his stats, what he's watching, has completed and his
  // favourites, read-only. 15 × 52 + 18 × 45 = 1,590 minutes.
  await tab(page, "Profile").click();
  await friendButton(page, bobName).click();
  const profile = page.getByRole("dialog", { name: bobName });
  await expect(statValues(profile)).toHaveText(["26.5", "33 episodes · 0 movies", "1", "0"]);
  const cards = (heading: string) => grid(section(profile, heading), heading).getByRole("button");
  await expect(cards("Watching")).toHaveCount(1);
  await expect(cards("Watching")).toHaveAccessibleName("Harbor Lights, 2021, Watching, season 2 episode 5, favourite");
  await expect(cards("Completed")).toHaveCount(1);
  await expect(cards("Completed")).toHaveAccessibleName("The Quiet Orchard, 2016, Completed, rated 4 out of 5");
  await expect(cards("Favourites")).toHaveCount(2);
  await expect(cards("Favourites").first()).toHaveAccessibleName("Top Rated Series 2, 2001, Planned, favourite");
  await expect(cards("Favourites").last()).toHaveAccessibleName("Harbor Lights, 2021, Watching, season 2 episode 5, favourite");
  await expect(profile.getByRole("button", { name: /^Paper Moons,/ })).toHaveCount(0);
  await expect(profile.getByRole("button", { name: /^Quick actions/ })).toHaveCount(0);

  // A card opens the title over it, about my own library.
  await cards("Watching").click();
  const detail = page.getByRole("dialog", { name: "Harbor Lights" });
  await detail.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Planned" }).click();
  await expect(detail.getByRole("status")).toHaveText("In your library");
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(profile).toBeVisible();
  await expect(cards("Watching")).toHaveAccessibleName("Harbor Lights, 2021, Watching, season 2 episode 5, favourite");
  await page.goBack();
  await expect(profile).toBeHidden();
  await expect(viewHeading(page)).toHaveText("Profile");
  expect(await libraryRows(me.username)).toEqual([row("tv", harbor.tmdbId, { status: "planned" })]);
  expect(await libraryRows(bobName)).toEqual([
    row("tv", orchard.tmdbId, { status: "completed", rating: 4 }),
    row("tv", series2.tmdbId, { status: "planned", is_favourite: true }),
    row("tv", harbor.tmdbId, { current_season: 2, current_episode: 5, is_favourite: true }),
    row("movie", paperMoons.tmdbId, { status: "planned" }),
  ]);

  // Through the API: the same, and nothing more (no planned titles, no entry ids).
  const response = await page.request.get(`/api/shows/friends/${bob.id}`);
  expect(response.status()).toBe(200);
  const entry = (status: string, fields: object = {}) => ({ status, rating: null, currentSeason: null, currentEpisode: null, isFavourite: false, ...fields });
  expect((await response.json()).data).toEqual({
    id: bob.id, username: bobName, avatarUrl: null,
    stats: { tvCompleted: 1, moviesCompleted: 0, episodesWatched: 33, minutesWatched: 1590 },
    items: [
      { type: "tv", tmdbId: series2.tmdbId, title: "Top Rated Series 2", year: 2001, posterPath: `/e2e-poster-${series2.tmdbId}.jpg`,
        rating: 8.4, library: entry("planned", { isFavourite: true }) },
      { type: "tv", tmdbId: orchard.tmdbId, title: "The Quiet Orchard", year: 2016, posterPath: `/e2e-poster-${orchard.tmdbId}.jpg`,
        rating: 9.1, library: entry("completed", { rating: 4 }) },
      { type: "tv", tmdbId: harbor.tmdbId, title: "Harbor Lights", year: 2021, posterPath: `/e2e-poster-${harbor.tmdbId}.jpg`,
        rating: 7.8, library: entry("watching", { currentSeason: 2, currentEpisode: 5, isFavourite: true }) },
    ],
  });

  // Removing asks first, and ends it for both of us.
  await friendsList(page).getByRole("button", { name: `Remove ${bobName}` }).click();
  await page.getByRole("group", { name: new RegExp(`^Remove ${bobName} from your friends\\?`) })
    .getByRole("button", { name: "Remove", exact: true }).click();
  await expect(friends.getByRole("status")).toHaveText(`Removed ${bobName} from your friends.`);
  await expect(friends.getByRole("status")).toBeFocused();
  await expect(friends).toContainText("No friends yet.");
  expect((await page.request.get(`/api/shows/friends/${bob.id}`)).status()).toBe(404);
  expect((await bob.page.request.get(`/api/shows/friends/${await userId(me.username)}`)).status()).toBe(404);
  expect(await friendsState(bob.page)).toEqual({ friends: [], incoming: [], outgoing: [] });
  await tab(page, "Discover").click();
  await expect(section(page, "Added by Friends")).toContainText("No TV shows from friends yet.");
  await bob.context.close();
});

test("declining and cancelling requests, a request that's gone, and asking each other", async ({ page, browser }) => {
  const me = await openShows(page);
  const ann = await otherPerson(browser);
  const annName = ann.user.username;
  await tab(page, "Profile").click();
  await tab(ann.page, "Profile").click();
  const friends = section(page, "Friends");
  const requests = section(ann.page, "Friend requests");
  const sent = page.getByRole("list", { name: "Sent requests" });

  // Ann declines.
  await addFriend(page, annName);
  await expect(friends.getByRole("status")).toHaveText(`Friend request sent to ${annName}.`);
  await tab(ann.page, "Home").click();
  await tab(ann.page, "Profile").click();
  await requests.getByRole("button", { name: `Decline ${me.username}` }).click();
  await expect(requests.getByRole("status")).toHaveText(`Declined ${me.username}'s friend request.`);
  await expect(requests.getByRole("list")).toHaveCount(0);
  await expect(section(ann.page, "Friends")).toContainText("No friends yet.");
  expect(await friendsState(page)).toEqual({ friends: [], incoming: [], outgoing: [] });

  // So I can ask again, and withdraw it.
  await tab(page, "Home").click();
  await tab(page, "Profile").click();
  await expect(sent).toHaveCount(0);
  await addFriend(page, annName);
  await expect(friends.getByRole("status")).toHaveText(`Friend request sent to ${annName}.`);
  await sent.getByRole("button", { name: `Cancel request to ${annName}` }).click();
  await expect(friends.getByRole("status")).toHaveText(`Cancelled your friend request to ${annName}.`);
  await expect(sent).toHaveCount(0);
  expect(await friendsState(ann.page)).toEqual({ friends: [], incoming: [], outgoing: [] });

  // A request withdrawn while Ann had it on screen: accepting it says so.
  await addFriend(page, annName);
  await expect(friends.getByRole("status")).toHaveText(`Friend request sent to ${annName}.`);
  await tab(ann.page, "Home").click();
  await tab(ann.page, "Profile").click();
  await expect(requests.getByRole("button", { name: `Accept ${me.username}` })).toBeVisible();
  await sent.getByRole("button", { name: `Cancel request to ${annName}` }).click();
  await expect(friends.getByRole("status")).toHaveText(`Cancelled your friend request to ${annName}.`);
  await requests.getByRole("button", { name: `Accept ${me.username}` }).click();
  await expect(requests.getByRole("alert")).toHaveText("This friend request isn't there anymore.");
  await expect(requests.getByRole("list")).toHaveCount(0);
  await expect(section(ann.page, "Friends")).toContainText("No friends yet.");

  // Ann asks me; I ask her before I've seen it: that makes us friends.
  await addFriend(ann.page, me.username);
  await expect(section(ann.page, "Friends").getByRole("status")).toHaveText(`Friend request sent to ${me.username}.`);
  await addFriend(page, annName);
  await expect(friends.getByRole("status")).toHaveText(`${annName} had already sent you a request: you're now friends.`);
  await expect(friendButton(page, annName)).toBeVisible();
  await expect(section(page, "Friend requests")).toHaveCount(0);
  await expect(sent).toHaveCount(0);
  expect((await friendsState(ann.page)).friends).toEqual([{ id: await userId(me.username), username: me.username, avatarUrl: null }]);
  await addFriend(page, annName);
  await expect(friends.getByRole("alert")).toHaveText(`You're already friends with ${annName}.`);
  await ann.context.close();
});

test("only accepted friends can read a library through the API, and every friends request is checked", async ({ page, browser, baseURL, playwright }) => {
  const me = await openShows(page);
  const meId = await userId(me.username);
  const friend = await otherPerson(browser);
  const stranger = await otherPerson(browser);
  await addTitle(friend.page, orchard, "watching", { currentSeason: 1, currentEpisode: 2 }); // 2 × 45 minutes
  const profileOf = (from: Page, id: string) => from.request.get(`/api/shows/friends/${id}`);
  const post = (from: Page, path: string, data: object = {}, headers: Record<string, string> = {}) =>
    from.request.post(`/api/shows/friends${path}`, { data, headers });
  const remove = (from: Page, id: string) => from.request.delete(`/api/shows/friends/${id}`);
  const person = (who: { id: string; user: { username: string } }) => ({ id: who.id, username: who.user.username, avatarUrl: null });
  const noOne = { friends: [], incoming: [], outgoing: [] };

  // Nobody's library before a request is accepted, and never a stranger's, my
  // own, or that of an id nobody has.
  for (const id of [friend.id, stranger.id, meId, randomUUID(), "not-an-id"]) {
    const response = await profileOf(page, id);
    expect(response.status(), id).toBe(404);
    expect((await response.json()).error).toBe("Only friends can see each other's libraries.");
  }

  // A request: still not.
  const request = await post(page, "", { username: friend.user.username });
  expect(request.status()).toBe(201);
  expect((await request.json()).data).toEqual({ ...noOne, outgoing: [person(friend)] });
  expect((await profileOf(page, friend.id)).status()).toBe(404);
  expect((await profileOf(friend.page, meId)).status()).toBe(404);
  // Only the person asked accepts or declines; only the one who asked cancels.
  for (const [from, path] of [[page, `/${friend.id}/accept`], [page, `/${friend.id}/decline`], [friend.page, `/${meId}/cancel`],
    [stranger.page, `/${meId}/accept`], [stranger.page, `/${friend.id}/accept`], [stranger.page, `/${meId}/cancel`]] as const) {
    const response = await post(from, path);
    expect(response.status(), path).toBe(404);
    expect((await response.json()).error).toBe("This friend request isn't there anymore.");
  }
  expect((await remove(friend.page, meId)).status()).toBe(404);
  expect(await friendsState(friend.page)).toEqual({ ...noOne, incoming: [{ id: meId, username: me.username, avatarUrl: null }] });

  // Accepted: we see each other's libraries; the stranger still sees neither.
  const accepted = await post(friend.page, `/${meId}/accept`);
  expect(accepted.status()).toBe(200);
  expect((await accepted.json()).data).toEqual({ ...noOne, friends: [{ id: meId, username: me.username, avatarUrl: null }] });
  const friendProfile = await profileOf(page, friend.id);
  expect(friendProfile.status()).toBe(200);
  expect((await friendProfile.json()).data).toMatchObject({
    ...person(friend), stats: { tvCompleted: 0, moviesCompleted: 0, episodesWatched: 2, minutesWatched: 90 },
    items: [{ title: "The Quiet Orchard", library: { status: "watching", currentSeason: 1, currentEpisode: 2 } }],
  });
  expect((await (await profileOf(friend.page, meId)).json()).data).toEqual({
    id: meId, username: me.username, avatarUrl: null, stats: { tvCompleted: 0, moviesCompleted: 0, episodesWatched: 0, minutesWatched: 0 }, items: [],
  });
  expect((await profileOf(stranger.page, friend.id)).status()).toBe(404);
  expect((await profileOf(stranger.page, meId)).status()).toBe(404);
  expect((await (await stranger.page.request.get("/api/shows/discover/tv/friends")).json()).data).toEqual([]);
  expect((await (await page.request.get("/api/shows/discover/tv/friends")).json()).data.map((title: { title: string }) => title.title))
    .toEqual(["The Quiet Orchard"]);
  // And the stranger can't end it.
  for (const id of [friend.id, meId]) expect((await remove(stranger.page, id)).status()).toBe(404);
  expect((await post(stranger.page, `/${friend.id}/decline`)).status()).toBe(404);
  expect((await profileOf(page, friend.id)).status()).toBe(200);

  // Removed: not anymore, for either of us.
  const removed = await remove(page, friend.id);
  expect(removed.status()).toBe(200);
  expect((await removed.json()).data).toEqual(noOne);
  const again = await remove(page, friend.id);
  expect(again.status()).toBe(404);
  expect((await again.json()).error).toBe("You aren't friends with this person.");
  expect((await profileOf(page, friend.id)).status()).toBe(404);
  expect((await profileOf(friend.page, meId)).status()).toBe(404);
  expect(await friendsState(friend.page)).toEqual(noOne);

  // Asking each other at the same moment makes friends.
  const both = await Promise.all([post(page, "", { username: stranger.user.username }), post(stranger.page, "", { username: me.username })]);
  expect(both.map((response) => response.status())).toEqual([201, 201]);
  expect((await friendsState(page)).friends).toEqual([person(stranger)]);
  expect((await friendsState(stranger.page)).friends).toEqual([{ id: meId, username: me.username, avatarUrl: null }]);

  // Refused requests.
  expect((await post(page, "", { username: friend.user.username })).status()).toBe(201);
  const refused: [object, number, string][] = [
    [{}, 400, "Enter a username."],
    [{ username: "   " }, 400, "Enter a username."],
    [{ username: 42 }, 400, "Enter a username."],
    [{ username: "no such user" }, 400, "Usernames have 3-20 characters: a-z, 0-9 and _."],
    [{ username: newUser().username }, 404, "No account has the username"],
    [{ username: me.username.toUpperCase() }, 400, "That's your own username."],
    [{ username: friend.user.username }, 409, `You've already sent ${friend.user.username} a friend request.`],
    [{ username: stranger.user.username }, 409, `You're already friends with ${stranger.user.username}.`],
  ];
  for (const [data, status, error] of refused) {
    const response = await post(page, "", data);
    expect(response.status(), JSON.stringify(data)).toBe(status);
    expect((await response.json()).error).toContain(error);
  }
  // Unknown endpoints, other sites and bodies that aren't JSON.
  expect((await post(page, `/${friend.id}/befriend`)).status()).toBe(404);
  expect((await post(page, `/${friend.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/shows/friends/${friend.id}/library`)).status()).toBe(404);
  expect((await page.request.delete("/api/shows/friends")).status()).toBe(404);
  expect((await post(page, "", { username: friend.user.username }, { Origin: "https://evil.example" })).status()).toBe(403);
  expect((await post(page, `/${meId}/accept`, {}, { Origin: "https://evil.example" })).status()).toBe(403);
  expect((await page.request.delete(`/api/shows/friends/${stranger.id}`, { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
  expect((await page.request.post("/api/shows/friends", { data: "username=x", headers: { "Content-Type": "text/plain" } })).status()).toBe(415);
  expect((await friendsState(page)).friends).toEqual([person(stranger)]);

  // Logged out: 401.
  const anonymous = await playwright.request.newContext({ baseURL });
  expect((await anonymous.get("/api/shows/friends")).status()).toBe(401);
  expect((await anonymous.get(`/api/shows/friends/${friend.id}`)).status()).toBe(401);
  expect((await anonymous.post("/api/shows/friends", { data: { username: friend.user.username } })).status()).toBe(401);
  expect((await anonymous.delete(`/api/shows/friends/${friend.id}`)).status()).toBe(401);
  await anonymous.dispose();

  // Each request says whether a username exists: at most 20 per 15 minutes.
  for (let i = 0; i < 20; i++) expect((await post(friend.page, "", { username: newUser().username })).status()).toBe(404);
  const limited = await post(friend.page, "", { username: me.username });
  expect(limited.status()).toBe(429);
  expect((await limited.json()).error).toBe("Too many friend requests. Try again later.");
  await friend.context.close();
  await stranger.context.close();
});

test("Add a friend suggests usernames while typing, and says whether an account has the one typed", async ({ page, browser }) => {
  const me = await openShows(page);
  const bob = await otherPerson(browser);
  const ann = await otherPerson(browser);
  // Ann already asked me.
  expect((await ann.page.request.post("/api/shows/friends", { data: { username: me.username } })).status()).toBe(201);
  await tab(page, "Profile").click();
  const friends = section(page, "Friends");
  const field = friends.getByRole("combobox", { name: "Add a friend" });
  const list = friends.getByRole("listbox", { name: "Usernames" });

  // The start of Bob's username (in any case, with an @): Bob, and nobody else's says "No account".
  await field.fill(`@${bob.user.username.slice(0, 10).toUpperCase()}`);
  await expect(field).toHaveAttribute("aria-expanded", "true");
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toHaveAccessibleName(bob.user.username);
  await expect(friends).not.toContainText("No account");
  // Picked with the keyboard: the field has it, and says the account is there.
  await field.press("ArrowDown");
  await expect(list.getByRole("option", { name: bob.user.username })).toHaveAttribute("aria-selected", "true");
  await expect(field).toHaveAttribute("aria-activedescendant", (await list.getByRole("option").first().getAttribute("id"))!);
  await field.press("Enter");
  await expect(field).toHaveValue(bob.user.username);
  await expect(list).toBeHidden();
  await expect(friends.getByText(`${bob.user.username} has an account`)).toBeVisible();
  await friends.getByRole("button", { name: "Send request" }).click();
  await expect(friends.getByRole("status")).toHaveText(`Friend request sent to ${bob.user.username}.`);

  // How each is connected, picked with a tap; Escape closes the list.
  await field.fill(ann.user.username.slice(0, 12));
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toHaveAccessibleName(new RegExp(`^${ann.user.username}\\s*Sent you a request$`));
  await field.press("Escape");
  await expect(list).toBeHidden();
  await field.fill(bob.user.username);
  await expect(friends.getByText(`${bob.user.username} has an account · Request sent`)).toBeVisible();
  await field.fill(bob.user.username.slice(0, 12));
  await list.getByRole("option", { name: new RegExp(`^${bob.user.username}`) }).click();
  await expect(field).toHaveValue(bob.user.username);

  // Nobody's, their own, and what no username could be.
  const nobody = newUser().username;
  await field.fill(nobody);
  await expect(friends.getByText(`No account has the username ${nobody}.`)).toBeVisible();
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await field.fill(me.username);
  await expect(friends.getByText("That's your own username.")).toBeVisible();
  await field.fill("no spaces");
  await expect(friends.getByText("Usernames have 3-20 characters: a-z, 0-9 and _.")).toBeVisible();

  // The API: from 2 characters, the exact match first, never the user themselves.
  const search = async (q: string) => (await (await page.request.get(`/api/shows/friends/search?${new URLSearchParams({ q })}`)).json()).data;
  expect(await search("e")).toEqual({ matches: [], exact: false, self: false });
  expect(await search(`@${bob.user.username.toUpperCase()}`)).toEqual({
    matches: [{ id: bob.id, username: bob.user.username, avatarUrl: null, relation: "outgoing" }], exact: true, self: false,
  });
  expect(await search(me.username)).toEqual({ matches: [], exact: false, self: true });
  expect((await search("e2e_")).matches.length).toBeLessThanOrEqual(6);
  expect((await search("e2e_")).matches.map((match: { id: string }) => match.id)).not.toContain(await userId(me.username));
  await bob.context.close();
  await ann.context.close();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("Profile fits the screen, and a friend's profile fills it until Back", async ({ page, browser }) => {
    const me = await openShows(page);
    const friend = await otherPerson(browser);
    await addTitle(friend.page, harbor, "watching", { currentSeason: 1, currentEpisode: 4, isFavourite: true });
    await addTitle(page, paperMoons, "planned", { status: "completed", isFavourite: true });
    expect((await page.request.post("/api/shows/friends", { data: { username: friend.user.username } })).status()).toBe(201);
    expect((await friend.page.request.post(`/api/shows/friends/${await userId(me.username)}/accept`, { data: {} })).status()).toBe(200);
    await page.reload();

    await tab(page, "Profile").tap();
    await expect(statValues(page)).toHaveText(["2.1", "0 episodes · 1 movie", "0", "1"]);
    await expect(friendButton(page, friend.user.username)).toBeVisible();
    // At least 16px, so iOS doesn't zoom in on it.
    await expect(page.getByLabel("Add a friend")).toHaveCSS("font-size", "16px");
    await expectNoHorizontalScroll(page);

    await friendButton(page, friend.user.username).tap();
    const profile = page.getByRole("dialog", { name: friend.user.username });
    await expect(statValues(profile)).toHaveText(["3.5", "4 episodes · 0 movies", "0", "0"]);
    await expect(grid(section(profile, "Watching"), "Watching").getByRole("button")).toHaveAccessibleName(
      "Harbor Lights, 2021, Watching, season 1 episode 4, favourite");
    expect(await profile.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    await expectNoHorizontalScroll(page);
    await page.goBack();
    await expect(profile).toBeHidden();
    await expect(viewHeading(page)).toHaveText("Profile");
    await friend.context.close();
  });
});
