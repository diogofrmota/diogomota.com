import { type Page } from "@playwright/test";
import { accountButton, accountMenuItems, appsMenuItems, expect, followAccountMenu, newUser, saveTheme, signUp, test } from "./fixtures";

// The tabs. Shared's settings are one of them; Shows has none.
const appViews = [
  { path: "/shared", name: "Shared", views: ["Calendar", "Tasks", "Settings"] },
  { path: "/shows", name: "Shows", views: ["Watchlist", "Discover", "Profile"] },
] as const;

/** The app's tabs, in the middle of the top bar at every width. */
const tabBar = (page: Page, app: string) => page.getByRole("navigation", { name: app, exact: true });
const tab = (page: Page, app: string, view: string) =>
  tabBar(page, app).getByRole("button", { name: view, exact: true });
/** The heading of the view that is showing (hidden views are out of the accessibility tree). */
const viewHeading = (page: Page) => page.getByRole("main").getByRole("heading", { level: 1 });

async function openApp(page: Page, path: string) {
  const user = newUser();
  await signUp(page, user, `/signup?${new URLSearchParams({ next: path })}`);
  await expect(page).toHaveURL(path);
  if (path === "/shared") {
    await page.getByRole("button", { name: "Create space" }).click();
    await expect(viewHeading(page)).toHaveText("Calendar");
  }
  return user;
}

/** Saves a theme in Account (/account), opened from the account menu. */
async function chooseTheme(page: Page, theme: "Graphite" | "Neutral") {
  await followAccountMenu(page, "Account");
  await expect(page).toHaveURL("/account");
  await saveTheme(page, theme);
}

/** Reloads, and returns the page's HTML as the server sent it, before any script ran. */
async function reloadHtml(page: Page) {
  const response = await page.reload();
  return response!.text();
}

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

for (const app of appViews) {
  test(`${app.name}: the tabs switch views and the URL stays ${app.path}`, async ({ page }) => {
    await openApp(page, app.path);
    await expect(page).toHaveTitle(`${app.name} · diogo mota`);
    await expect(viewHeading(page)).toHaveText(app.views[0]);
    await expect(tab(page, app.name, app.views[0])).toHaveAttribute("aria-current", "page");
    await expect(tabBar(page, app.name).getByRole("button")).toHaveCount(app.views.length);
    // Survives only if the page is never reloaded.
    await page.evaluate(() => Object.assign(window, { sameDocument: true }));

    for (const view of [...app.views.slice(1), app.views[0]]) {
      await tab(page, app.name, view).click();
      await expect(viewHeading(page)).toHaveText(view);
      await expect(tab(page, app.name, view)).toHaveAttribute("aria-current", "page");
      await expect(tabBar(page, app.name).locator("[aria-current]")).toHaveCount(1);
      await expect(page).toHaveURL(app.path);
    }
    expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);
  });
}

test("back and forward move between views, and out of the app to /apps", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  expect((await page.request.post("/api/shared/spaces", { data: {} })).ok()).toBe(true);
  await page.getByRole("main").getByRole("link", { name: "Shared", exact: true }).click();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Calendar");

  await tab(page, "Shared", "Tasks").click();
  await expect(viewHeading(page)).toHaveText("Tasks");
  await followAccountMenu(page, "Account");
  await expect(page).toHaveURL("/account");

  // Back from Account, a page of its own, to the view it was opened on.
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Tasks");
  await expect(tab(page, "Shared", "Tasks")).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL("/shared");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Calendar");
  await page.goForward();
  await expect(viewHeading(page)).toHaveText("Tasks");

  // Out of the app, and back into it on the view it was left on.
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Calendar");
  await page.goBack();
  await expect(page).toHaveURL("/apps");
  await expect(page.getByRole("heading", { level: 1, name: /^Apps/ })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Calendar");
  await page.goForward();
  await expect(viewHeading(page)).toHaveText("Tasks");

  // Same after leaving with Switch app, in the account menu.
  await followAccountMenu(page, "Switch app");
  await expect(page).toHaveURL("/apps");
  await page.goBack();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Tasks");
});

test("a reload starts on the default view, and back still works after it", async ({ page }) => {
  await openApp(page, "/shows");
  await tab(page, "Shows", "Discover").click();
  await tab(page, "Shows", "Profile").click();
  await expect(viewHeading(page)).toHaveText("Profile");

  await page.reload();
  await expect(viewHeading(page)).toHaveText("Watchlist");
  await expect(tab(page, "Shows", "Watchlist")).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(page).toHaveURL("/shows");
});

test("back pressed while the page is still loading still goes to the previous view", async ({ page }) => {
  await openApp(page, "/shows");
  await tab(page, "Shows", "Discover").click();
  await tab(page, "Shows", "Profile").click();
  await expect(viewHeading(page)).toHaveText("Profile");

  // Holds the scripts, so back is pressed before the app can listen for it.
  let releaseScripts = () => {};
  const scriptsHeld = new Promise<void>((resolve) => (releaseScripts = resolve));
  const scripts = "**/_next/static/**/*.js";
  await page.route(scripts, async (route) => {
    await scriptsHeld;
    await route.continue();
  });
  await page.reload({ waitUntil: "commit" });
  // As rendered by the server.
  await expect(viewHeading(page)).toHaveText("Watchlist");
  await page.goBack({ waitUntil: "commit" });
  releaseScripts();

  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(tab(page, "Shows", "Discover")).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Watchlist");
});

test("Switch app, in the account menu, goes to /apps, the way to the other app and to the site; /apps itself has no Switch app", async ({ page }) => {
  const user = await openApp(page, "/shared");
  await accountButton(page, user.username).click();
  await expect(page.getByRole("link", { name: "Account", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Account", exact: true })).toBeHidden();

  await followAccountMenu(page, "Switch app");
  await expect(page).toHaveURL("/apps");
  // Not on /apps itself, where the apps already are.
  await accountButton(page, user.username).click();
  const menu = page.getByRole("navigation", { name: "Account" }).getByRole("list");
  await expect(menu.getByRole("listitem")).toHaveText(appsMenuItems);
  await expect(menu.getByRole("link", { name: "Switch app" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("main").getByRole("link", { name: "Shows", exact: true }).click();
  await expect(page).toHaveURL("/shows");
  await expect(viewHeading(page)).toHaveText("Watchlist");
  await followAccountMenu(page, "Switch app");
  await page.getByRole("main").getByRole("link", { name: "Shared", exact: true }).click();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Calendar");

  // diogomota.com is on /apps, not in the apps.
  await expect(page.getByRole("banner").getByRole("link", { name: "diogomota.com" })).toHaveCount(0);
  await followAccountMenu(page, "Switch app");
  await page.getByRole("banner").getByRole("link", { name: "diogomota.com", exact: true }).click();
  await expect(page).toHaveURL("/");
});

test("the top bar: in an app, its tabs in the middle and the account menu; elsewhere, diogomota.com and the account menu", async ({ page }) => {
  const user = await openApp(page, "/shared");
  const header = page.getByRole("banner");
  const account = accountButton(page, user.username);
  for (const app of appViews) {
    await page.goto(app.path);
    // Nothing but the tabs and the account menu: no diogomota.com, no apps, no search.
    await expect(header.getByRole("link")).toHaveCount(0);
    await expect(header.getByRole("navigation")).toHaveCount(2);
    await expect(header.getByRole("button")).toHaveCount(app.views.length + 1);
    // By name: each label's text is there twice (NavLabel's hidden bold copy).
    for (const [i, view] of app.views.entries()) await expect(tabBar(page, app.name).getByRole("button").nth(i)).toHaveAccessibleName(view);
    // The tabs in the middle of the bar, the account menu on the right.
    const tabs = (await tabBar(page, app.name).boundingBox())!;
    const bar = (await header.boundingBox())!;
    const menu = (await account.boundingBox())!;
    expect(Math.abs(tabs.x + tabs.width / 2 - (bar.x + bar.width / 2))).toBeLessThanOrEqual(1);
    expect(tabs.x + tabs.width).toBeLessThanOrEqual(menu.x);
    expect(menu.x + menu.width).toBeGreaterThan(bar.x + bar.width - 32);
    // The view has the whole width.
    const main = (await page.getByRole("main").boundingBox())!;
    expect(main.x).toBe(0);
    expect(main.width).toBe(bar.width);

    // NavLabel's visible text (its first span; the second is the hidden bold copy).
    const text = (view: string) => tab(page, app.name, view).locator("span > span").first();
    const widths = async () => Promise.all(app.views.map((view) => tab(page, app.name, view).evaluate((el) => el.getBoundingClientRect().width)));
    const before = await widths();
    for (const current of [app.views[1], app.views[0]]) {
      await tab(page, app.name, current).click();
      for (const view of app.views) {
        await expect(text(view)).toHaveCSS("font-weight", view === current ? "600" : "400");
        await expect(text(view)).toHaveCSS("text-decoration-line", view === current ? "underline" : "none");
      }
      // Bold or not, each tab keeps its width, so nothing in the bar moves.
      expect(await widths()).toEqual(before);
    }
  }

  for (const path of ["/apps", "/account"]) {
    await page.goto(path);
    await expect(header.getByRole("link")).toHaveCount(1);
    await expect(header.getByRole("link", { name: "diogomota.com", exact: true })).toHaveAttribute("href", "/");
    await expect(header.getByRole("navigation")).toHaveCount(1);
    await expect(account).toBeVisible();
    // The theme is chosen in Account, not in the top bar.
    await expect(header.getByRole("button", { name: /theme/i })).toHaveCount(0);
  }
});

test("the account menu: a button that shows it opens, with Account, Switch app and Log out, each with an icon; no Settings", async ({ page }) => {
  const user = await openApp(page, "/shows");
  const button = accountButton(page, user.username);
  // The username's initial and a chevron, both hidden: the button is named by the username alone.
  await expect(button).toContainText(user.username);
  await expect(button.locator('[aria-hidden="true"]')).toHaveCount(2);
  // Looks like a button: bordered all round.
  await expect(button.locator("span").first()).toHaveCSS("border-top-style", "solid");
  await expect(button).toHaveAttribute("aria-expanded", "false");

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("navigation", { name: "Account" }).getByRole("list");
  await expect(menu.getByRole("listitem")).toHaveText(accountMenuItems);
  for (const item of await menu.getByRole("listitem").all()) await expect(item.locator("svg")).toHaveCount(1);
  await expect(menu.getByRole("link", { name: "Account", exact: true })).toHaveAttribute("href", "/account");
  await expect(menu.getByRole("link", { name: "Switch app" })).toHaveAttribute("href", "/apps");
  await expect(menu.getByRole("link", { name: "Settings" })).toHaveCount(0);

  // There is no Settings page: Shared's settings are its Settings tab, and the theme is in Account.
  expect((await page.goto("/settings"))!.status()).toBe(404);
});

test("Shared's Settings tab: only once there is a space, and leaving there goes back to creating or joining one", async ({ page }) => {
  // The space's changes are API calls; a server action then makes the pages the
  // browser kept for Back render again (app/shared/actions.ts). Its response
  // comes once that's done.
  const refreshed = () => page.waitForResponse((response) =>
    response.request().method() === "POST" && "next-action" in response.request().headers());
  await signUp(page, newUser(), "/signup?next=%2Fshared");
  await expect(viewHeading(page)).toHaveText("Start your shared space");
  // No tabs yet: the top bar has only the account menu.
  await expect(page.getByRole("banner").getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("banner").getByRole("link")).toHaveCount(0);
  let done = refreshed();
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(viewHeading(page)).toHaveText("Calendar");
  await done;

  await tab(page, "Shared", "Settings").click();
  await expect(viewHeading(page)).toHaveText("Settings");
  // A space has no name to change: Tasks is titled Tasks.
  await expect(page.getByLabel("Space name")).toHaveCount(0);
  await tab(page, "Shared", "Tasks").click();
  await expect(viewHeading(page)).toHaveText("Tasks");

  await tab(page, "Shared", "Settings").click();
  await page.getByRole("button", { name: "Leave space", exact: true }).click();
  done = refreshed();
  await page.getByRole("button", { name: "Confirm leave" }).click();
  await expect(viewHeading(page)).toHaveText("Start your shared space");
  await expect(tabBar(page, "Shared")).toHaveCount(0);
  await done;

  // Back to /shared from another page shows it as it is now: no space.
  await followAccountMenu(page, "Switch app");
  await expect(page).toHaveURL("/apps");
  await page.goBack();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Start your shared space");
});

test("the theme saved in Account is in the page as served, in the apps and the pages around them", async ({ page }) => {
  await openApp(page, "/shows");
  const shell = page.locator("[data-theme]");
  const themeColor = page.locator('meta[name="theme-color"]');
  // New accounts start in Light mode.
  await expect(shell).toHaveAttribute("data-theme", "light-2");
  await expect(shell).toHaveCSS("background-color", "rgb(241, 245, 249)");

  await chooseTheme(page, "Graphite");
  await expect(shell).toHaveAttribute("data-theme", "graphite");
  await expect(shell).toHaveCSS("background-color", "rgb(31, 32, 35)");
  await expect(themeColor).toHaveAttribute("content", "#1f2023");

  // The server renders the saved theme into the HTML, so it applies before any
  // script runs (no flash of the other theme on load). The same preference
  // everywhere: both apps, /apps and Account.
  for (const path of ["/shows", "/shared", "/apps", "/account"]) {
    await page.goto(path);
    expect(await reloadHtml(page)).toContain('data-theme="graphite"');
    await expect(shell).toHaveAttribute("data-theme", "graphite");
    await expect(page.locator("html")).toHaveCSS("background-color", "rgb(31, 32, 35)");
    await expect(themeColor).toHaveAttribute("content", "#1f2023");
  }

  await page.goto("/shows");
  await chooseTheme(page, "Neutral");
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
  await page.goto("/shows");
  expect(await reloadHtml(page)).toContain('data-theme="minimal-neutrals"');
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
  await expect(shell).toHaveCSS("background-color", "rgb(230, 230, 230)");
  await expect(themeColor).toHaveAttribute("content", "#e6e6e6");
});

test("theme changes show on pages reached with the back button, and keep the view history", async ({
  page,
}) => {
  await openApp(page, "/shows");
  const shell = page.locator("[data-theme]");
  await tab(page, "Shows", "Discover").click();
  await chooseTheme(page, "Graphite");
  await expect(shell).toHaveAttribute("data-theme", "graphite");

  // Back in the app: in the new theme, on the view Account was opened from.
  await page.goBack();
  await expect(page).toHaveURL("/shows");
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(shell).toHaveAttribute("data-theme", "graphite");

  // The same for a change in Account reached with forward.
  await page.goForward();
  await expect(page).toHaveURL("/account");
  await saveTheme(page, "Neutral");
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
  await page.goBack();
  await expect(page).toHaveURL("/shows");
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("at 320px, the top bar still fits, the tabs whole and the username cut off if need be", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const user = { ...newUser(), username: `e2e_${Date.now()}abc` };
    await signUp(page, user, "/signup?next=%2Fshows");
    await expect(page).toHaveURL("/shows");
    expect((await page.request.post("/api/shared/spaces", { data: {} })).ok()).toBe(true);
    const account = accountButton(page, user.username);
    for (const app of appViews) {
      await page.goto(app.path);
      await expect(viewHeading(page)).toHaveText(app.views[0]);
      await expect(account).toBeInViewport({ ratio: 1 });
      for (const view of app.views) await expect(tab(page, app.name, view)).toBeInViewport({ ratio: 1 });
      const tabs = (await tabBar(page, app.name).boundingBox())!;
      expect(Math.abs(tabs.x + tabs.width / 2 - 160)).toBeLessThanOrEqual(1);
      // Side by side, not over one another, and each at least 44px wide to tap.
      const last = (await tab(page, app.name, app.views.at(-1)!).boundingBox())!;
      expect(last.x + last.width).toBeLessThanOrEqual((await account.boundingBox())!.x);
      for (const view of app.views) expect((await tab(page, app.name, view).boundingBox())!.width).toBeGreaterThanOrEqual(44);
      expect((await account.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalScroll(page);
      await account.click();
      for (const name of ["Account", "Switch app"]) await expect(page.getByRole("link", { name, exact: true })).toBeInViewport({ ratio: 1 });
      await expectNoHorizontalScroll(page);
      await page.keyboard.press("Escape");
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
        new URL(response.url()).pathname === "/test/app-shell" && response.request().headers()["rsc"] === "1",
    );
    await page.getByRole("button", { name: "Refresh" }).click();
    await refreshed;
    await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();

    await page.goBack();
    await expect(viewHeading(page)).toHaveText("One");
    await page.goForward();
    await expect(viewHeading(page)).toHaveText("Two");
  });
});
