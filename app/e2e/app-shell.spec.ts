import { type Page } from "@playwright/test";
import { expect, followAccountMenu, newUser, saveTheme, signUp, test } from "./fixtures";

// The tabs. Shared's settings are one of them; Shows has none.
const appViews = [
  { path: "/shared", name: "Shared", views: ["Calendar", "Tasks", "Settings"] },
  { path: "/shows", name: "Shows", views: ["Library", "Discover", "Profile"] },
] as const;

/** A view's URL: the app's own path for its first view, the view under it for the others. */
const viewUrl = (app: (typeof appViews)[number], view: string) =>
  view === app.views[0] ? app.path : `${app.path}/${view.toLowerCase()}`;

/** The app's tabs: in the middle of the top bar on a wide screen, along the bottom on a phone. */
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
async function chooseTheme(page: Page, theme: "Dark" | "Light") {
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
  test(`${app.name}: the tabs switch views, each at its own URL under ${app.path}, without loading a page`, async ({
    page,
  }) => {
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
      await expect(page).toHaveURL(viewUrl(app, view));
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
  await expect(page).toHaveURL("/apps");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Tasks");
  await expect(tab(page, "Shared", "Tasks")).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL("/shared/tasks");
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
  await expect(page).toHaveURL("/shared/tasks");
  await expect(viewHeading(page)).toHaveText("Tasks");
});

test("a reload keeps the view (it's in the URL), and back still works after it", async ({ page }) => {
  await openApp(page, "/shows");
  await tab(page, "Shows", "Discover").click();
  await tab(page, "Shows", "Profile").click();
  await expect(viewHeading(page)).toHaveText("Profile");

  await page.reload();
  await expect(viewHeading(page)).toHaveText("Profile");
  await expect(tab(page, "Shows", "Profile")).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(page).toHaveURL("/shows/discover");
  // A view's URL opens it, and one that isn't a view is a 404.
  await page.goto("/shows/profile");
  await expect(viewHeading(page)).toHaveText("Profile");
  expect((await page.goto("/shows/watchlist"))!.status()).toBe(404);
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
  // As rendered by the server, for its URL.
  await expect(viewHeading(page)).toHaveText("Profile");
  await page.goBack({ waitUntil: "commit" });
  releaseScripts();

  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(tab(page, "Shows", "Discover")).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Library");
});

test("Apps returns to the launcher; its tab bar has Account and Apps", async ({ page }) => {
  await openApp(page, "/shared");
  for (const app of appViews) {
    await page.goto(app.path);
    await expect(page.getByRole("banner")).toHaveCount(0);
    const navigation = tabBar(page, app.name);
    await expect(navigation.getByRole("button")).toHaveText([...app.views]);
    await navigation.getByRole("link", { name: "Apps", exact: true }).click();
    await expect(page).toHaveURL("/apps");
    await expect(page.getByRole("banner")).toHaveCount(0);
    const account = page.getByRole("navigation", { name: "Account", exact: true });
    await expect(account.getByRole("link", { name: "Account", exact: true })).toHaveAttribute("href", "/account");
    await expect(account.getByRole("link", { name: "Apps", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(account.getByRole("button", { name: "Log out" })).toHaveCount(0);
  }
});

test("on desktop the tab bar is the header, at the top as the page scrolls, its tabs keeping their widths", async ({
  page,
}) => {
  await openApp(page, "/shared");
  for (const app of appViews) {
    await page.goto(app.path);
    const nav = tabBar(page, app.name);
    const box = (await nav.boundingBox())!;
    expect(box.y).toBe(0);
    expect(box.height).toBeLessThan(80);
    await page.mouse.wheel(0, 2000);
    expect((await nav.boundingBox())!.y).toBe(0);
    const before = await nav
      .locator("li")
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
    await tab(page, app.name, app.views[1]).click();
    const after = await nav
      .locator("li")
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
    expect(after).toEqual(before);
    await expect(tab(page, app.name, app.views[1])).toHaveAttribute("aria-current", "page");
  }
});

test("Shared's Settings tab: only once there is a space, and leaving there goes back to creating or joining one", async ({
  page,
}) => {
  await signUp(page, newUser(), "/signup?next=%2Fshared");
  await expect(viewHeading(page)).toHaveText("Your shared calendar");
  // No tabs yet: the top bar has only the account menu.
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("banner").getByRole("link")).toHaveCount(0);
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(viewHeading(page)).toHaveText("Calendar");

  await tab(page, "Shared", "Settings").click();
  await expect(viewHeading(page)).toHaveText("Settings");
  // A space has no name to change: Tasks is titled Tasks.
  await expect(page.getByLabel("Space name")).toHaveCount(0);
  await tab(page, "Shared", "Tasks").click();
  await expect(viewHeading(page)).toHaveText("Tasks");

  await tab(page, "Shared", "Settings").click();
  // The last member: leaving deletes the space, so it asks first (no Undo).
  await page.getByRole("button", { name: "Leave this group", exact: true }).click();
  await page.getByRole("button", { name: "Leave and delete" }).click();
  await expect(viewHeading(page)).toHaveText("Your shared calendar");
  await expect(tabBar(page, "Shared").getByRole("button")).toHaveCount(0);

  // Back to /shared from another page shows it as it is now (SharedApp checks its space once shown): no space.
  await followAccountMenu(page, "Switch app");
  await expect(page).toHaveURL("/apps");
  await page.goBack();
  await expect(page).toHaveURL(/\/shared/);
  await expect(viewHeading(page)).toHaveText("Your shared calendar");
});

test("the theme saved in Account is in the page as served, in the apps and the pages around them", async ({ page }) => {
  await openApp(page, "/shows");
  const shell = page.locator("[data-theme]");
  const themeColor = page.locator('meta[name="theme-color"]');
  // New accounts start in Light.
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
  await expect(shell).toHaveCSS("background-color", "rgb(230, 230, 230)");

  await chooseTheme(page, "Dark");
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
  await chooseTheme(page, "Light");
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
  await page.goto("/shows");
  expect(await reloadHtml(page)).toContain('data-theme="minimal-neutrals"');
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
  await expect(shell).toHaveCSS("background-color", "rgb(230, 230, 230)");
  await expect(themeColor).toHaveAttribute("content", "#e6e6e6");
});

test("theme changes show on pages reached with the back button, and keep the view history", async ({ page }) => {
  await openApp(page, "/shows");
  const shell = page.locator("[data-theme]");
  await tab(page, "Shows", "Discover").click();
  await chooseTheme(page, "Dark");
  await expect(shell).toHaveAttribute("data-theme", "graphite");

  // Back in the app: in the new theme, on the view Account was opened from.
  await page.goBack();
  await expect(page).toHaveURL("/apps");
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
  await expect(page).toHaveURL("/apps");
  await page.goBack();
  await expect(page).toHaveURL("/shows/discover");
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("at 320px, the tabs are along the bottom (each its icon and name), with an Apps link and no top bar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const user = { ...newUser(), username: `e2e_${Date.now()}abc` };
    await signUp(page, user, "/signup?next=%2Fshows");
    await expect(page).toHaveURL("/shows");
    expect((await page.request.post("/api/shared/spaces", { data: {} })).ok()).toBe(true);

    for (const app of appViews) {
      await page.goto(app.path);
      await expect(viewHeading(page)).toHaveText(app.views[0]);

      // The app's name in the top bar (the tabs say it to screen readers).
      await expect(page.getByRole("banner")).toHaveCount(0);
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
      await tab(page, app.name, app.views[1]).click();
      await expect(viewHeading(page)).toHaveText(app.views[1]);
      await expectNoHorizontalScroll(page);
      await expect(tabBar(page, app.name).getByRole("link", { name: "Apps", exact: true })).toBeInViewport();
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
