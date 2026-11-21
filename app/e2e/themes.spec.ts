import { themes } from "../lib/themes";
import { rgb } from "./checks";
import { withDatabase } from "./db";
import { accountSetting, expect, logIn, logOut, newUser, saveTheme, signUp, test } from "./fixtures";

// The themes (lib/themes.ts, with their colors in components/common/themes.module.css):
// each one is picked and saved in Account, colors the page, and stays the
// account's. views.spec.ts runs axe in every theme on every view.

test("every theme saves from Account, colors the page, the page behind it and the browser's UI, and stays the account's", async ({
  page,
}) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  const shell = page.locator("[data-theme]");
  const row = accountSetting(page, "Theme");
  await row.click();
  const form = page.getByRole("dialog", { name: "Theme", exact: true });
  // New accounts start in the default theme.
  await expect(form.getByRole("radio", { name: "Light", exact: true })).toBeChecked();
  // All in one list, in lib/themes.ts's order, with no headings between them.
  const radios = form.getByRole("radio");
  await expect(radios).toHaveCount(themes.length);
  for (const [index, { name }] of themes.entries()) await expect(radios.nth(index)).toHaveAccessibleName(name);
  await expect(form.getByRole("heading")).toHaveText(["Theme"]);
  // Each one's name and sample, nothing else: no badges.
  await expect(form.locator("label svg")).toHaveCount(0);

  // Each one differs from the one before, so the page changes with every save.
  for (const { id, name, background } of [...themes.slice(1), themes[0]]) {
    // Opens the popup, which closes once it's saved.
    await saveTheme(page, name);
    await expect(shell).toHaveAttribute("data-theme", id);
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Theme saved." })).toBeVisible();
    await expect(row).toContainText(name);
    // Its own colors, not the default's: themes.module.css has the theme, with
    // the background lib/themes.ts gives the browser.
    await expect(shell).toHaveCSS("background-color", rgb(background));
    await expect(page.locator("html")).toHaveCSS("background-color", rgb(background));
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", background);
  }

  // The account's theme is in the page as served, before any script runs (no
  // flash of another theme), in the apps and the pages around them.
  const dark = themes.find((theme) => theme.name === "Dark")!;
  await saveTheme(page, dark.name);
  for (const path of ["/shows", "/shared", "/", "/account"]) {
    const response = await page.goto(path);
    expect(await response!.text(), path).toContain(`data-theme="${dark.id}"`);
    await expect(shell).toHaveAttribute("data-theme", dark.id);
    await expect(page.locator("html")).toHaveCSS("background-color", rgb(dark.background));
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", dark.background);
  }

  // Still the account's after logging in again.
  await logOut(page, user.username);
  await logIn(page, user.username, user.password);
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  await expect(row).toContainText("Dark");
  await row.click();
  await expect(form.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();

  // A theme that no longer exists shows as Light.
  await withDatabase((db) =>
    db.query("UPDATE users SET theme_preference = 'space' WHERE username = $1", [user.username]),
  );
  await page.goto("/account");
  await expect(shell).toHaveAttribute("data-theme", "minimal-neutrals");
  await expect(row).toContainText("Light");
});
