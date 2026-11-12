import { themes } from "../lib/themes";
import { checkThemes, rgb } from "./checks";
import { expect, newUser, saveTheme, signUp, test } from "./fixtures";
import { card, grid, openShows, section, tab, viewHeading } from "./shows";

// The themes (lib/themes.ts, with their colors in components/common/themes.module.css):
// each one is picked and saved in Account, colors the page, and
// passes axe wherever the apps put its colors together.

test("every theme saves from Account, and colors the page, the page behind it and the browser's UI", async ({ page }) => {
  // A dozen saves or more.
  test.slow();
  await signUp(page, newUser());
  await expect(page).toHaveURL("/apps");
  await page.goto("/account");
  const shell = page.locator("[data-theme]");
  const form = page.getByRole("region", { name: "Theme", exact: true });
  await form.getByRole("heading", { name: "Theme", exact: true }).click();
  // New accounts start in the default theme.
  await expect(form.getByRole("radio", { name: "Light mode", exact: true })).toBeChecked();
  // All in one list, in lib/themes.ts's order, with no headings between them.
  const radios = form.getByRole("radio");
  await expect(radios).toHaveCount(themes.length);
  for (const [index, { name }] of themes.entries()) await expect(radios.nth(index)).toHaveAccessibleName(name);
  await expect(form.getByRole("heading")).toHaveText(["Theme"]);
  // Each one's name and sample, nothing else: no badges.
  await expect(form.locator("label svg")).toHaveCount(0);

  // Each one differs from the one before, so the page changes with every save.
  for (const { id, name, background } of themes) {
    await saveTheme(page, name);
    await expect(shell).toHaveAttribute("data-theme", id);
    await expect(form.getByRole("status")).toHaveText("Theme saved.");
    await expect(form.getByRole("radio", { name, exact: true })).toBeChecked();
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
  for (const app of ["/shows", "/shared"]) {
    await page.goto(app);
    await expect(shell).toHaveAttribute("data-theme", last.id);
    await expect(shell).toHaveCSS("background-color", rgb(last.background));
  }
});

// axe in all the themes, on the views that between them have every pair of
// their colors: text, secondary text and the accent on the page, cards, hover
// and selected backgrounds; buttons; the spaces' colors (Calendar).
test.describe("in every theme, axe finds nothing serious", () => {
  // The colors are the same at any size; views.spec.ts checks the phone's layout.
  test.skip(({ isMobile }) => isMobile, "colors don't change with the screen size");
  test.beforeEach(() => test.slow());

  test("the theme picker, in Account", async ({ page }) => {
    await signUp(page, newUser());
    await expect(page).toHaveURL("/apps");
    await page.goto("/account");
    const form = page.getByRole("region", { name: "Theme", exact: true });
    // With the keyboard: the mouse would leave the row hovered, which fades between themes.
    await form.locator("summary").press("Enter");
    await expect(form.locator("details")).toHaveAttribute("open", "");
    await checkThemes(page, "Account, the theme picker");
  });

  test("Shared: Calendar and Tasks, with an event and a task open", async ({ page }) => {
    await signUp(page, newUser(), "/signup?next=/shared");
    await page.getByRole("button", { name: "Create space" }).click();
    await expect(viewHeading(page)).toHaveText("Calendar");
    await page.getByRole("button", { name: "Add event", exact: true }).click();
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
      await page.getByLabel("Write a task").fill(title);
      await page.getByLabel("Write a task").press("Enter");
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

  test("Shows: a title in the library, and the Watchlist", async ({ page }) => {
    await openShows(page);
    await tab(page, "Discover").click();
    const popular = grid(page, "Popular TV shows");
    await expect(card(popular, "Harbor Lights")).toBeVisible();
    await expect(page.getByTestId("skeleton").filter({ visible: true })).toHaveCount(0);
    await card(popular, "Harbor Lights").click();
    const title = page.getByRole("dialog", { name: "Harbor Lights" });
    await title.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Watching" }).click();
    await expect(title.getByRole("status")).toHaveText("In your library");
    await page.goBack();
    await expect(title).toBeHidden();

    await tab(page, "Watchlist").click();
    const harbor = card(grid(section(page, "Watching"), "Watching TV shows"), "Harbor Lights");
    await harbor.click();
    const detail = page.getByRole("dialog", { name: "Harbor Lights" });
    await expect(detail.getByRole("group", { name: "Progress" })).toBeVisible();
    await page.mouse.move(0, 0);
    await checkThemes(page, "a title in the library");
    await page.goBack();
    await expect(detail).toBeHidden();
    await expect(harbor).toBeVisible();
    await checkThemes(page, "Watchlist, with a title Watching");
  });
});
