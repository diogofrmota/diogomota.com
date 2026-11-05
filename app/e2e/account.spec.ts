import { type Page } from "@playwright/test";
import { accountButton, expect, formAlert, logIn, logOut, newUser, signUp, test } from "./fixtures";

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** The settings are dropdowns, closed on load: opens one and returns it. */
async function openSection(page: Page, name: string) {
  const region = section(page, name);
  const heading = region.getByRole("heading", { name, exact: true });
  await heading.click();
  await expect(region.locator("details")).toHaveAttribute("open", "");
  return region;
}

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test("the account menu opens settings, and closes with Escape or a click outside", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");

  const button = accountButton(page, user.username);
  const settings = page.getByRole("link", { name: "Account settings" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(settings).toBeHidden();

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(settings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await expect(button).toBeFocused();

  await button.click();
  await expect(settings).toBeVisible();
  // Its left end: on a phone, the open menu covers the rest of the heading.
  await page.getByRole("heading", { level: 1, name: "apps" }).click({ position: { x: 5, y: 5 } });
  await expect(settings).toBeHidden();

  await button.click();
  await settings.click();
  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("heading", { level: 1, name: "account" })).toBeVisible();
});

test("change username", async ({ page }) => {
  const taken = newUser();
  await signUp(page, taken);
  await expect(page).toHaveURL("/apps");
  await logOut(page, taken.username);

  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await page.goto("/account");

  const form = await openSection(page, "Change username");
  const field = form.getByLabel("Username");
  const save = form.getByRole("button", { name: "Save username" });
  await expect(field).toHaveValue(user.username);

  await field.fill("not valid!");
  await save.click();
  await expect(form.getByText("Use 3-20 characters: a-z, 0-9 and _.")).toBeVisible();

  await field.fill(taken.username.toUpperCase());
  await save.click();
  await expect(form.getByText("That username is taken.")).toBeVisible();

  const renamed = newUser().username;
  await field.fill(renamed);
  await save.click();
  await expect(form.getByRole("status")).toHaveText("Username changed.");
  // The session has the new name too.
  await expect(accountButton(page, renamed)).toBeVisible();
  await page.goto("/shows");
  await expect(accountButton(page, renamed)).toBeVisible();

  await logOut(page, renamed);
  await logIn(page, user.username, user.password);
  await expect(formAlert(page)).toHaveText("Wrong username/email or password.");
  await logIn(page, renamed, user.password);
  await expect(page).toHaveURL("/apps");
  await expect(accountButton(page, renamed)).toBeVisible();
});

test("change password, which logs out every device", async ({ page, browser }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  const otherDevice = await browser.newContext();
  const other = await otherDevice.newPage();
  await logIn(other, user.username, user.password);
  await expect(other).toHaveURL("/apps");
  await page.goto("/account");

  const form = await openSection(page, "Change password");
  const newPassword = "a whole new password";
  async function submit(current: string, password: string, confirm: string) {
    await form.getByLabel("Current password").fill(current);
    await form.getByLabel("New password", { exact: true }).fill(password);
    await form.getByLabel("Confirm new password").fill(confirm);
    await form.getByRole("button", { name: "Change password" }).click();
  }

  await submit("not the password", newPassword, newPassword);
  await expect(form.getByText("That isn't your current password.")).toBeVisible();

  await submit(user.password, newPassword, "something else entirely");
  await expect(form.getByText("The new passwords don't match.")).toBeVisible();

  await submit(user.password, "short", "short");
  await expect(form.getByText("Use at least 10 characters.")).toBeVisible();

  await submit(user.password, newPassword, newPassword);
  await expect(page).toHaveURL("/login?password=changed&next=%2Faccount");
  await expect(page.getByRole("main")).toContainText("Your password was changed. Log in with the new one.");
  await other.goto("/shared");
  await expect(other).toHaveURL("/apps?next=%2Fshared");
  await otherDevice.close();

  await logIn(page, user.username, user.password);
  await expect(formAlert(page)).toHaveText("Wrong username/email or password.");
  // Back to account settings.
  await logIn(page, user.username, newPassword, "/login?next=%2Faccount");
  await expect(page).toHaveURL("/account");
});

test("theme preference persists after logging in again", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");

  const app = page.locator("[data-theme]");
  await page.goto("/shared");
  await expect(app).toHaveAttribute("data-theme", "dark");

  await page.goto("/account");
  const form = await openSection(page, "Theme");
  await expect(form.getByRole("radio", { name: "Dark" })).toBeChecked();
  await form.getByRole("radio", { name: "Light" }).check();
  await form.getByRole("button", { name: "Save theme" }).click();
  await expect(form.getByRole("status")).toHaveText("Theme saved.");

  await logOut(page, user.username);
  await logIn(page, user.username, user.password);
  await expect(page).toHaveURL("/apps");

  await page.goto("/account");
  await openSection(page, "Theme");
  await expect(form.getByRole("radio", { name: "Light" })).toBeChecked();
  await page.goto("/shared");
  await expect(app).toHaveAttribute("data-theme", "light");
  await expect(app).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("forgot password in account settings opens the reset by email", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await page.goto("/account");

  const forgot = await openSection(page, "Forgot password");
  await expect(forgot).toContainText(`Reset it with a link sent to ${user.email}.`);
  await forgot.getByRole("link", { name: "Reset by email" }).click();
  await expect(page).toHaveURL("/forgot-password");
});

test("logged out, /account redirects to /apps and Login comes back to it", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL("/apps?next=%2Faccount");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Login" }),
  ).toHaveAttribute("href", "/login?next=%2Faccount");
});

test.describe("at 320px wide", () => {
  test.use({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });

  test("logged-in /apps, its open menu and /account have no horizontal scroll", async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await expect(page).toHaveURL("/apps");
    await expectNoHorizontalScroll(page);

    await accountButton(page, user.username).click();
    await expect(page.getByRole("link", { name: "Account settings" })).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);

    await page.goto("/account");
    await expectNoHorizontalScroll(page);
  });
});
