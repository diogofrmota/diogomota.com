import { expect, newUser, signUp, test } from "./fixtures";

// /about: who runs the site, in the website's frame (docs/decisions/0016), as
// the front page is: its header, the intro, what the site is, and its footer.

test("about is in the website's look: its header and footer, the intro, and what the site is", async ({ page }) => {
  await page.goto("/about");
  // Light, logged out, as the front page: not black any more.
  await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "minimal-neutrals");
  await expect(page.locator("[data-theme]")).toHaveCSS("background-color", "rgb(230, 230, 230)");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Diogo Mota");
  await expect(main).toContainText("DevOps engineer at Richemont, based in Lisbon, Portugal.");
  // No button to the apps: the header and footer have them.
  await expect(page.getByRole("link", { name: "See the apps" })).toHaveCount(0);

  // What the site is, with a link to each app's section and to Privacy.
  const site = main.getByRole("region", { name: "This site" });
  await expect(site).toContainText(
    "Shared, a calendar for two, Shows, a watchlist with your friends, and Recipes, a recipe box with a shopping list.",
  );
  await expect(site.getByRole("link", { name: "Shared", exact: true })).toHaveAttribute("href", "/#shared");
  await expect(site.getByRole("link", { name: "Shows", exact: true })).toHaveAttribute("href", "/#shows");
  await expect(site.getByRole("link", { name: "Recipes", exact: true })).toHaveAttribute("href", "/#recipes");
  await expect(site.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");

  // The header, with About marked, and the footer.
  const nav = page.getByRole("banner").getByRole("navigation", { name: "Site" });
  await expect(nav.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "About" })).toBeVisible();
});

test("about links to Richemont, in a new tab", async ({ page }) => {
  await page.goto("/about");
  const richemont = page.getByRole("link", { name: "Richemont" });
  await expect(richemont).toHaveAttribute("href", "https://www.richemont.com/");
  await expect(richemont).toHaveAttribute("target", "_blank");
  await expect(richemont).toHaveAttribute("rel", "noopener noreferrer");
  await expect(richemont).toHaveAccessibleName("Richemont (opens in a new tab)");
});

test("about has a title, the intro as its description and its own preview image", async ({ page }) => {
  await page.goto("/about");
  await expect(page).toHaveTitle("about · diogo mota");

  const meta = (attribute: string, value: string) => page.locator(`head meta[${attribute}="${value}"]`);
  await expect(meta("name", "description")).toHaveAttribute("content", /DevOps engineer at Richemont/);
  await expect(meta("property", "og:title")).toHaveAttribute("content", "diogo mota");
  await expect(meta("property", "og:description")).toHaveAttribute("content", /Lisbon, Portugal/);
  await expect(meta("property", "og:url")).toHaveAttribute("content", "https://diogomota.com/about");
  await expect(meta("property", "og:type")).toHaveAttribute("content", "website");
  // The dev server puts its own origin here; production builds use https://diogomota.com.
  await expect(meta("property", "og:image")).toHaveAttribute("content", /^https?:\/\/[^/]+\/about\/opengraph-image\b/);

  const image = await page.request.get("/about/opengraph-image");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("about is in the system font, as the rest of the site, with nothing from other sites", async ({
  page,
  baseURL,
}) => {
  const requests: URL[] = [];
  page.on("request", (request) => requests.push(new URL(request.url())));
  await page.goto("/about");
  await page.evaluate(() => document.fonts.ready);

  const family = await page
    .getByRole("heading", { level: 1 })
    .evaluate((h1) => getComputedStyle(h1).fontFamily.split(",")[0].trim());
  expect(family).toBe("system-ui");
  expect(requests.filter((url) => /\.(woff2?|ttf|otf)$/.test(url.pathname)).map(String)).toEqual([]);
  const origin = new URL(baseURL!).origin;
  expect(requests.filter((url) => url.origin !== origin).map(String)).toEqual([]);
});

test("logged in, about's header has Account and Your apps, and the apps' links open them", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/about");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
  await expect(header.getByRole("link", { name: "Your apps" })).toHaveAttribute("href", "/");
  await expect(header.getByRole("link", { name: "Log in" })).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("region", { name: "This site" }).getByRole("link", { name: "Shows", exact: true }),
  ).toHaveAttribute("href", "/shows");
});
