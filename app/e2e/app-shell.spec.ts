import { type Page } from "@playwright/test";
import { accountButton, accountMenuItems, appsMenuItems, expect, followAccountMenu, newUser, openSettings, settingsPicker, signUp, test } from "./fixtures";

// The tabs. Settings aren't one: Settings (/settings) opens from the account menu.
const appViews = [
  { path: "/shared", name: "Shared", views: ["Calendar", "Tasks"] },
  { path: "/shows", name: "Shows", views: ["Home", "Discover", "Profile"] },
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
    await page.getByLabel("Space name").fill("Shell test space");
    await page.getByRole("button", { name: "Create a Space" }).click();
    await expect(viewHeading(page)).toHaveText("Calendar");
  }
  return user;
}

/**
 * Picks a theme in Settings' Shows settings (opened from the account
 * menu) and waits for the response of the server action that saves it, which
 * starts once the action has run (its headers say whether it revalidated). The
 * body streams on with the re-rendered page.
 */
async function chooseTheme(page: Page, theme: "Light" | "Dark") {
  await openSettings(page, "Shows");
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && "next-action" in response.request().headers(),
  );
  await page.getByRole("radio", { name: theme, exact: true }).check();
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
  expect((await page.request.post("/api/shared/spaces", { data: { name: "History space" } })).ok()).toBe(true);
  await page.getByRole("main").getByRole("link", { name: "Shared", exact: true }).click();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Calendar");

  await tab(page, "Shared", "Tasks").click();
  await expect(viewHeading(page)).toHaveText("Tasks");
  await openSettings(page);
  await expect(page).toHaveURL("/settings?app=shared");

  // Back from Settings, a page of its own, to the view it was opened on.
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
  await expect(viewHeading(page)).toHaveText("Home");
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

  for (const path of ["/apps", "/account", "/settings"]) {
    await page.goto(path);
    await expect(header.getByRole("link")).toHaveCount(1);
    await expect(header.getByRole("link", { name: "diogomota.com", exact: true })).toHaveAttribute("href", "/");
    await expect(header.getByRole("navigation")).toHaveCount(1);
    await expect(account).toBeVisible();
    // The theme is chosen in Settings or Account, not in the top bar.
    await expect(header.getByRole("button", { name: /theme/i })).toHaveCount(0);
  }
});

/** Settings' section for an app, shown when the dropdown picks it. */
const settingsSection = (page: Page, app: string) =>
  page.getByRole("main").getByRole("region", { name: `${app} settings`, exact: true });

for (const app of appViews) {
  const id = app.path.slice(1);
  const other = appViews.find((each) => each !== app)!;
  const otherId = other.path.slice(1);
  test(`${app.name}: the account menu opens Settings on ${app.name}, and its dropdown switches app`, async ({ page }) => {
    const user = await openApp(page, app.path);
    await accountButton(page, user.username).click();
    const menu = page.getByRole("navigation", { name: "Account" }).getByRole("list");
    await expect(menu.getByRole("listitem")).toHaveText(accountMenuItems);
    await expect(menu.getByRole("link", { name: "Switch app" })).toHaveAttribute("href", "/apps");
    await menu.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(`/settings?app=${id}`);
    await expect(page).toHaveTitle("Settings · diogo mota");
    await expect(viewHeading(page)).toHaveText("Settings");
    // In the apps' frame: the top bar of /apps, diogomota.com and no tabs.
    await expect(page.getByRole("banner").getByRole("link", { name: "diogomota.com", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: app.name, exact: true })).toHaveCount(0);

    // One app's settings at a time, picked in the dropdown; the URL follows it.
    await expect(settingsPicker(page)).toHaveValue(id);
    await expect(settingsPicker(page).getByRole("option")).toHaveText(["Shared", "Shows"]);
    const check = async (name: string) => {
      await expect(settingsSection(page, name)).toBeVisible();
      await expect(settingsSection(page, name === "Shared" ? "Shows" : "Shared")).toBeHidden();
      // openApp made a space for Shared's test, not for Shows'.
      if (name === "Shared" && app.name === "Shared") await expect(settingsSection(page, name).getByLabel("Space name")).toHaveValue("Shell test space");
      else if (name === "Shared") await expect(settingsSection(page, name).getByRole("heading", { name: "No space yet" })).toBeVisible();
      else await expect(settingsSection(page, name).getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
    };
    await check(app.name);
    await settingsPicker(page).selectOption({ label: other.name });
    await expect(page).toHaveURL(`/settings?app=${otherId}`);
    await check(other.name);
    await page.reload();
    await expect(settingsPicker(page)).toHaveValue(otherId);
    await check(other.name);
    // The menu's link from Settings itself opens it on the first app.
    await openSettings(page);
    await expect(page).toHaveURL("/settings");
    await expect(settingsPicker(page)).toHaveValue("shared");
    await check("Shared");

    // Back goes through the pages, not the dropdown's choices, to the view it was opened on.
    await page.goBack();
    await expect(page).toHaveURL(`/settings?app=${otherId}`);
    await page.goBack();
    await expect(page).toHaveURL(app.path);
    await expect(viewHeading(page)).toHaveText(app.views[0]);
  });
}

test("Settings for Shared, before there is a space, sends the user to Shared", async ({ page }) => {
  const user = newUser();
  await signUp(page, user, "/signup?next=%2Fshared");
  await expect(viewHeading(page)).toHaveText("Your shared space");
  // No tabs yet: the top bar has only the account menu.
  await expect(page.getByRole("banner").getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("banner").getByRole("link")).toHaveCount(0);
  await openSettings(page);
  await expect(page).toHaveURL("/settings?app=shared");
  await expect(settingsSection(page, "Shared").getByRole("heading", { name: "No space yet" })).toBeVisible();
  await settingsSection(page, "Shared").getByRole("link", { name: "Open Shared" }).click();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Your shared space");
});

test("Back from Settings shows Shared as it is now, after creating or leaving the space", async ({ page }) => {
  // The space's changes are API calls; a server action then makes the pages the
  // browser kept for Back render again (app/shared/actions.ts). Its response
  // comes once that's done.
  const refreshed = () => page.waitForResponse((response) =>
    response.request().method() === "POST" && "next-action" in response.request().headers());
  await signUp(page, newUser(), "/signup?next=%2Fshared");
  await expect(viewHeading(page)).toHaveText("Your shared space");
  await page.getByLabel("Space name").fill("Back test space");
  let done = refreshed();
  await page.getByRole("button", { name: "Create a Space" }).click();
  await expect(viewHeading(page)).toHaveText("Calendar");
  await done;

  await openSettings(page);
  await page.goBack();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Calendar");

  await page.goForward();
  await expect(page.getByLabel("Space name")).toHaveValue("Back test space");
  await page.getByRole("button", { name: "Leave space", exact: true }).click();
  done = refreshed();
  await page.getByRole("button", { name: "Confirm leave" }).click();
  await expect(page.getByRole("heading", { name: "No space yet" })).toBeVisible();
  await done;
  await page.goBack();
  await expect(page).toHaveURL("/shared");
  await expect(viewHeading(page)).toHaveText("Your shared space");
});

test("Settings is only for logged-in users", async ({ page }) => {
  await page.goto("/settings?app=shows");
  await expect(page).toHaveURL(`/apps?${new URLSearchParams({ next: "/settings?app=shows" })}`);
});

test("Apps, Shared and Shows share header sizing and fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/apps");
  await expectNoHorizontalScroll(page);
  const user = { ...newUser(), username: `e2e_${Date.now()}abc` };
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  let reference: unknown;
  for (const path of ["/apps", "/shared", "/shows", "/settings"]) {
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
    const items = path === "/apps" ? appsMenuItems : accountMenuItems;
    await expect(header.getByRole("navigation", { name: "Account" }).getByRole("listitem")).toHaveText(items);
    for (const name of items.slice(0, -1)) await expect(header.getByRole("link", { name, exact: true })).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);
  }
});

test("the theme in Settings saves to the account, and the saved theme is in the page as served", async ({
  page,
}) => {
  await openApp(page, "/shows");
  const shell = page.locator("[data-theme]");
  const themeColor = page.locator('meta[name="theme-color"]');
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await expect(shell).toHaveCSS("background-color", "rgb(10, 10, 10)");

  await chooseTheme(page, "Light");
  await expect(shell).toHaveAttribute("data-theme", "light");
  await expect(shell).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(themeColor).toHaveAttribute("content", "#ffffff");

  // The server renders the saved theme into the HTML, so it applies before any
  // script runs (no flash of the other theme on load): Settings, and the apps.
  expect(await reloadHtml(page)).toContain('data-theme="light"');
  await expect(page.getByRole("radio", { name: "Light", exact: true })).toBeChecked();
  await page.goto("/shows");
  expect(await reloadHtml(page)).toContain('data-theme="light"');
  await expect(shell).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(themeColor).toHaveAttribute("content", "#ffffff");

  // The same preference everywhere: the other app, /apps and account settings.
  await page.goto("/shared");
  await expect(shell).toHaveAttribute("data-theme", "light");
  await page.goto("/apps");
  expect(await reloadHtml(page)).toContain('data-theme="light"');
  await expect(shell).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.goto("/account");
  await expect(shell).toHaveAttribute("data-theme", "light");
  await page.getByRole("heading", { name: "Theme", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Light", exact: true })).toBeChecked();

  await page.goto("/shows");
  await chooseTheme(page, "Dark");
  await expect(shell).toHaveAttribute("data-theme", "dark");
  expect(await reloadHtml(page)).toContain('data-theme="dark"');
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await expect(shell).toHaveCSS("background-color", "rgb(10, 10, 10)");
  await expect(themeColor).toHaveAttribute("content", "#0a0a0a");
});

test("theme changes show on pages reached with the back button, and keep the view history", async ({
  page,
}) => {
  const user = await openApp(page, "/shows");
  const shell = page.locator("[data-theme]");
  await tab(page, "Shows", "Discover").click();
  await chooseTheme(page, "Light");
  await expect(shell).toHaveAttribute("data-theme", "light");

  // Back in the app: in the new theme, on the view Settings was opened from.
  await page.goBack();
  await expect(page).toHaveURL("/shows");
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(shell).toHaveAttribute("data-theme", "light");
  await page.goForward();
  await expect(viewHeading(page)).toHaveText("Settings");
  await expect(settingsPicker(page)).toHaveValue("shows");

  // The same for a change in account settings.
  await accountButton(page, user.username).click();
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL("/account");
  await page.getByRole("heading", { name: "Theme", exact: true }).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page.getByRole("button", { name: "Save theme" }).click();
  await expect(page.getByRole("region", { name: "Theme" }).getByRole("status")).toHaveText("Theme saved.");
  await page.goBack();
  await expect(page).toHaveURL("/settings?app=shows");
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  await page.goBack();
  await expect(page).toHaveURL("/shows");
  await expect(viewHeading(page)).toHaveText("Discover");
  await expect(shell).toHaveAttribute("data-theme", "dark");
});

test.describe("at 375px wide", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("the tabs are in the middle of the top bar, the account menu on the right, and nothing is along the bottom", async ({ page }) => {
    const user = await openApp(page, "/shared");
    const nav = tabBar(page, "Shared");
    await expect(nav).toBeVisible();
    // Once, in the top bar; the shell has no other navigation than the account menu.
    await expect(page.locator('nav[aria-label="Shared"]')).toHaveCount(1);
    await expect(page.locator("[data-theme] nav")).toHaveCount(2);

    const box = (await nav.boundingBox())!;
    const topBar = (await page.getByRole("banner").boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - 375 / 2)).toBeLessThanOrEqual(1);
    expect(box.y).toBeGreaterThanOrEqual(topBar.y);
    expect(box.y + box.height).toBeLessThanOrEqual(topBar.y + topBar.height);
    expect(box.x + box.width).toBeLessThanOrEqual((await accountButton(page, user.username).boundingBox())!.x);

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

  test("at 320px, the top bar still fits, the tabs whole and the username cut off if need be", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const user = { ...newUser(), username: `e2e_${Date.now()}abc` };
    await signUp(page, user, "/signup?next=%2Fshows");
    await expect(page).toHaveURL("/shows");
    expect((await page.request.post("/api/shared/spaces", { data: { name: "Narrow space" } })).ok()).toBe(true);
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
    }
  });
});

test.describe("at 1280px wide", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the tabs are in the middle of the top bar, and the view has the whole width", async ({ page }) => {
    await openApp(page, "/shows");
    const header = page.getByRole("banner");
    const nav = header.getByRole("navigation", { name: "Shows", exact: true });
    await expect(nav).toBeVisible();
    await expect(page.locator('nav[aria-label="Shows"]:visible')).toHaveCount(1);
    await expect(nav.getByRole("button")).toHaveCount(3);

    const box = (await nav.boundingBox())!;
    const topBar = (await header.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(topBar.y);
    expect(box.y + box.height).toBeLessThanOrEqual(topBar.y + topBar.height);
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThanOrEqual(1);

    const main = (await page.getByRole("main").boundingBox())!;
    expect(main.x).toBe(0);
    expect(main.width).toBe(1280);

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
