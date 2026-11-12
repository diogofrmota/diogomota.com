import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { checkView, emulateHomeIndicator } from "./checks";
import { accountButton, accountSetting, expect, newUser, signUp, test } from "./fixtures";
import { card, grid, mockBase, openShows, otherPerson, section, tab, userId, viewHeading } from "./shows";

// Every view of the site and of both apps, with their dialogs open and in their
// empty, loading-failed and filled states, through checks.ts: the layout at the
// project's sizes and axe in both themes. Each app's walk-through closes every
// dialog and leaves every view with Back, as a phone's back gesture does.

test.beforeEach(async ({ page, isMobile }) => {
  if (isMobile) await emulateHomeIndicator(page);
  // Each test checks a dozen views or more, with axe twice at each.
  test.slow();
});

const sharedTab = (page: Page, view: string) =>
  page.getByRole("navigation", { name: "Shared", exact: true }).getByRole("button", { name: view, exact: true });

async function goBackTo(page: Page, view: string) {
  await page.goBack();
  await expect(viewHeading(page)).toHaveText(view);
}

test("the site's pages", async ({ page }) => {
  for (const [path, view] of [["/", "landing"], ["/apps", "apps"], ["/login", "login"], ["/signup", "sign up"],
    ["/forgot-password", "forgot password"], ["/reset-password", "expired reset link"], ["/no-such-page", "404"]]) {
    await page.goto(path);
    await checkView(page, view);
  }

  await page.goto(`/test/error?id=${randomUUID()}`);
  await expect(page.getByRole("heading", { name: "something went wrong" })).toBeVisible();
  await checkView(page, "error page");

  await page.goto("/apps");
  await page.getByRole("main").getByRole("link", { name: "Shows", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Log in to open Shows" })).toBeVisible();
  await checkView(page, "login prompt");

  await page.goto("/signup");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByLabel("Username")).toHaveAttribute("aria-invalid", "true");
  await checkView(page, "sign up with errors");

  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await checkView(page, "apps, logged in");
  await accountButton(page, user.username).click();
  await checkView(page, "account menu");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL("/account");
  await checkView(page, "account");

  // A setting's popup, and the profile picture's, then a photo chosen for it: Adjust your picture.
  await accountSetting(page, "Email").click();
  const email = page.getByRole("dialog", { name: "Email", exact: true });
  await expect(email.getByLabel("Email", { exact: true })).toBeFocused();
  await checkView(page, "account, a setting's popup");
  await page.keyboard.press("Escape");
  await expect(email).toBeHidden();
  await page.getByRole("main").getByRole("button", { name: "Profile picture", exact: true }).click();
  const picture = page.getByRole("dialog", { name: "Profile picture", exact: true });
  await expect(picture).toBeVisible();
  await checkView(page, "account, the profile picture's popup");
  await picture.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png",
    buffer: await sharp({ create: { width: 800, height: 600, channels: 3, background: "#3366cc" } }).png().toBuffer() });
  const crop = page.getByRole("dialog", { name: "Adjust your picture" });
  await expect(crop.getByRole("button", { name: "Save picture" })).toBeEnabled();
  await checkView(page, "adjust your picture");
  await crop.getByRole("button", { name: "Cancel" }).click();
  await expect(crop).toBeHidden();
});

test("Shared: every view and dialog, each closed with Back", async ({ page }) => {
  await signUp(page, newUser(), "/signup?next=/shared");
  await expect(page.getByRole("heading", { name: "Your shared space" })).toBeVisible();
  await checkView(page, "Shared welcome");

  await page.getByRole("button", { name: "Create space" }).click();
  await expect(viewHeading(page)).toHaveText("Calendar");
  await expect(page.getByText("Nothing planned yet — tap a day to add your first event!")).toBeVisible();
  await checkView(page, "Calendar, empty");

  await page.getByRole("button", { name: "Add event", exact: true }).click();
  const newEvent = page.getByRole("dialog", { name: "Create a new event" });
  await expect(newEvent.getByLabel("Event title")).toBeFocused();
  await checkView(page, "new event");
  await page.goBack();
  await expect(newEvent).toBeHidden();
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await newEvent.getByLabel("Event title").fill("Dinner");
  await newEvent.getByRole("button", { name: "Save event" }).click();
  await expect(newEvent).toBeHidden();

  await page.getByRole("button", { name: /^Dinner, 09:00/ }).click();
  const event = page.getByRole("dialog", { name: "Dinner" });
  await expect(event.getByRole("button", { name: "Edit event" })).toBeVisible();
  await checkView(page, "event");
  await page.goBack();
  await expect(event).toBeHidden();
  for (const view of ["Week", "Day"]) {
    await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: view }).click();
    await checkView(page, `Calendar, ${view.toLowerCase()}`);
  }

  await sharedTab(page, "Tasks").click();
  await expect(page.getByRole("heading", { name: "Start your first list" })).toBeVisible();
  await checkView(page, "Tasks, no lists");
  await page.getByLabel("List name").fill("Groceries");
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByText("Nothing to do yet — add your first task!")).toBeVisible();
  await checkView(page, "Tasks, empty list");
  for (const title of ["Apples", "Bread", "Coffee"]) {
    await page.getByLabel("Write a task").fill(title);
    await page.getByLabel("Write a task").press("Enter");
  }
  // Ticked off, it moves to the Done section, which opens with a click.
  await page.getByRole("checkbox", { name: "Coffee" }).click();
  await page.getByText("Done (1)").click();
  await expect(page.getByRole("list", { name: "Done" }).getByRole("checkbox", { name: "Coffee" })).toBeChecked();
  // Once saved: "Saving…" fades in when saving is slow, and axe would catch it half faded.
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await checkView(page, "Tasks");

  await page.getByRole("button", { name: /^Apples/ }).click();
  const task = page.getByRole("dialog", { name: "Edit task" });
  await checkView(page, "task");
  await page.goBack();
  await expect(task).toBeHidden();
  await page.getByRole("button", { name: "Edit lists" }).click();
  const lists = page.getByRole("dialog", { name: "Lists" });
  await checkView(page, "lists");
  await page.goBack();
  await expect(lists).toBeHidden();
  await page.getByRole("button", { name: /^Bread/ }).click();
  await task.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deleted “Bread”" })).toBeVisible();
  await checkView(page, "undo delete");

  await sharedTab(page, "Settings").click();
  await expect(viewHeading(page)).toHaveText("Settings");
  await page.getByRole("button", { name: "Generate invite" }).click();
  await expect(page.getByLabel("Invite code")).toHaveValue(/.{8}/);
  await checkView(page, "Settings");
  await page.getByRole("button", { name: "Leave this group", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm leave" })).toBeVisible();
  await checkView(page, "Settings, confirm leave");

  await goBackTo(page, "Tasks");
  await goBackTo(page, "Calendar");
});

test("Shows: every view and dialog, each closed with Back", async ({ page, browser }) => {
  const me = await openShows(page);
  // A new account's guide: TV shows, movies, friends, then what was added.
  const main = page.getByRole("main");
  const guide = main.getByRole("region", { name: "Which TV shows do you watch?" });
  const glass = card(grid(guide, "TV shows to choose from"), "Glass Meridian");
  await expect(glass).toBeVisible();
  await expect(guide.getByTestId("skeleton")).toHaveCount(0);
  await glass.click();
  const chooser = guide.getByRole("group", { name: "Add Glass Meridian as" });
  await expect(chooser.getByRole("button")).toHaveText(["Planned", "Watching", "Completed", "Cancel"]);
  await checkView(page, "Watchlist, the guide's status chooser");
  await chooser.getByRole("button", { name: "Watching" }).click();
  const lastWatched = guide.getByRole("group", { name: "Last watched" });
  await expect(lastWatched.getByLabel("Season", { exact: true })).toBeFocused();
  await checkView(page, "Watchlist, the guide's last episode watched");
  await lastWatched.getByRole("button", { name: "Save" }).click();
  await expect(glass).toHaveAccessibleName(/, in your library as Watching$/);
  await checkView(page, "Watchlist, the guide");
  await main.getByRole("button", { name: "Next" }).click();
  await expect(main.getByRole("region", { name: "And which movies?" })).toBeVisible();
  await main.getByRole("button", { name: "Next" }).click();
  await expect(main.getByRole("region", { name: "Watch together" })).toBeVisible();
  await checkView(page, "Watchlist, the guide's friends step");
  await main.getByRole("button", { name: "Back" }).click();
  await main.getByRole("button", { name: "Back" }).click();
  await expect(guide).toBeVisible();
  for (let i = 0; i < 3; i++) await main.getByRole("button", { name: /^(Next|Finish)$/ }).click();
  const allSet = main.getByRole("region", { name: "You’re all set!" });
  await expect(allSet.getByRole("list", { name: "In your library" }).getByRole("listitem")).toHaveText(["0 Planned", "1 Watching", "0 Completed"]);
  await checkView(page, "Watchlist, the guide's end");
  await allSet.getByRole("button", { name: "Go to my library" }).click();
  await expect(card(grid(section(page, "Watching"), "Watching TV shows"), "Glass Meridian")).toBeVisible();

  await tab(page, "Discover").click();
  await expect(card(grid(page, "Popular TV shows"), "Harbor Lights")).toBeVisible();
  await expect(page.getByTestId("skeleton").filter({ visible: true })).toHaveCount(0);
  await checkView(page, "Discover");

  await page.getByRole("main").getByRole("button", { name: "Search TV shows and movies" }).click();
  const search = page.getByRole("dialog", { name: "Search" });
  await search.getByRole("searchbox").fill("harbor");
  await expect(card(grid(search, "Search results"), "Harbor Lights")).toBeVisible();
  await checkView(page, "search");
  await card(grid(search, "Search results"), "Harbor Lights").click();
  const title = page.getByRole("dialog", { name: "Harbor Lights" });
  await expect(title.getByRole("group", { name: "Add to Library" })).toBeVisible();
  await checkView(page, "title");
  await title.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Watching" }).click();
  await expect(title.getByRole("status")).toHaveText("In your library");
  await checkView(page, "title in the library");
  await page.goBack();
  await expect(title).toBeHidden();
  await expect(search).toBeVisible();
  await page.goBack();
  await expect(search).toBeHidden();

  await tab(page, "Watchlist").click();
  await expect(card(grid(section(page, "Watching"), "Watching TV shows"), "Harbor Lights")).toBeVisible();
  await checkView(page, "Watchlist");
  await page.getByRole("button", { name: "Quick actions for Harbor Lights" }).press("Enter");
  const actions = page.getByRole("dialog", { name: "Harbor Lights" });
  await expect(actions.getByRole("group", { name: "Status" })).toBeVisible();
  await checkView(page, "quick actions");
  await page.goBack();
  await expect(actions).toBeHidden();

  // A friend, with a title in their library, and someone asking to be one.
  const friend = await otherPerson(browser);
  const asker = await otherPerson(browser);
  const myId = await userId(me.username);
  await friend.page.request.post("/api/shows/library", { data: { type: "tv", tmdbId: mockBase + 101, status: "watching" } });
  expect((await page.request.post("/api/shows/friends", { data: { username: friend.user.username } })).status()).toBe(201);
  expect((await friend.page.request.post(`/api/shows/friends/${myId}/accept`, { data: {} })).status()).toBe(200);
  expect((await asker.page.request.post("/api/shows/friends", { data: { username: me.username } })).status()).toBe(201);

  await tab(page, "Profile").click();
  await expect(page.getByRole("button", { name: `Accept ${asker.user.username}` })).toBeVisible();
  const friendLink = page.getByRole("list", { name: "Your friends" }).getByRole("button", { name: new RegExp(`\\(@${friend.user.username}\\) Check profile$`) });
  await expect(friendLink).toBeVisible();
  await checkView(page, "Profile");
  // Add a friend's suggestions, open under the field.
  await page.getByLabel("Add a friend").fill(asker.user.username.slice(0, 10));
  await expect(page.getByRole("listbox", { name: "People" }).getByRole("option", { name: new RegExp(asker.user.username) })).toBeVisible();
  await checkView(page, "Profile, Add a friend's suggestions");
  await page.getByLabel("Add a friend").fill("");
  await friendLink.click();
  const profile = page.getByRole("dialog", { name: friend.user.username });
  await expect(card(profile, "Harbor Lights")).toBeVisible();
  await checkView(page, "friend's profile");
  await page.goBack();
  await expect(profile).toBeHidden();

  await goBackTo(page, "Watchlist");
  await goBackTo(page, "Discover");
  await friend.context.close();
  await asker.context.close();
});

test("a load that fails says so, and Retry loads it again", async ({ page }) => {
  const offline = "Could not reach the server. Check your connection.";
  const failing = async (path: string, view: () => Promise<void>, name: string) => {
    await page.route(path, (route) => route.request().method() === "GET" ? route.abort("internetdisconnected") : route.fallback());
    await view();
    const alert = page.getByRole("main").getByRole("alert").filter({ hasText: offline });
    await expect(alert).toBeVisible();
    await checkView(page, `${name}, failed to load`);
    await page.unroute(path);
    await alert.getByRole("button", { name: "Retry" }).click();
    await expect(alert).toBeHidden();
  };

  await signUp(page, newUser(), "/signup?next=/shared");
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(viewHeading(page)).toHaveText("Calendar");
  await failing("**/api/shared/events", async () => { await page.reload(); }, "Calendar");
  await expect(page.getByText("Nothing planned yet — tap a day to add your first event!")).toBeVisible();
  await failing("**/api/shared/tasks", () => sharedTab(page, "Tasks").click(), "Tasks");
  await expect(page.getByRole("heading", { name: "Start your first list" })).toBeVisible();
  await failing("**/api/shared/spaces", () => sharedTab(page, "Settings").click(), "Settings");
  await expect(page.getByRole("listitem").filter({ hasText: "(you)" })).toBeVisible();

  await failing("**/api/shows/library", async () => { await page.goto("/shows"); }, "Shows Watchlist");
  await expect(page.getByRole("heading", { name: "Which TV shows do you watch?" })).toBeVisible();
  await failing("**/api/shows/discover/tv/popular", () => tab(page, "Discover").click(), "Discover");
  await expect(card(grid(page, "Popular TV shows"), "Harbor Lights")).toBeVisible();
  await failing("**/api/shows/friends", () => tab(page, "Profile").click(), "Profile");
  await expect(page.getByText("No friends yet.", { exact: false })).toBeVisible();
});
