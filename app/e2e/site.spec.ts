import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

// /reset-password without a token shows its "link expired" message.
const pages = ["/", "/apps", "/login", "/signup", "/forgot-password", "/reset-password", "/no-such-page"];

async function expectNoHorizontalScroll(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

// The narrowest phones: views.spec.ts checks these pages at 390 and 375 px.
test.describe("at 320px wide", () => {
  test.use({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });

  test("no page scrolls sideways, nor /apps with the login prompt open", async ({ page }) => {
    for (const path of pages) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
    await page.goto("/apps");
    await page.getByRole("main").getByRole("link", { name: "Shows", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test("health check reports ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("unknown URLs get a 404 page in the site style", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("page not found · diogo mota");
  await expect(page.getByRole("heading", { level: 1, name: "404" })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(
    "rgb(0, 0, 0)",
  );

  await page.getByRole("link", { name: "Go Home" }).click();
  await expect(page).toHaveURL("/");
});

test("favicon and touch icon are served", async ({ page }) => {
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
});

test("the web app manifest lets phones add the site to their home screen", async ({ page }) => {
  for (const path of ["/", "/apps"]) {
    await page.goto(path);
    await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('head meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "diogo mota");
  }
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "diogo mota", short_name: "diogo mota", start_url: "/apps", display: "standalone" });

  // A 192px and a 512px icon, and a maskable one, each the size it says (from its PNG header).
  expect(manifest.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes} ${icon.purpose}`))
    .toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.headers()["content-type"], icon.src).toBe("image/png");
    const png = await image.body();
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.src).toBe(icon.sizes);
  }
});

test("a page that fails to render shows the error page, whose Retry renders it again", async ({ page }) => {
  // A test page that fails once for each id (app/test/error).
  await page.goto(`/test/error?id=${randomUUID()}`);
  await expect(page.getByRole("heading", { level: 1, name: "something went wrong" })).toBeVisible();
  await expect(page).toHaveTitle("something went wrong · diogo mota");
  await expect(page.getByRole("link", { name: "Back to Apps" })).toHaveAttribute("href", "/apps");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rendered" })).toBeVisible();
});

test("keyboard focus is visible", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const richemont = page.getByRole("link", { name: "Richemont" });
  await expect(richemont).toBeFocused();
  await expect(richemont).toHaveCSS("outline-style", "solid");
  await expect(richemont).toHaveCSS("outline-color", "rgb(255, 255, 255)");

  await page.goto("/apps");
  // diogomota.com, Login, Sign Up, then the first card.
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  const card = page.getByRole("main").getByRole("listitem").filter({ has: page.getByRole("link", { name: "Shared", exact: true }) });
  await expect(card.getByRole("link")).toBeFocused();
  // The link covers its card, so the ring is drawn around the card.
  await expect(card).toHaveCSS("outline-style", "solid");

  await page.keyboard.press("Enter");
  const login = page.getByRole("dialog").getByRole("link", { name: "Login" });
  await expect(login).toBeFocused();
  await expect(login).toHaveCSS("outline-style", "solid");
});
