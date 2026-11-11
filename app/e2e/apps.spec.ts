import { expect, type Page, test } from "@playwright/test";
import { apps } from "../lib/apps";

const card = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });

test("/apps shows a card for Shared and for Shows, with the version under them", async ({ page }) => {
  await page.goto("/apps");
  await expect(page).toHaveTitle("apps · diogo mota");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Apps");
  // "dev" unless APP_VERSION is set, as it is in the Docker image.
  await expect(page.getByRole("main").getByText(/^Version (dev|v\d+\.\d+\.\d+)$/)).toBeVisible();
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

test("/apps top bar has Log in and Sign up", async ({ page }) => {
  await page.goto("/apps");
  const account = page.getByRole("navigation", { name: "Account" });

  await account.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");

  await page.getByRole("link", { name: "Back to apps" }).click();
  await expect(page).toHaveURL("/apps");

  // Sign up is the call to action: filled with the accent.
  const signUp = account.getByRole("link", { name: "Sign up" });
  await expect(signUp.locator("span").first()).toHaveCSS("background-color", "rgb(79, 70, 229)");
  await signUp.click();
  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");

  // From an app's login prompt, the title says which app.
  await page.goto("/signup?next=%2Fshows");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign up to use Shows");
  await page.goto("/login?next=%2Fshared");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in to open Shared");
});

test("/apps, logged out, asks to log in or sign up over the cards", async ({ page }) => {
  await page.goto("/apps");
  // Logged out, in Light mode.
  await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "light-2");
  const callout = page.getByRole("region", { name: "One account for Shared and Shows" });
  await expect(callout.getByRole("paragraph")).toHaveText(
    "Plan with your group in a shared calendar and task lists, and keep track of what you watch.");
  // No icon: the title, the paragraph under it, then the two buttons side by
  // side under that, Sign up (the call to action) first.
  await expect(callout.locator("svg, img")).toHaveCount(0);
  const calloutBox = (await callout.boundingBox())!;
  const headingBox = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  expect(calloutBox.y + calloutBox.height).toBeLessThanOrEqual(headingBox.y);
  const title = (await callout.getByRole("heading").boundingBox())!;
  const text = (await callout.getByRole("paragraph").boundingBox())!;
  const login = (await callout.getByRole("link", { name: "Log in" }).boundingBox())!;
  const signUp = (await callout.getByRole("link", { name: "Sign up" }).boundingBox())!;
  expect(text.y).toBeGreaterThanOrEqual(title.y + title.height);
  expect(signUp.y).toBeGreaterThanOrEqual(text.y + text.height);
  expect(login.y).toBe(signUp.y);
  expect(login.x).toBeGreaterThan(signUp.x + signUp.width);

  await callout.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/apps");
  await callout.getByRole("link", { name: "Sign Up" }).click();
  await expect(page).toHaveURL("/signup");

  // Sent here from a protected page: like the top bar's, they return there.
  await page.goto("/account");
  await expect(page).toHaveURL("/apps?next=%2Faccount");
  await expect(callout.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Faccount");
  await expect(callout.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", "/signup?next=%2Faccount");
});

for (const app of apps) {
  test(`clicking the ${app.name} card while logged out opens the login prompt`, async ({ page }) => {
    await page.goto("/apps");
    // A corner of the card, away from the name: the whole card is clickable.
    await card(page, app.name).click({ position: { x: 8, y: 8 } });

    const prompt = page.getByRole("dialog", { name: `Log in to open ${app.name}` });
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL("/apps");
    // What the app is for, under the title.
    await expect(prompt.getByRole("paragraph")).toHaveText(app.description);

    const next = new URLSearchParams({ next: app.href });
    await expect(prompt.getByRole("link", { name: "Log in" })).toHaveAttribute("href", `/login?${next}`);
    await expect(prompt.getByRole("link", { name: "Sign Up" })).toHaveAttribute(
      "href",
      `/signup?${next}`,
    );

    await prompt.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(`/login?${next}`);
  });
}

test("the login prompt closes with Escape, its close button or the backdrop", async ({ page }) => {
  await page.goto("/apps");
  const link = page.getByRole("main").getByRole("link", { name: "Shared", exact: true });
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
