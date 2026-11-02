import { expect, type Page, test } from "@playwright/test";
import { apps } from "../lib/apps";

const card = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });

test("/apps shows a card for Shared and for Shows", async ({ page }) => {
  await page.goto("/apps");
  await expect(page).toHaveTitle("apps · diogo mota");
  // "dev" unless APP_VERSION is set, as it is in the Docker image.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^apps - (dev|v\d+\.\d+\.\d+)$/);
  expect(apps.map((app) => app.name)).toEqual(["Shared", "Shows"]);
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(apps.length);

  for (const app of apps) {
    const item = card(page, app.name);
    await expect(item).toBeVisible();
    await expect(item).toContainText(app.description);
    const logo = item.locator("img");
    await expect(logo).toHaveAttribute("src", app.logo);
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(
      true,
    );
  }
});

test("/apps top bar has Login and Sign Up", async ({ page }) => {
  await page.goto("/apps");
  const account = page.getByRole("navigation", { name: "Account" });

  await account.getByRole("link", { name: "Login" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1, name: "login" })).toBeVisible();

  await page.getByRole("link", { name: "Back to Apps" }).click();
  await expect(page).toHaveURL("/apps");

  await account.getByRole("link", { name: "Sign Up" }).click();
  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("heading", { level: 1, name: "sign up" })).toBeVisible();
});

for (const app of apps) {
  test(`clicking the ${app.name} card while logged out opens the login prompt`, async ({ page }) => {
    await page.goto("/apps");
    // A corner of the card, away from the name: the whole card is clickable.
    await card(page, app.name).click({ position: { x: 8, y: 8 } });

    const prompt = page.getByRole("dialog", { name: `Log in to open ${app.name}` });
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL("/apps");

    const next = new URLSearchParams({ next: app.href });
    await expect(prompt.getByRole("link", { name: "Login" })).toHaveAttribute("href", `/login?${next}`);
    await expect(prompt.getByRole("link", { name: "Sign Up" })).toHaveAttribute(
      "href",
      `/signup?${next}`,
    );

    await prompt.getByRole("link", { name: "Login" }).click();
    await expect(page).toHaveURL(`/login?${next}`);
  });
}

test("the login prompt closes with Escape, its close button or the backdrop", async ({ page }) => {
  await page.goto("/apps");
  const link = page.getByRole("link", { name: "Shared", exact: true });
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
  await expect(page).toHaveURL("/apps");
});
