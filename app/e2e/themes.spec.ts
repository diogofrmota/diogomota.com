import { type Page } from "@playwright/test";
import { themes } from "../lib/themes";
import { checkThemes, rgb } from "./checks";
import { expect, newUser, openSettings, signUp, test } from "./fixtures";
import { card, grid, openShows, section, tab, viewHeading } from "./shows";

// The themes (lib/themes.ts, with their colors in components/common/themes.module.css):
// each one is picked and saved in Settings or Account, colors the page, and
// passes axe wherever the apps put its colors together.

const theme = (id: string) => themes.find((info) => info.id === id)!;

/**
 * The response of the server action that saves the theme picked in Settings,
 * which starts once the action has run: its headers say whether it revalidated,
 * which it only does once the theme is saved (see app-shell.spec.ts).
 */
async function pickInSettings(page: Page, name: string) {
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && "next-action" in response.request().headers(),
  );
  await page.getByRole("radio", { name, exact: true }).check();
  expect((await saved).headers()["x-action-revalidated"]).toBeTruthy();
}

test("every theme saves from Settings, and colors the page, the page behind it and the browser's UI", async ({ page }) => {
  // Two dozen saves.
  test.slow();
  await openShows(page);
  await openSettings(page, "Shows");
  const shell = page.locator("[data-theme]");

  for (const { id, name, background } of themes) {
    await pickInSettings(page, name);
    await expect(shell).toHaveAttribute("data-theme", id);
    await expect(page.getByRole("radio", { name, exact: true })).toBeChecked();
    // Its own colors, not the default's: themes.module.css has the theme, with
    // the background lib/themes.ts gives the browser.
    await expect(shell).toHaveCSS("background-color", rgb(background));
    await expect(page.locator("html")).toHaveCSS("background-color", rgb(background));
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", background);
  }

  // The last one is the account's: in the page as served, and in the apps.
  const last = themes.at(-1)!;
  const response = await page.reload();
  expect(await response!.text()).toContain(`data-theme="${last.id}"`);
  await expect(page.getByRole("radio", { name: last.name, exact: true })).toBeChecked();
  await page.goto("/shows");
  await expect(shell).toHaveAttribute("data-theme", last.id);
  await expect(shell).toHaveCSS("background-color", rgb(last.background));
});

test("Account settings save any theme, and the apps open in it", async ({ page }) => {
  await signUp(page, newUser());
  await expect(page).toHaveURL("/apps");
  await page.goto("/account");
  const shell = page.locator("[data-theme]");
  const form = page.getByRole("region", { name: "Theme", exact: true });
  await form.getByRole("heading", { name: "Theme", exact: true }).click();
  await expect(form.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  // Grouped under headings, with every theme in one of them.
  await expect(form.getByRole("group", { name: "Palettes" }).getByRole("radio")).toHaveCount(11);
  await expect(form.getByRole("radio")).toHaveCount(themes.length);

  for (const { id, name, background } of [theme("earth-tones"), theme("vivid-nightfall")]) {
    await form.getByRole("radio", { name, exact: true }).check();
    await form.getByRole("button", { name: "Save theme" }).click();
    await expect(shell).toHaveAttribute("data-theme", id);
    await expect(form.getByRole("status")).toHaveText("Theme saved.");
    await expect(shell).toHaveCSS("background-color", rgb(background));
    await expect(form.getByRole("radio", { name, exact: true })).toBeChecked();
  }

  await page.goto("/shows");
  await expect(shell).toHaveAttribute("data-theme", "vivid-nightfall");
  await expect(shell).toHaveCSS("background-color", rgb(theme("vivid-nightfall").background));
});

// axe in all the themes, on the views that between them have every pair of
// their colors: text, secondary text and the accent on the page, cards, hover
// and selected backgrounds; buttons; the spaces' colors (Calendar); stars.
test.describe("in every theme, axe finds nothing serious", () => {
  // The colors are the same at any size; views.spec.ts checks the phone's layout.
  test.skip(({ isMobile }) => isMobile, "colors don't change with the screen size");
  test.beforeEach(() => test.slow());

  test("the theme pickers, in Account and Settings", async ({ page }) => {
    await signUp(page, newUser());
    await expect(page).toHaveURL("/apps");
    await page.goto("/account");
    const form = page.getByRole("region", { name: "Theme", exact: true });
    // With the keyboard: the mouse would leave the row hovered, which fades between themes.
    await form.locator("summary").press("Enter");
    await expect(form.locator("details")).toHaveAttribute("open", "");
    await checkThemes(page, "Account, the theme picker");

    await openSettings(page, "Shows");
    await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
    await checkThemes(page, "Settings, Shows");
  });

  test("Shared: Calendar and Tasks, with an event and a task open", async ({ page }) => {
    await signUp(page, newUser(), "/signup?next=/shared");
    await page.getByLabel("Space name").fill("Themes");
    await page.getByRole("button", { name: "Create a Space" }).click();
    await expect(viewHeading(page)).toHaveText("Calendar");
    await page.getByRole("button", { name: "+ Add event" }).click();
    const newEvent = page.getByRole("dialog", { name: "New event" });
    await newEvent.getByLabel("Title").fill("Dinner");
    await newEvent.getByRole("button", { name: "Save event" }).click();
    await expect(newEvent).toBeHidden();
    await checkThemes(page, "Calendar, with an event");

    await page.getByRole("button", { name: /^Dinner, 09:00/ }).click();
    const event = page.getByRole("dialog", { name: "Dinner" });
    await expect(event.getByRole("button", { name: "Edit event" })).toBeVisible();
    await checkThemes(page, "event");
    await page.goBack();
    await expect(event).toBeHidden();

    await page.getByRole("navigation", { name: "Shared", exact: true }).getByRole("button", { name: "Tasks", exact: true }).click();
    await page.getByLabel("List name").fill("Groceries");
    await page.getByRole("button", { name: "Create list" }).click();
    for (const title of ["Apples", "Bread"]) {
      await page.getByLabel("Add a task").fill(title);
      await page.getByLabel("Add a task").press("Enter");
    }
    await page.getByRole("checkbox", { name: "Bread" }).click();
    await page.getByText("Done (1)").click();
    await expect(page.getByRole("list", { name: "Done" }).getByRole("checkbox", { name: "Bread" })).toBeChecked();
    // Once saved: "Saving…" fades in when saving is slow, and axe would catch it half faded.
    await expect(page.getByText("Saving…")).toHaveCount(0);
    await checkThemes(page, "Tasks");

    await page.getByRole("button", { name: /^Apples/ }).click();
    await expect(page.getByRole("dialog", { name: "Edit task" })).toBeVisible();
    await checkThemes(page, "task");
  });

  test("Shows: a rated title in the library, and Home", async ({ page }) => {
    await openShows(page);
    await tab(page, "Discover").click();
    const popular = grid(page, "Popular TV shows");
    await expect(card(popular, "Harbor Lights")).toBeVisible();
    await expect(page.getByTestId("skeleton")).toHaveCount(0);
    await card(popular, "Harbor Lights").click();
    const title = page.getByRole("dialog", { name: "Harbor Lights" });
    await title.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Watching" }).click();
    await expect(title.getByRole("status")).toHaveText("✓ In your library");
    await page.goBack();
    await expect(title).toBeHidden();

    await tab(page, "Home").click();
    const harbor = card(grid(section(page, "Watching"), "Watching TV shows"), "Harbor Lights");
    await harbor.click();
    const detail = page.getByRole("dialog", { name: "Harbor Lights" });
    const rating = detail.getByRole("group", { name: "Your rating" });
    await rating.getByRole("button", { name: "3 stars" }).click();
    await expect(rating.getByRole("button", { name: "3 stars" })).toHaveAttribute("aria-pressed", "true");
    // Off the stars: hovered, they all light up.
    await page.mouse.move(0, 0);
    await checkThemes(page, "a rated title in the library");
    await page.goBack();
    await expect(detail).toBeHidden();
    await expect(harbor).toBeVisible();
    await checkThemes(page, "Home, with a rated title");
  });
});
