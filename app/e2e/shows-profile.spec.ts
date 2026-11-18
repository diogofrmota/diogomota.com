import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { withDatabase } from "./db";
import { expect, newUser, test, type TestUser } from "./fixtures";
import { mockBase, openShows, otherPerson, section, userId } from "./shows";
const orchard = { type: "tv", tmdbId: mockBase + 1 } as const;
async function addTitle(
  page: Page,
  title: { type: "tv" | "movie"; tmdbId: number },
  status: "watching" | "planned",
  ...changes: object[]
) {
  expect((await page.request.post("/api/shows/library", { data: { ...title, status } })).status()).toBe(201);
  for (const data of changes)
    expect((await page.request.patch(`/api/shows/library/${title.type}/${title.tmdbId}`, { data })).status()).toBe(200);
}
const shown = (user: TestUser) => `${user.name} (@${user.username})`;
const secondWord = (user: TestUser) => user.name.split(" ")[1];
const named = (id: string, user: TestUser) => ({ id, username: user.username, avatarUrl: null, name: user.name });
const friendsState = async (page: Page) => (await (await page.request.get("/api/shows/friends")).json()).data;
test("only accepted friends can read a library through the API, and every friends request is checked", async ({
  page,
  browser,
  baseURL,
  playwright,
}) => {
  test.slow();
  const me = await openShows(page);
  const meId = await userId(me.username);
  const friend = await otherPerson(browser);
  const stranger = await otherPerson(browser);
  await addTitle(friend.page, orchard, "watching", { currentSeason: 1, currentEpisode: 2 }); // 2 × 45 minutes
  const profileOf = (from: Page, id: string) => from.request.get(`/api/shows/friends/${id}`);
  const post = (from: Page, path: string, data: object = {}, headers: Record<string, string> = {}) =>
    from.request.post(`/api/shows/friends${path}`, { data, headers });
  const remove = (from: Page, id: string) => from.request.delete(`/api/shows/friends/${id}`);
  const person = (who: { id: string; user: TestUser }) => named(who.id, who.user);
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
  for (const [from, path] of [
    [page, `/${friend.id}/accept`],
    [page, `/${friend.id}/decline`],
    [friend.page, `/${meId}/cancel`],
    [stranger.page, `/${meId}/accept`],
    [stranger.page, `/${friend.id}/accept`],
    [stranger.page, `/${meId}/cancel`],
  ] as const) {
    const response = await post(from, path);
    expect(response.status(), path).toBe(404);
    expect((await response.json()).error).toBe("This friend request isn't there anymore.");
  }
  expect((await remove(friend.page, meId)).status()).toBe(404);
  expect(await friendsState(friend.page)).toEqual({ ...noOne, incoming: [named(meId, me)] });

  // Accepted: we see each other's libraries; the stranger still sees neither.
  const accepted = await post(friend.page, `/${meId}/accept`);
  expect(accepted.status()).toBe(200);
  expect((await accepted.json()).data).toEqual({ ...noOne, friends: [named(meId, me)] });
  const friendProfile = await profileOf(page, friend.id);
  expect(friendProfile.status()).toBe(200);
  expect((await friendProfile.json()).data).toMatchObject({
    ...person(friend),
    stats: { tvCompleted: 0, moviesCompleted: 0, episodesWatched: 2, minutesWatched: 90 },
    items: [{ title: "The Quiet Orchard", library: { status: "watching", currentSeason: 1, currentEpisode: 2 } }],
  });
  expect((await (await profileOf(friend.page, meId)).json()).data).toEqual({
    ...named(meId, me),
    stats: { tvCompleted: 0, moviesCompleted: 0, episodesWatched: 0, minutesWatched: 0 },
    items: [],
    // What both have Planned: nothing here.
    bothPlanned: [],
  });
  expect((await profileOf(stranger.page, friend.id)).status()).toBe(404);
  expect((await profileOf(stranger.page, meId)).status()).toBe(404);
  expect((await (await stranger.page.request.get("/api/shows/discover/tv/friends")).json()).data).toEqual([]);
  expect(
    (await (await page.request.get("/api/shows/discover/tv/friends")).json()).data.map(
      (title: { title: string }) => title.title,
    ),
  ).toEqual(["The Quiet Orchard"]);
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
  const both = await Promise.all([
    post(page, "", { username: stranger.user.username }),
    post(stranger.page, "", { username: me.username }),
  ]);
  expect(both.map((response) => response.status())).toEqual([201, 201]);
  expect((await friendsState(page)).friends).toEqual([person(stranger)]);
  expect((await friendsState(stranger.page)).friends).toEqual([named(meId, me)]);

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
  // A friend is read (GET) and removed (DELETE), not posted to.
  expect((await post(page, `/${friend.id}`)).status()).toBe(405);
  expect((await page.request.get(`/api/shows/friends/${friend.id}/library`)).status()).toBe(404);
  // The list is read and posted to, not deleted.
  expect((await page.request.delete("/api/shows/friends")).status()).toBe(405);
  expect((await post(page, "", { username: friend.user.username }, { Origin: "https://evil.example" })).status()).toBe(
    403,
  );
  expect((await post(page, `/${meId}/accept`, {}, { Origin: "https://evil.example" })).status()).toBe(403);
  expect(
    (
      await page.request.delete(`/api/shows/friends/${stranger.id}`, { headers: { Origin: "https://evil.example" } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/shows/friends", { data: "username=x", headers: { "Content-Type": "text/plain" } })
    ).status(),
  ).toBe(415);
  expect((await friendsState(page)).friends).toEqual([person(stranger)]);

  // Logged out: 401.
  const anonymous = await playwright.request.newContext({ baseURL });
  expect((await anonymous.get("/api/shows/friends")).status()).toBe(401);
  expect((await anonymous.get(`/api/shows/friends/${friend.id}`)).status()).toBe(401);
  expect((await anonymous.post("/api/shows/friends", { data: { username: friend.user.username } })).status()).toBe(401);
  expect((await anonymous.delete(`/api/shows/friends/${friend.id}`)).status()).toBe(401);
  await anonymous.dispose();

  // Each request says whether a username exists: at most 20 per 15 minutes.
  for (let i = 0; i < 20; i++)
    expect((await post(friend.page, "", { username: newUser().username })).status()).toBe(404);
  const limited = await post(friend.page, "", { username: me.username });
  expect(limited.status()).toBe(429);
  expect((await limited.json()).error).toBe("Too many friend requests. Try again later.");
  await friend.context.close();
  await stranger.context.close();
});

test("the friend search suggests people by username or name while typing, and says whether an account has the username typed", async ({
  page,
  browser,
}) => {
  const me = await openShows(page);
  const bob = await otherPerson(browser);
  const ann = await otherPerson(browser);
  // Ann already asked me.
  expect((await ann.page.request.post("/api/social/friends", { data: { username: me.username } })).status()).toBe(201);
  await page.goto("/shows/profile");
  const friends = section(page, "Friends");
  const field = friends.getByRole("combobox", { name: "Add a friend" });
  const list = friends.getByRole("listbox", { name: "People" });

  // The start of Bob's username (in any case, with an @): Bob, and nobody else's says "No account".
  await field.fill(`@${bob.user.username.slice(0, 10).toUpperCase()}`);
  await expect(field).toHaveAttribute("aria-expanded", "true");
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toHaveAccessibleName(shown(bob.user));
  await expect(friends).not.toContainText("No one found");
  // Picked with the keyboard: the field has it, and says the account is there.
  await field.press("ArrowDown");
  await expect(list.getByRole("option", { name: shown(bob.user) })).toHaveAttribute("aria-selected", "true");
  await expect(field).toHaveAttribute(
    "aria-activedescendant",
    (await list.getByRole("option").first().getAttribute("id"))!,
  );
  await field.press("Enter");
  await expect(field).toHaveValue(bob.user.username);
  await expect(list).toBeHidden();
  await expect(friends.getByText(`${bob.user.username} has an account`)).toBeVisible();
  await friends.getByRole("button", { name: "Send request" }).click();
  await expect(friends.getByRole("status")).toHaveText(`Friend request sent to ${bob.user.username}.`);

  // How each is connected, picked with a tap; Escape closes the list.
  await field.fill(ann.user.username.slice(0, 12));
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toHaveAccessibleName(
    new RegExp(`^${ann.user.name} \\(@${ann.user.username}\\)\\s*Sent you a request$`),
  );
  await field.press("Escape");
  await expect(list).toBeHidden();
  await field.fill(bob.user.username);
  await expect(friends.getByText(`${bob.user.username} has an account · Request sent`)).toBeVisible();
  await field.fill(bob.user.username.slice(0, 12));
  await list.getByRole("option", { name: new RegExp(`^${bob.user.name}`) }).click();
  await expect(field).toHaveValue(bob.user.username);

  // Nobody's, their own, and after an @, what no username could be.
  const nobody = newUser().username;
  await field.fill(nobody);
  await expect(friends.getByText(`No one found for “${nobody}”.`)).toBeVisible();
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await field.fill(me.username);
  await expect(friends.getByText("That's your own username.")).toBeVisible();
  await field.fill("@no spaces");
  await expect(friends.getByText("Usernames have 3-20 characters: a-z, 0-9 and _.")).toBeVisible();

  // By name too: from its start or any word's, in any case and without its accents.
  await withDatabase((client) =>
    client.query("UPDATE users SET name = $2 WHERE id = $1", [ann.id, `João ${secondWord(ann.user)}`]),
  );
  await field.fill(`joao ${secondWord(ann.user).toUpperCase()}`);
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toHaveAccessibleName(
    new RegExp(`^João ${secondWord(ann.user)} \\(@${ann.user.username}\\)`),
  );
  // Not from the middle of a word.
  await field.fill(secondWord(ann.user).slice(2));
  await expect(friends.getByText(`No one found for “${secondWord(ann.user).slice(2)}”.`)).toBeVisible();
  // A name that fits several people: which one?
  await field.fill("Tester");
  await expect.poll(() => list.getByRole("option").count()).toBeGreaterThan(1);
  await friends.getByRole("button", { name: "Send request" }).click();
  await expect(friends.getByText("Choose someone from the list.")).toBeVisible();
  // A later word of their name alone: the one person, whose request that accepts.
  await field.fill(secondWord(ann.user));
  await expect(list.getByRole("option")).toHaveCount(1);
  await friends.getByRole("button", { name: "Send request" }).click();
  await expect(friends.getByRole("status")).toHaveText(
    `${ann.user.username} had already sent you a request: you're now friends.`,
  );

  // The API: from 2 characters, the exact match first, never the user themselves.
  const search = async (q: string) =>
    (await (await page.request.get(`/api/social/friends/search?${new URLSearchParams({ q })}`)).json()).data;
  expect(await search("e")).toEqual({ matches: [], exact: false, self: false });
  expect(await search(`@${bob.user.username.toUpperCase()}`)).toEqual({
    matches: [{ ...named(bob.id, bob.user), relation: "outgoing" }],
    exact: true,
    self: false,
  });
  // Names: not a username, so never exact; after an @, only usernames.
  expect(await search(` ${secondWord(bob.user).toLowerCase()} `)).toEqual({
    matches: [{ ...named(bob.id, bob.user), relation: "outgoing" }],
    exact: false,
    self: false,
  });
  expect(await search(`@${secondWord(bob.user)}`)).toEqual({ matches: [], exact: false, self: false });
  expect(await search(me.username)).toEqual({ matches: [], exact: false, self: true });
  expect((await search("e2e_")).matches.length).toBeLessThanOrEqual(6);
  expect((await search("e2e_")).matches.map((match: { id: string }) => match.id)).not.toContain(
    await userId(me.username),
  );
  await bob.context.close();
  await ann.context.close();
});
