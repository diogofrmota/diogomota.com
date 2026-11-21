import { randomUUID } from "node:crypto";
import { type Page } from "@playwright/test";
import { accountSetting, expect, linkNames, newUser, signUp, test } from "./fixtures";

// /reset-password without a token shows its "link expired" message.
const pages = [
  "/",
  "/about",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/report-bug",
  "/no-such-page",
];

async function expectNoHorizontalScroll(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

// The narrowest phones: views.spec.ts checks every view at 390 and 375 px.
test.describe("at 320px wide", () => {
  test.use({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });

  test("no page scrolls sideways: the site's, home with its login prompt or menu open, then logged in, home and Account's popups", async ({
    page,
  }) => {
    for (const path of pages) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: "Shows", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoHorizontalScroll(page);
    // Nor with the website's menu open.
    await page.keyboard.press("Escape");
    await page.getByRole("banner").getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("navigation", { name: "Menu" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await signUp(page, newUser());
    await expect(page).toHaveURL("/");
    await expectNoHorizontalScroll(page);
    // The three folders in a row, all of each on the screen, even this narrow; and one open.
    const main = page.getByRole("main");
    const folders = ["For Couples", "Trackers", "Health"].map((name) =>
      main.getByRole("button", { name, exact: true }),
    );
    for (const folder of folders) await expect(folder).toBeInViewport({ ratio: 1 });
    const tops = await Promise.all(folders.map(async (folder) => (await folder.boundingBox())!.y));
    expect(new Set(tops).size).toBe(1);
    await folders[1].tap();
    const trackers = page.getByRole("dialog", { name: "Trackers" });
    await expect(trackers).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);
    await trackers.getByRole("button", { name: "Close" }).tap();
    await expect(trackers).toBeHidden();

    await page.goto("/account");
    await expectNoHorizontalScroll(page);
    // On a touch screen, a popup opens without its field focused: the keyboard
    // would come up over it. A tap on the field types.
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    for (const name of ["Name", "Username", "Email", "Theme"]) {
      await accountSetting(page, name).click();
      const popup = page.getByRole("dialog", { name, exact: true });
      await expect(popup).toBeInViewport({ ratio: 1 });
      await expectNoHorizontalScroll(page);
      if (name !== "Theme") {
        await expect(popup.getByRole("button", { name: "Close" })).toBeFocused();
        await expect(popup.getByRole("textbox").first()).not.toBeFocused();
        await popup.getByRole("textbox").first().tap();
        await expect(popup.getByRole("textbox").first()).toBeFocused();
      }
      await popup.getByRole("button", { name: "Close" }).tap();
      await expect(popup).toBeHidden();
    }
  });
});

test("the health check, the icons and the web app manifest are served @smoke", async ({ page }) => {
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });

  await page.goto("/");
  await expect(page.locator('head link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
  await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveCount(1);
  for (const [path, type] of [
    ["/favicon.ico", "image/x-icon"],
    ["/icon.svg", "image/svg+xml"],
    ["/apple-icon.png", "image/png"],
  ]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toBe(type);
  }

  // The manifest lets phones add the site to their home screen.
  for (const path of ["/", "/about"]) {
    await page.goto(path);
    await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('head meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "diogo mota");
  }
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "diogo mota",
    short_name: "diogo mota",
    // Home, the apps; the id is still /apps, where it opened before, so phones that added it keep one app.
    id: "/apps",
    start_url: "/",
    display: "standalone",
  });

  // A 192px and a 512px icon, and a maskable one, each the size it says (from its PNG header).
  expect(manifest.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes} ${icon.purpose}`)).toEqual([
    "192x192 any",
    "512x512 any",
    "512x512 maskable",
  ]);
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.headers()["content-type"], icon.src).toBe("image/png");
    const png = await image.body();
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.src).toBe(icon.sizes);
  }
});

test("unknown URLs get a 404 page in the apps' look, and a page that fails to render the error page, whose Retry renders it again", async ({
  page,
}) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("page not found · diogo mota");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  // Light, logged out: the theme's gray.
  await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "minimal-neutrals");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(
    "rgb(230, 230, 230)",
  );
  expect(await linkNames(page.getByRole("navigation", { name: "Account" }))).toEqual(["Log in", "Sign up", "Apps"]);
  await page.getByRole("main").getByRole("link", { name: "Go home" }).click();
  await expect(page).toHaveURL("/");

  // A test page that fails once for each id (app/test/error).
  await page.goto(`/test/error?id=${randomUUID()}`);
  await expect(page.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeVisible();
  await expect(page).toHaveTitle("something went wrong · diogo mota");
  // In the apps' look, without a tab bar: the server that failed can't say who is logged in.
  await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "minimal-neutrals");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rendered" })).toBeVisible();
});

test("keyboard focus is visible", async ({ page }) => {
  await page.goto("/about");
  // The website's header first: its mark, which goes home, ringed in the accent.
  await page.keyboard.press("Tab");
  const brand = page.getByRole("banner").getByRole("link", { name: "diogomota" });
  await expect(brand).toBeFocused();
  await expect(brand).toHaveCSS("outline-style", "solid");
  await expect(brand).toHaveCSS("outline-color", "rgb(48, 80, 122)");

  await page.goto("/");
  // The header (the mark, Apps, How it works, About, Log in and Sign up), then
  // the hero's Sign up and Login, then Calendar's icon.
  for (let i = 0; i < 9; i++) await page.keyboard.press("Tab");
  const open = page.getByRole("main").getByRole("link", { name: "Calendar", exact: true });
  await expect(open).toBeFocused();
  await expect(open).toHaveCSS("outline-style", "solid");

  await page.keyboard.press("Enter");
  const login = page.getByRole("dialog").getByRole("link", { name: "Log in" });
  await expect(login).toBeFocused();
  await expect(login).toHaveCSS("outline-style", "solid");
});
