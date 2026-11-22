import { type Page } from "@playwright/test";
import {
  expect,
  followAccountMenu,
  homeLink,
  linkNames,
  newUser,
  openFromHome,
  saveTheme,
  signUp,
  test,
} from "./fixtures";

// The tabs, of the apps with views of their own. Calendar and Tasks have one
// view each, so no tabs (the group's settings are a page of their own, /couples).
const appViews = [
  { path: "/shows", name: "Shows", views: ["Library", "Discover", "Profile"] },
  { path: "/books", name: "Books", views: ["Library", "Discover", "Profile"] },
  { path: "/fitness", name: "Fitness", views: ["Today", "Workouts", "Progress"] },
] as const;
const oneView = [
  { path: "/calendar", name: "Calendar" },
  { path: "/tasks", name: "Tasks" },
] as const;

/** A view's URL: the app's own path for its first view, the view under it for the others. */
const viewUrl = (app: (typeof appViews)[number], view: string) =>
  view === app.views[0] ? app.path : `${app.path}/${view.toLowerCase()}`;
/** A view's heading: its tab's name, but your own profile is "My profile". */
const headingOf = (view: string) => (view === "Profile" ? "My profile" : view);

/** The top bar: ‹ Home, the app's name and Account; the app's tabs are in it too. */
const topBar = (page: Page) => page.getByRole("banner");
/** The app's tabs: in the middle of the top bar on a wide screen, along the bottom on a phone. */
const tabBar = (page: Page, app: string) => page.getByRole("navigation", { name: app, exact: true });
const tab = (page: Page, app: string, view: string) =>
  tabBar(page, app).getByRole("button", { name: view, exact: true });
/** The heading of the view that is showing (hidden views are out of the accessibility tree). */
const viewHeading = (page: Page) => page.getByRole("main").getByRole("heading", { level: 1 });

async function openApp(page: Page, path: string) {
  const user = newUser();
  await signUp(page, user, `/signup?${new URLSearchParams({ next: path })}`);
  await expect(page).toHaveURL(path, { timeout: 30000 });
  if (path === "/calendar") {
    await page.getByRole("button", { name: "Create a group" }).click();
    await expect(viewHeading(page)).toHaveText("Calendar");
  }
  return user;
}

/** Saves a theme in Account (/account), opened from the account menu. */
async function chooseTheme(page: Page, theme: "Dark" | "Light") {
  await followAccountMenu(page, "Account");
  await expect(page).toHaveURL("/account");
  await saveTheme(page, theme);
}

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test("each app's tabs switch views, each at its own URL, without loading a page, in a header that stays at the top; ‹ Home goes to / @smoke", async ({
  page,
}) => {
  await openApp(page, "/calendar");
  // An app with one view: its name and ‹ Home in the top bar, and no tabs.
  for (const app of oneView) {
    await page.goto(app.path);
    await expect(page).toHaveTitle(`${app.name} · diogo mota`);
    await expect(viewHeading(page)).toHaveText(app.name);
    await expect(topBar(page)).toContainText(app.name);
    expect(await linkNames(topBar(page))).toEqual(["Home", "Account"]);
    await expect(page.getByRole("navigation")).toHaveCount(0);
  }
  for (const app of appViews) {
    await page.goto(app.path);
    await expect(page).toHaveTitle(`${app.name} · diogo mota`);
    await expect(viewHeading(page)).toHaveText(app.views[0]);
    // On desktop one header: ‹ Home and the app's name, the tabs, then Account.
    await expect(topBar(page)).toContainText(app.name);
    expect(await linkNames(topBar(page))).toEqual(["Home", "Account"]);
    const nav = tabBar(page, app.name);
    await expect(topBar(page).getByRole("navigation", { name: app.name, exact: true })).toBeVisible();
    await expect(nav.getByRole("button")).toHaveText([...app.views]);
    await expect(tab(page, app.name, app.views[0])).toHaveAttribute("aria-current", "page");
    // At the top as the page scrolls, its tabs keeping their widths.
    const box = (await nav.boundingBox())!;
    expect(box.y).toBe(0);
    expect(box.height).toBeLessThan(80);
    await page.mouse.wheel(0, 2000);
    expect((await nav.boundingBox())!.y).toBe(0);
    const widths = () =>
      nav.locator("li").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
    const before = await widths();
    // Survives only if the page is never reloaded.
    await page.evaluate(() => Object.assign(window, { sameDocument: true }));

    for (const view of [...app.views.slice(1), app.views[0]]) {
      await tab(page, app.name, view).click();
      await expect(viewHeading(page)).toHaveText(headingOf(view));
      await expect(tab(page, app.name, view)).toHaveAttribute("aria-current", "page");
      await expect(nav.locator("[aria-current]")).toHaveCount(1);
      await expect(page).toHaveURL(viewUrl(app, view));
      expect(await widths()).toEqual(before);
    }
    expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);

    // ‹ Home goes to /, which has no header or tab bar: the profile, with Account settings, and the folders.
    await homeLink(page).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Account settings", exact: true })).toHaveAttribute("href", "/account");
    await expect(main.getByRole("button", { name: "Log out" })).toHaveCount(0);
  }
});

test("back and forward move between views, and out of the app to home", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await openFromHome(page, "Shows");
  await expect(page).toHaveURL("/shows");
  await expect(viewHeading(page)).toHaveText("Library");

  await tab(page, "Shows", "Discover").click();
  await expect(viewHeading(page)).toHaveText("Discover");
  await followAccountMenu(page, "Account");
  await expect(page).toHaveURL("/account");

  // Back from Account, a page of its own, to the view it was opened on.
  await page.goBack();
  await expect(page).toHaveURL("/");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(tab(page, "Shows", "Discover")).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL("/shows/discover");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Library");
  await page.goForward();
  await expect(viewHeading(page)).toHaveText("Discover");

  // Out of the app, to home with the folder it was opened from still open, and back into it on the view it was left on.
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Library");
  await page.goBack();
  await expect(page).toHaveURL(/\/\?p=folder(%3A|:)trackers$/);
  await expect(page.getByRole("heading", { level: 1, name: user.name })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Trackers" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL("/shows");
  await expect(viewHeading(page)).toHaveText("Library");
  await page.goForward();
  await expect(viewHeading(page)).toHaveText("Discover");

  // Same after leaving with Switch app, in the account menu.
  await followAccountMenu(page, "Switch app");
  await expect(page).toHaveURL("/");
  await page.goBack();
  await expect(page).toHaveURL("/shows/discover");
  await expect(viewHeading(page)).toHaveText("Discover");
});

test("a reload keeps the view (it's in the URL), and back still works after it", async ({ page }) => {
  await openApp(page, "/books");
  await tab(page, "Books", "Discover").click();
  await tab(page, "Books", "Profile").click();
  await expect(viewHeading(page)).toHaveText("My profile");

  await page.reload();
  await expect(viewHeading(page)).toHaveText("My profile");
  await expect(tab(page, "Books", "Profile")).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(page).toHaveURL("/books/discover");
  // A view's URL opens it, and one that isn't a view is a 404.
  await page.goto("/books/profile");
  await expect(viewHeading(page)).toHaveText("My profile");
  expect((await page.goto("/books/watchlist"))!.status()).toBe(404);
});

test("back pressed while the page is still loading still goes to the previous view", async ({ page }) => {
  await openApp(page, "/shows");
  await tab(page, "Shows", "Discover").click();
  await tab(page, "Shows", "Library").click();
  await expect(viewHeading(page)).toHaveText("Library");

  // Holds the scripts, so back is pressed before the app can listen for it.
  let releaseScripts = () => {};
  const scriptsHeld = new Promise<void>((resolve) => (releaseScripts = resolve));
  const scripts = "**/_next/static/**/*.js";
  await page.route(scripts, async (route) => {
    await scriptsHeld;
    await route.continue();
  });
  await page.reload({ waitUntil: "commit" });
  // As rendered by the server, for its URL.
  await expect(viewHeading(page)).toHaveText("Library");
  await page.goBack({ waitUntil: "commit" });
  releaseScripts();

  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(tab(page, "Shows", "Discover")).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Library");
});

test("For Couples' apps and settings offer a group until there is one; leaving it, from its settings, offers one again", async ({
  page,
}) => {
  await signUp(page, newUser(), "/signup?next=%2Fcalendar");
  await expect(viewHeading(page)).toHaveText("For Couples");
  // No tabs yet: the top bar has ‹ Home, the app's name and Account.
  await expect(topBar(page)).toContainText("Calendar");
  expect(await linkNames(topBar(page))).toEqual(["Home", "Account"]);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  for (const [path, app] of [
    ["/tasks", "Tasks"],
    ["/recipes", "Recipes"],
  ]) {
    await page.goto(path);
    await expect(viewHeading(page)).toHaveText("For Couples");
    await expect(topBar(page)).toContainText(app);
    await expect(page.getByRole("navigation")).toHaveCount(0);
  }
  await page.goto("/couples");
  await expect(viewHeading(page)).toHaveText("For Couples");
  await page.getByRole("button", { name: "Create a group" }).click();
  await expect(viewHeading(page)).toHaveText("Group settings");
  // A group has no name to change.
  await expect(page.getByLabel("Space name")).toHaveCount(0);
  await page.goto("/tasks");
  await expect(viewHeading(page)).toHaveText("Tasks");

  await page.goto("/couples");
  // The last member: leaving deletes the group, so it asks first (no Undo).
  await page.getByRole("button", { name: "Leave the group", exact: true }).click();
  await page.getByRole("button", { name: "Leave and delete" }).click();
  await expect(viewHeading(page)).toHaveText("For Couples");

  // Back to the settings from another page shows them as they are now (useGroup checks the group once shown): none.
  await followAccountMenu(page, "Switch app");
  await expect(page).toHaveURL("/");
  await page.goBack();
  await expect(page).toHaveURL("/couples");
  await expect(viewHeading(page)).toHaveText("For Couples");
});

test("theme changes show on pages reached with the back button, and keep the view history", async ({ page }) => {
  await openApp(page, "/shows");
  const shell = page.locator("[data-theme]");
  await tab(page, "Shows", "Discover").click();
  await chooseTheme(page, "Dark");
  await expect(shell).toHaveAttribute("data-theme", "graphite");

  // Back in the app: in the new theme, on the view Account was opened from.
  await page.goBack();
  await expect(page).toHaveURL("/");
  await page.goBack();
  await expect(page).toHaveURL("/shows/discover");
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(shell).toHaveAttribute("data-theme", "graphite");

  // The same for a change in Account reached with forward.
  await page.goForward();
  await page.goForward();
  await expect(page).toHaveURL("/account");
  await saveTheme(page, "Light");
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
  await page.goBack();
  await expect(page).toHaveURL("/");
  await page.goBack();
  await expect(page).toHaveURL("/shows/discover");
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("at 320px, ‹ Home, the app's name and Account are in a top bar, and the tabs along the bottom (each its icon and name)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const user = { ...newUser(), username: `e2e_${Date.now()}abc` };
    await signUp(page, user, "/signup?next=%2Fshows");
    await expect(page).toHaveURL("/shows");
    expect((await page.request.post("/api/shared/spaces", { data: {} })).ok()).toBe(true);

    // The top bar: at the top of the screen, ‹ Home on the left, the app's name in the middle, Account on the right, each at least 44px to tap.
    async function expectTopBar(name: string) {
      const bar = (await topBar(page).boundingBox())!;
      expect(bar.y).toBe(0);
      const home = (await homeLink(page).boundingBox())!;
      const account = (await topBar(page).getByRole("link", { name: "Account", exact: true }).boundingBox())!;
      const title = (await topBar(page).getByText(name, { exact: true }).boundingBox())!;
      expect(home.x).toBeLessThan(title.x);
      expect(title.x + title.width).toBeLessThan(account.x);
      expect(Math.abs(title.x + title.width / 2 - 160)).toBeLessThanOrEqual(2);
      for (const box of [home, account]) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.y + box.height).toBeLessThanOrEqual(bar.y + bar.height);
      }
    }

    // One view: no tabs, so the view goes down to the bottom of the screen.
    for (const app of oneView) {
      await page.goto(app.path);
      await expect(viewHeading(page)).toHaveText(app.name);
      await expectTopBar(app.name);
      await expect(page.getByRole("navigation")).toHaveCount(0);
      await expectNoHorizontalScroll(page);
    }

    for (const app of appViews) {
      await page.goto(app.path);
      await expect(viewHeading(page)).toHaveText(app.views[0]);
      await expectTopBar(app.name);
      // The tabs at the bottom of the screen, side by side, each at least 44px to tap, with an icon.
      const bar = (await tabBar(page, app.name).boundingBox())!;
      expect(Math.abs(bar.y + bar.height - 740)).toBeLessThanOrEqual(1);
      for (const view of app.views) {
        await expect(tab(page, app.name, view)).toBeInViewport({ ratio: 1 });
        await expect(tab(page, app.name, view).locator("svg")).toHaveCount(1);
        const box = (await tab(page, app.name, view).boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      // The view's end isn't under them.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const main = (await page.getByRole("main").boundingBox())!;
      expect(main.y + main.height).toBeLessThanOrEqual(bar.y + bar.height + 1);
      const next = app.views[1] ?? app.views[0];
      await tab(page, app.name, next).click();
      await expect(viewHeading(page)).toHaveText(next);
      await expectNoHorizontalScroll(page);
      // Only the app's own views along the bottom: ‹ Home and Account are at the top.
      await expect(tabBar(page, app.name).getByRole("link")).toHaveCount(0);
      await expect(homeLink(page)).toBeInViewport();
    }
  });
});

test.describe("panels", () => {
  // A test page (app/test/app-shell) whose views open panels, as the real
  // apps' views will.
  const panel = (page: Page, name: string) => page.getByRole("dialog", { name });

  test("back closes open panels one at a time, and forward reopens them", async ({ page }) => {
    await page.goto("/test/app-shell");
    await expect(viewHeading(page)).toHaveText("One");

    await page.getByRole("button", { name: "Open panel" }).click();
    await panel(page, "First panel").getByRole("button", { name: "Open second panel" }).click();
    await expect(panel(page, "First panel")).toBeVisible();
    await expect(panel(page, "Second panel")).toBeVisible();

    await page.goBack();
    await expect(panel(page, "Second panel")).toBeHidden();
    await expect(panel(page, "First panel")).toBeVisible();
    await page.goBack();
    await expect(panel(page, "First panel")).toBeHidden();
    await expect(viewHeading(page)).toHaveText("One");
    await expect(page).toHaveURL("/test/app-shell");

    await page.goForward();
    await expect(panel(page, "First panel")).toBeVisible();
  });

  test("a panel's close button goes back, once however often it's clicked", async ({ page }) => {
    await page.goto("/test/app-shell");
    await tab(page, "Test", "Two").click();
    await page.getByRole("button", { name: "Open panel" }).click();
    await panel(page, "First panel").getByRole("button", { name: "Open second panel" }).click();

    await panel(page, "Second panel").getByRole("button", { name: "Close" }).dblclick();
    await expect(panel(page, "Second panel")).toBeHidden();
    await expect(panel(page, "First panel")).toBeVisible();
    await panel(page, "First panel").getByRole("button", { name: "Close" }).click();
    await expect(panel(page, "First panel")).toBeHidden();
    await expect(viewHeading(page)).toHaveText("Two");

    // The panels' entries are behind the current one, so back goes to the view before.
    await page.goBack();
    await expect(viewHeading(page)).toHaveText("One");
  });

  test("changing view with a panel open replaces the panel's history entry", async ({ page }) => {
    await page.goto("/test/app-shell");
    await page.getByRole("button", { name: "Open panel" }).click();
    await panel(page, "First panel").getByRole("button", { name: "Go to Three" }).click();
    await expect(viewHeading(page)).toHaveText("Three");
    await expect(panel(page, "First panel")).toBeHidden();

    await page.goBack();
    await expect(viewHeading(page)).toHaveText("One");
    await expect(panel(page, "First panel")).toBeHidden();
  });

  test("history entries keep their view after a router refresh", async ({ page }) => {
    await page.goto("/test/app-shell");
    await tab(page, "Test", "Two").click();
    await expect(viewHeading(page)).toHaveText("Two");
    // Next.js replaces the current entry's history state when it refreshes.
    const refreshed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.startsWith("/test/app-shell") && response.request().headers()["rsc"] === "1",
    );
    await page.getByRole("button", { name: "Refresh" }).click();
    await refreshed;
    await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();

    await page.goBack();
    await expect(viewHeading(page)).toHaveText("One");
    await page.goForward();
    await expect(viewHeading(page)).toHaveText("Two");
  });

  test("panels are in the URL: one opens with its link, and closing it stays in the app", async ({ page }) => {
    await page.goto("/test/app-shell/two?p=first");
    await expect(viewHeading(page)).toHaveText("Two");
    await expect(panel(page, "First panel")).toBeVisible();
    await panel(page, "First panel").getByRole("button", { name: "Open second panel" }).click();
    await expect(page).toHaveURL("/test/app-shell/two?p=first&p=second");
    await page.reload();
    await expect(panel(page, "Second panel")).toBeVisible();
    // Opened by the link, not here: closing it doesn't go back out of the app.
    await panel(page, "Second panel").getByRole("button", { name: "Close" }).click();
    await panel(page, "First panel").getByRole("button", { name: "Close" }).click();
    await expect(panel(page, "First panel")).toBeHidden();
    await expect(page).toHaveURL("/test/app-shell/two");
    await expect(viewHeading(page)).toHaveText("Two");
  });
});
