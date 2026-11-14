import type { Page } from "@playwright/test";
import { apps } from "../lib/apps";
import { expect, linkNames, newUser, signUp, test } from "./fixtures";
import { mockBase, otherPerson, userId } from "./shows";

// Home: the apps (docs/decisions/0014). Logged out, the front page: what the
// site is, Log in and Sign up, and a card for each app, which opens its login
// prompt. Logged in, the apps' icons, with what is waiting in each and going
// back to the view last used in it.

const card = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
const tabBar = (page: Page) => page.getByRole("navigation", { name: "Account" });

test("/apps is now home: it redirects there for good, with its query", async ({ page }) => {
  const response = await page.request.get("/apps?next=%2Fshows", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("/?next=%2Fshows");
  await page.goto("/apps?account=deleted");
  await expect(page).toHaveURL("/?account=deleted");
  await expect(page.getByRole("status")).toHaveText("Your account and everything it had here were deleted.");
});

test("logged out, home is the front page: what the site is, Log in and Sign up, then the apps", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("diogo mota");
  // Logged out, in Light.
  await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "minimal-neutrals");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Small apps for friends");
  await expect(main.getByText(/^A shared calendar and task lists for couples/)).toBeVisible();
  // As everywhere, Log in first and plain, then Sign up, the call to action.
  const hero = main.getByRole("region", { name: "Small apps for friends" });
  const login = (await hero.getByRole("link", { name: "Log in" }).boundingBox())!;
  const signup = (await hero.getByRole("link", { name: "Sign up" }).boundingBox())!;
  expect(login.y).toBe(signup.y);
  expect(signup.x).toBeGreaterThan(login.x + login.width);

  // A card for each app: its picture, icon, name and what it does.
  expect(apps.map((app) => app.name)).toEqual(["Shared", "Shows"]);
  for (const app of apps) {
    const item = card(page, app.name);
    await expect(item).toBeVisible();
    for (const feature of app.features) await expect(item).toContainText(feature);
    const logo = item.locator("img");
    await expect(logo).toHaveAttribute("src", app.logo);
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }

  // "dev" unless APP_VERSION is set, as it is in the Docker image; then Privacy and About.
  await expect(main.getByText(/^Version (dev|v\d+\.\d+\.\d+) · Privacy · About$/)).toBeVisible();
  await expect(main.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await expect(main.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");

  // The site's description and preview are the apps'.
  const meta = (attribute: string, value: string) => page.locator(`head meta[${attribute}="${value}"]`);
  await expect(meta("name", "description")).toHaveAttribute("content", "Small apps for friends: Shared and Shows.");
  await expect(meta("property", "og:url")).toHaveAttribute("content", "https://diogomota.com");
  const image = await page.request.get("/opengraph-image");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("the tab bar: Log in, Sign up (each its own icon) and Home, here and on the login pages", async ({ page }) => {
  await page.goto("/");
  const bar = tabBar(page);
  // On a wide screen, the site's name on the header's left, to home.
  expect(await linkNames(bar)).toEqual(["diogomota.com", "Log in", "Sign up", "Home"]);
  await expect(bar.getByRole("link", { name: "diogomota.com" })).toHaveAttribute("href", "/");
  await expect(bar.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  const icons = await bar
    .getByRole("link")
    .evaluateAll((links) => links.flatMap((link) => link.querySelector("svg")?.innerHTML ?? []));
  expect(icons).toHaveLength(3);
  expect(new Set(icons).size).toBe(3);

  await bar.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
  // No top bar and no Back to apps: the tab bar, with Log in current.
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to apps" })).toHaveCount(0);
  await expect(bar.getByRole("link", { name: "Log in" })).toHaveAttribute("aria-current", "page");

  await bar.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");
  await expect(bar.getByRole("link", { name: "Sign up" })).toHaveAttribute("aria-current", "page");

  await bar.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL("/");

  // From an app's login prompt, the title says which app.
  await page.goto("/signup?next=%2Fshows");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign up to use Shows");
  await page.goto("/login?next=%2Fshared");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in to open Shared");
});

test("sent home from a protected page, Log in and Sign up return there, and an app's prompt opens", async ({
  page,
}) => {
  await page.goto("/account");
  await expect(page).toHaveURL("/?next=%2Faccount");
  const hero = page.getByRole("main").getByRole("region", { name: "Small apps for friends" });
  await expect(hero.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Faccount");
  await expect(hero.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup?next=%2Faccount");
  await expect(tabBar(page).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Faccount");

  await page.goto("/shows/discover");
  await expect(page).toHaveURL("/?next=%2Fshows%2Fdiscover");
  await expect(page.getByRole("dialog", { name: "Log in to open Shows" })).toBeVisible();
});

for (const app of apps) {
  test(`clicking the ${app.name} card while logged out opens the login prompt`, async ({ page }) => {
    await page.goto("/");
    // A corner of the card, away from the name: the whole card is clickable.
    await card(page, app.name).click({ position: { x: 8, y: 8 } });

    const prompt = page.getByRole("dialog", { name: `Log in to open ${app.name}` });
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL("/");
    // What the app is for, under the title.
    await expect(prompt.getByRole("paragraph")).toHaveText(app.description);

    const next = new URLSearchParams({ next: app.href });
    await expect(prompt.getByRole("link", { name: "Log in" })).toHaveAttribute("href", `/login?${next}`);
    await expect(prompt.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", `/signup?${next}`);

    await prompt.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(`/login?${next}`);
  });
}

test("the login prompt closes with Escape, its close button or the backdrop", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("main").getByRole("link", { name: "Shared", exact: true });
  const prompt = page.getByRole("dialog");

  await link.click();
  await expect(prompt).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(prompt).toBeHidden();
  await expect(link).toBeFocused();

  await link.click();
  await prompt.getByRole("button", { name: "Close" }).click();
  await expect(prompt).toBeHidden();

  await link.click();
  await page.mouse.click(5, 5);
  await expect(prompt).toBeHidden();
  await expect(page).toHaveURL("/");
});

test("logged in, home is the apps' icons, and the email note sends its link from here", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  // Signing up with nowhere to go next lands home.
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("Apps");
  expect(await linkNames(tabBar(page))).toEqual(["diogomota.com", "Account", "Home"]);
  await expect(tabBar(page).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

  // An icon for each app, straight into it, with what it is for read out with it.
  for (const app of apps) {
    const link = page.getByRole("main").getByRole("link", { name: app.name, exact: true });
    await expect(link).toHaveAttribute("href", app.href);
    await expect(link).toHaveAccessibleDescription(app.description);
    await expect(link.locator("img")).toHaveAttribute("src", app.logo);
  }
  // Nothing waiting yet: no badges.
  await expect(page.getByRole("main").locator("[class*='badge']")).toHaveCount(0);

  // Not confirmed yet: Send it again sends another link here, and says so.
  const note = page.getByRole("main").locator("form").filter({ hasText: "Confirm your email" });
  await expect(note).toContainText(user.email);
  await note.getByRole("button", { name: "Send it again" }).click();
  await expect(note.getByRole("button", { name: "Sent" })).toBeDisabled();
  await expect(note.getByRole("status")).toHaveText(`We sent a new link to ${user.email}.`);
  await expect(page).toHaveURL("/");
});

test("an app's icon reopens the view last used in it, and Shared without a space its welcome", async ({ page }) => {
  await signUp(page, newUser());
  await expect(page).toHaveURL("/");

  await page.goto("/shows/discover");
  await expect(
    page.getByRole("navigation", { name: "Shows" }).getByRole("button", { name: "Discover" }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("navigation", { name: "Shows" }).getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL("/");
  const shows = page.getByRole("main").getByRole("link", { name: "Shows", exact: true });
  await expect(shows).toHaveAttribute("href", "/shows/discover");
  await shows.click();
  await expect(page).toHaveURL("/shows/discover");

  // Back on its first view: the app's own path.
  await page.getByRole("navigation", { name: "Shows" }).getByRole("button", { name: "Library" }).click();
  await page.goto("/");
  await expect(shows).toHaveAttribute("href", "/shows");

  // Shared remembers Tasks, but without a space it can only open on its welcome.
  await page.context().addCookies([{ name: "last-view-shared", value: "tasks", url: page.url() }]);
  await page.reload();
  await expect(page.getByRole("main").getByRole("link", { name: "Shared", exact: true })).toHaveAttribute(
    "href",
    "/shared",
  );
  expect((await page.request.post("/api/shared/spaces", { data: {} })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole("main").getByRole("link", { name: "Shared", exact: true })).toHaveAttribute(
    "href",
    "/shared/tasks",
  );
});

test("badges: Shared's tasks due for you, Shows' friend requests and new recommendations", async ({
  page,
  browser,
}) => {
  const me = newUser();
  await signUp(page, me);
  await expect(page).toHaveURL("/");
  const meId = await userId(me.username);
  const icon = (name: string) => page.getByRole("main").getByRole("link", { name: new RegExp(`^${name}\\b`) });

  // Shared: tasks due today or before, for me or for nobody; not later, not done, not someone else's.
  expect((await page.request.post("/api/shared/spaces", { data: {} })).ok()).toBe(true);
  const list = (await (await page.request.post("/api/shared/tasks/lists", { data: { name: "Home" } })).json()).data;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(
    new Date(Date.now() - 86_400_000),
  );
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(
    new Date(Date.now() + 86_400_000),
  );
  for (const task of [
    { title: "Rent", dueDate: today, assigneeIds: [meId] },
    { title: "Shelf", dueDate: yesterday },
    { title: "Later", dueDate: tomorrow },
    { title: "Done", dueDate: today, isComplete: true },
  ]) {
    const created = await page.request.post(`/api/shared/tasks/lists/${list.id}/tasks`, { data: task });
    expect(created.ok(), task.title).toBe(true);
  }
  await page.reload();
  await expect(icon("Shared")).toHaveAccessibleName("Shared, 2 tasks due");
  await expect(icon("Shared").getByText("2", { exact: true })).toBeVisible();

  // Shows: a friend request waiting, then a friend's recommendation, which Discover then shows.
  const friend = await otherPerson(browser);
  expect((await friend.page.request.post("/api/shows/friends", { data: { username: me.username } })).ok()).toBe(true);
  await page.reload();
  await expect(icon("Shows")).toHaveAccessibleName("Shows, 1 new");

  expect((await page.request.post("/api/shows/friends", { data: { username: friend.user.username } })).ok()).toBe(true);
  const recommended = await friend.page.request.post("/api/shows/recommendations", {
    data: { friendId: meId, type: "tv", tmdbId: mockBase + 103 },
  });
  expect(recommended.ok()).toBe(true);
  await page.reload();
  await expect(icon("Shows")).toHaveAccessibleName("Shows, 1 new");

  const seen = page.waitForResponse((response) => response.url().endsWith("/api/shows/recommendations/seen"));
  await page.goto("/shows/discover");
  await expect(page.getByRole("region", { name: "Recommended by Friends" })).toBeVisible();
  expect((await seen).ok()).toBe(true);
  await page.goto("/");
  await expect(icon("Shows")).toHaveAccessibleName("Shows");
  await friend.context.close();
});
