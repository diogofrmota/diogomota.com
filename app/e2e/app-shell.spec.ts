import { type Page } from "@playwright/test";
import { accountButton, expect, newUser, signUp, test } from "./fixtures";

const appViews = [
  { path: "/shared", name: "Shared", views: ["Calendar", "Tasks", "Settings"] },
  { path: "/shows", name: "Shows", views: ["Home", "Discover", "Profile"] },
] as const;

/** The app's tabs that are showing: the sidebar on desktop, the bottom bar on mobile. */
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
    await page.getByLabel("Space name").fill("Shell test space");
    await page.getByRole("button", { name: "Create a Space" }).click();
    await expect(viewHeading(page)).toHaveText("Calendar");
  }
  return user;
}

/**
 * Clicks the theme toggle and waits for the response of the server action that
 * saves it, which starts once the action has run (its headers say whether it
 * revalidated). The body streams on with the re-rendered page.
 */
async function toggleTheme(page: Page) {
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && "next-action" in response.request().headers(),
  );
  await page.getByRole("button", { name: "Dark theme" }).click();
  expect((await saved).headers()["x-action-revalidated"]).toBeTruthy();
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
  expect((await page.request.post("/api/shared/spaces", { data: { name: "History space" } })).ok()).toBe(true);
  await page.getByRole("link", { name: "Shared", exact: true }).click();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Calendar");

  await tab(page, "Shared", "Tasks").click();
  await expect(viewHeading(page)).toHaveText("Tasks");
  await tab(page, "Shared", "Settings").click();
  await expect(viewHeading(page)).toHaveText("Settings");

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
  await expect(page.getByRole("heading", { level: 1, name: /^apps/ })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Calendar");
  await page.goForward();
  await expect(viewHeading(page)).toHaveText("Tasks");

  // Same after leaving with the top bar's link.
  await page.getByRole("link", { name: "Back to Apps" }).click();
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
  await expect(viewHeading(page)).toHaveText("Home");
  await expect(tab(page, "Shows", "Home")).toHaveAttribute("aria-current", "page");
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
  await expect(viewHeading(page)).toHaveText("Home");
  await page.goBack({ waitUntil: "commit" });
  releaseScripts();

  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(tab(page, "Shows", "Discover")).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Home");
});

test("the top bar links back to /apps and has the account menu", async ({ page }) => {
  const user = await openApp(page, "/shared");
  await accountButton(page, user.username).click();
  await expect(page.getByRole("link", { name: "Account", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Account", exact: true })).toBeHidden();

  await page.getByRole("link", { name: "Back to Apps" }).click();
  await expect(page).toHaveURL("/apps");
  await expect(accountButton(page, user.username)).toBeVisible();
});

for (const app of appViews) {
  test(`${app.name}: the account menu opens app settings with working history`, async ({ page }) => {
    const user = await openApp(page, app.path);
    await accountButton(page, user.username).click();
    const menu = page.getByRole("navigation", { name: "Account" }).getByRole("list");
    await expect(menu.getByRole("listitem")).toHaveText(["Account", `${app.name} Settings`, "Logout"]);
    await menu.getByRole("button", { name: `${app.name} Settings` }).click();
    await expect(menu).toBeHidden();
    await expect(accountButton(page, user.username)).toBeFocused();
    await expect(viewHeading(page)).toHaveText(app.name === "Shared" ? "Settings" : "Shows Settings");
    await expect(page).toHaveURL(app.path);
    if (app.name === "Shared") {
      await expect(page.getByLabel("Space name")).toHaveValue("Shell test space");
    } else {
      const saved = page.waitForResponse(response => response.request().method() === "POST" && "next-action" in response.request().headers());
      await page.getByRole("radio", { name: "Light", exact: true }).check();
      expect((await saved).headers()["x-action-revalidated"]).toBeTruthy();
      await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "light");
    }
    await page.goBack();
    await expect(viewHeading(page)).toHaveText(app.views[0]);
    await page.goForward();
    await expect(viewHeading(page)).toHaveText(app.name === "Shared" ? "Settings" : "Shows Settings");
  });
}

test("Shared settings are available before creating a space", async ({ page }) => {
  const user = newUser();
  await signUp(page, user, "/signup?next=%2Fshared");
  await expect(viewHeading(page)).toHaveText("Your shared space");
  await accountButton(page, user.username).click();
  await page.getByRole("button", { name: "Shared Settings" }).click();
  await expect(viewHeading(page)).toHaveText("Shared Settings");
  await page.getByRole("button", { name: "Back to Shared" }).click();
  await expect(viewHeading(page)).toHaveText("Your shared space");
});

test("Apps, Shared and Shows share header sizing and fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/apps");
  await expectNoHorizontalScroll(page);
  const user = { ...newUser(), username: `e2e_${Date.now()}abc` };
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  let reference: unknown;
  for (const path of ["/apps", "/shared", "/shows"]) {
    await page.goto(path);
    const header = page.getByRole("banner");
    await expect(header).toBeVisible();
    const format = await header.evaluate(element => {
      const style = getComputedStyle(element);
      return { height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width,
        font: style.fontFamily, padding: style.padding, position: style.position };
    });
    if (reference) expect(format).toEqual(reference);
    else reference = format;
    await accountButton(page, user.username).click();
    await expect(header.getByRole("link", { name: "Account", exact: true })).toBeInViewport({ ratio: 1 });
    if (path === "/apps") await expect(header.getByRole("listitem")).toHaveText(["Account", "Logout"]);
    else await expect(header.getByRole("button", { name: `${path === "/shared" ? "Shared" : "Shows"} Settings` })).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);
  }
});

test("the theme toggle saves to the account, and the saved theme is in the page as served", async ({
  page,
}) => {
  await openApp(page, "/shared");
  const shell = page.locator("[data-theme]");
  const toggle = page.getByRole("button", { name: "Dark theme" });
  const themeColor = page.locator('meta[name="theme-color"]');
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(shell).toHaveCSS("background-color", "rgb(10, 10, 10)");

  await toggleTheme(page);
  await expect(shell).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(shell).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(themeColor).toHaveAttribute("content", "#ffffff");

  // The server renders the saved theme into the HTML, so it applies before any
  // script runs (no flash of the other theme on load).
  expect(await reloadHtml(page)).toContain('data-theme="light"');
  await expect(shell).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(themeColor).toHaveAttribute("content", "#ffffff");

  // The same preference everywhere: the other app and account settings.
  await page.goto("/shows");
  await expect(shell).toHaveAttribute("data-theme", "light");
  await page.goto("/account");
  await page.getByRole("heading", { name: "Theme", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();

  await page.goto("/shows");
  await toggleTheme(page);
  await expect(shell).toHaveAttribute("data-theme", "dark");
  expect(await reloadHtml(page)).toContain('data-theme="dark"');
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await expect(shell).toHaveCSS("background-color", "rgb(10, 10, 10)");
  await expect(themeColor).toHaveAttribute("content", "#0a0a0a");
});

test("theme changes show on pages reached with the back button, and keep the view history", async ({
  page,
}) => {
  const user = await openApp(page, "/shared");
  const shell = page.locator("[data-theme]");
  await tab(page, "Shared", "Tasks").click();
  await toggleTheme(page);
  await expect(shell).toHaveAttribute("data-theme", "light");

  // Saving re-renders the page, after which Next.js replaces the history
  // entry's state: back and forward still know the views.
  await page.goBack();
  await expect(viewHeading(page)).toHaveText("Calendar");
  await page.goForward();
  await expect(viewHeading(page)).toHaveText("Tasks");

  await page.getByRole("link", { name: "Back to Apps" }).click();
  await expect(page).toHaveURL("/apps");
  await page.goBack();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Tasks");
  await expect(shell).toHaveAttribute("data-theme", "light");

  // The same for a change in account settings.
  await accountButton(page, user.username).click();
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL("/account");
  await page.getByRole("heading", { name: "Theme", exact: true }).click();
  await page.getByRole("radio", { name: "Dark" }).check();
  await page.getByRole("button", { name: "Save theme" }).click();
  await expect(page.getByRole("region", { name: "Theme" }).getByRole("status")).toHaveText("Theme saved.");
  await page.goBack();
  await expect(page).toHaveURL("/shared");
  await expect(shell).toHaveAttribute("data-theme", "dark");
});

test.describe("at 375px wide", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("the tabs are a bar along the bottom", async ({ page }) => {
    const user = await openApp(page, "/shared");
    const nav = tabBar(page, "Shared");
    await expect(nav).toBeVisible();
    // The sidebar is in the page but not shown.
    await expect(page.locator('nav[aria-label="Shared"]')).toHaveCount(2);
    await expect(page.locator('nav[aria-label="Shared"]:visible')).toHaveCount(1);

    const box = (await nav.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBe(375);
    expect(box.y + box.height).toBeCloseTo(812, 0);
    expect(box.height).toBeLessThan(100);

    await tab(page, "Shared", "Tasks").tap();
    await expect(viewHeading(page)).toHaveText("Tasks");
    await expect(page).toHaveURL("/shared");
    await page.goBack();
    await expect(viewHeading(page)).toHaveText("Calendar");

    await expectNoHorizontalScroll(page);
    await accountButton(page, user.username).click();
    await expect(page.getByRole("link", { name: "Account", exact: true })).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);
  });

  test("at 320px, the top bar still fits", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const user = await openApp(page, "/shows");
    await expect(accountButton(page, user.username)).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Dark theme" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("link", { name: "Back to Apps" })).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);
  });
});

test.describe("at 1280px wide", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the tabs are a sidebar on the left", async ({ page }) => {
    await openApp(page, "/shows");
    const nav = tabBar(page, "Shows");
    await expect(nav).toBeVisible();
    await expect(page.locator('nav[aria-label="Shows"]:visible')).toHaveCount(1);

    const box = (await nav.boundingBox())!;
    const topBar = (await page.getByRole("banner").boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.y).toBeCloseTo(topBar.height, 0);
    expect(box.y + box.height).toBeCloseTo(800, 0);
    expect(box.width).toBeLessThan(320);

    const main = (await page.getByRole("main").boundingBox())!;
    expect(main.x).toBeGreaterThanOrEqual(box.width);

    await tab(page, "Shows", "Profile").click();
    await expect(viewHeading(page)).toHaveText("Profile");
    await expectNoHorizontalScroll(page);
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
