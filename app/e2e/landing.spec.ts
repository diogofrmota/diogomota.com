import { expect, test } from "@playwright/test";

test("landing shows the intro and no navbar or footer", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "diogo mota" })).toBeVisible();
  await expect(main).toContainText("devops engineer @ Richemont");
  await expect(main).toContainText("currently based in Lisbon, PT");
  await expect(main.getByRole("link", { name: "Check Apps" })).toHaveText("[Check Apps]");

  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
});

test("landing lines are one size and white, left-aligned in a centered block", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const main = page.getByRole("main");

  const lines = await main.locator("h1, p, a").evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return { fontSize: style.fontSize, color: style.color, textAlign: style.textAlign };
    }),
  );
  expect(lines).toHaveLength(6); // 4 lines, 2 links
  for (const line of lines) {
    expect(line).toEqual({ fontSize: "16px", color: "rgb(255, 255, 255)", textAlign: "left" });
  }

  // The block is as wide as its longest line and sits in the middle of the screen.
  const box = (await main.boundingBox())!;
  expect(box.width).toBeLessThan(400);
  expect(Math.abs(box.x - (1280 - box.x - box.width))).toBeLessThanOrEqual(1);
});

test("landing links go to Richemont and to /apps", async ({ page }) => {
  await page.goto("/");
  const richemont = page.getByRole("link", { name: "Richemont" });
  await expect(richemont).toHaveAttribute("href", "https://www.richemont.com/");
  await expect(richemont).toHaveAttribute("target", "_blank");
  await expect(richemont).toHaveAttribute("rel", "noopener noreferrer");
  await expect(richemont).toHaveAccessibleName("Richemont (opens in a new tab)");

  await page.getByRole("link", { name: "Check Apps" }).click();
  await expect(page).toHaveURL("/apps");
});

test("landing has a title, a description and Open Graph tags", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("diogo mota");

  const meta = (attribute: string, value: string) =>
    page.locator(`head meta[${attribute}="${value}"]`);
  await expect(meta("name", "description")).toHaveAttribute("content", /devops engineer @ Richemont/);
  await expect(meta("property", "og:title")).toHaveAttribute("content", "diogo mota");
  await expect(meta("property", "og:description")).toHaveAttribute("content", /Lisbon, PT/);
  await expect(meta("property", "og:url")).toHaveAttribute("content", "https://diogomota.com");
  await expect(meta("property", "og:type")).toHaveAttribute("content", "website");
  // The dev server puts its own origin here; production builds use https://diogomota.com.
  await expect(meta("property", "og:image")).toHaveAttribute(
    "content",
    /^https?:\/\/[^/]+\/opengraph-image\b/,
  );

  const image = await page.request.get("/opengraph-image");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("landing uses the self-hosted IBM Plex Mono, with no third-party requests", async ({
  page,
  baseURL,
}) => {
  const requests: URL[] = [];
  page.on("request", (request) => requests.push(new URL(request.url())));
  await page.goto("/");

  const { family, loaded, bodyFamily } = await page.evaluate(async () => {
    await document.fonts.ready;
    const h1 = document.querySelector("h1")!;
    const family = getComputedStyle(h1).fontFamily.split(",")[0].trim().replace(/["']/g, "");
    return {
      family,
      loaded: [...document.fonts].some(
        (face) => face.family.replace(/["']/g, "") === family && face.status === "loaded",
      ),
      bodyFamily: getComputedStyle(document.body).fontFamily,
    };
  });
  expect(loaded).toBe(true);
  // Applied by the page frame, not the root layout, so the apps don't get it.
  expect(bodyFamily).not.toContain(family);

  const fontFiles = requests.filter((url) => url.pathname.endsWith(".woff2"));
  expect(fontFiles.length).toBeGreaterThan(0);
  const origin = new URL(baseURL!).origin;
  expect(requests.filter((url) => url.origin !== origin).map(String)).toEqual([]);
});
