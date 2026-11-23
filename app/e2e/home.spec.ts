import type { Page } from "@playwright/test";
import { apps, appsOf, folders } from "../lib/apps";
import { siteTagline } from "../lib/site";
import { expect, homeLink, linkNames, newUser, signUp, test } from "./fixtures";
import { mockBase, otherPerson, userId } from "./shows";

// Home (docs/decisions/0014, 0016, 0023). Logged out, the website's front
// page: its header, what the site is, Sign up, the apps in three groups (an
// app's icon opens its login prompt), How it works, Add to Home Screen,
// and its footer. Logged in, with no top bar: who is here (the picture, the
// name, the username and Account settings), then the apps in three folders,
// each opening in a popup, with what is waiting in each.

/** The front page's group of apps with this title: For Couples, Trackers, Health. */
const appGroup = (page: Page, title: string) =>
  page
    .getByRole("main")
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
/** An app's icon on the front page, which opens its login prompt. */
const appIcon = (page: Page, name: string) =>
  page.getByRole("main").getByRole("region", { name: "The apps" }).getByRole("link", { name, exact: true });
const siteNav = (page: Page) => page.getByRole("banner").getByRole("navigation", { name: "Site" });

test("logged out, home is the website's front page (/apps redirects to it): what the site is, the apps in groups, How it works, Add to Home Screen", async ({
  page,
}) => {
  // /apps is now home: it redirects there for good, with its query.
  const redirect = await page.request.get("/apps?next=%2Fshows", { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("/?next=%2Fshows");
  await page.goto("/apps?account=deleted");
  await expect(page).toHaveURL("/?account=deleted");
  await expect(page.getByRole("status")).toHaveText("Your account and everything it had here were deleted.");

  await page.goto("/");
  await expect(page).toHaveTitle("diogo mota");
  // Logged out, in Light.
  await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "minimal-neutrals");
  const main = page.getByRole("main");
  const hero = main.getByRole("region", { name: siteTagline });
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText("Small apps to share with friends");
  await expect(hero).toContainText("Shared calendar, Fitness app and Shows Tracker!");
  await expect(hero.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
  await expect(hero.getByRole("link", { name: "Login", exact: true })).toHaveAttribute("href", "/login");
  // Only the buttons: no "Have an account? Log in" under them, and no pictures of the apps.
  await expect(hero.getByText("Have an account?")).toHaveCount(0);
  await expect(main.getByText(/^diogomota\.com\//)).toHaveCount(0);

  // The apps in three groups, side by side: each its title, its apps' small icons (each its name under
  // it, and where its link on the site lands), and a line or so about them, each after a tick.
  expect(apps.map((app) => app.name)).toEqual(["Calendar", "Tasks", "Recipes", "Shows", "Books", "Fitness"]);
  const groups = [
    { title: "For Couples", apps: ["Calendar", "Tasks", "Recipes"], points: 2 },
    { title: "Trackers", apps: ["Shows", "Books"], points: 2 },
    { title: "Health", apps: ["Fitness"], points: 2 },
  ];
  await expect(main.getByRole("region", { name: "The apps" }).getByRole("article")).toHaveCount(3);
  const tops: number[] = [];
  for (const group of groups) {
    const article = appGroup(page, group.title);
    await expect(article.getByRole("link")).toHaveText(group.apps);
    await expect(article.locator("li svg")).toHaveCount(group.points);
    tops.push((await article.boundingBox())!.y);
    for (const name of group.apps) {
      const app = apps.find((app) => app.name === name)!;
      const icon = article.getByRole("link", { name, exact: true });
      await expect(icon.locator("..")).toHaveAttribute("id", app.href.slice(1));
      const logo = icon.locator("img");
      await expect(logo).toHaveAttribute("src", app.logo);
      expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      // Small, as before: 36 px, its name under it.
      const image = (await logo.boundingBox())!;
      expect(image.width).toBe(36);
      const label = (await icon.getByText(name).boundingBox())!;
      expect(label.y).toBeGreaterThanOrEqual(image.y + image.height);
    }
  }
  expect(new Set(tops).size).toBe(1);

  // How it works, in three steps, each its number beside its title.
  const steps = main.getByRole("region", { name: "How it works" });
  await expect(steps.getByRole("listitem")).toHaveCount(3);
  await expect(steps.getByRole("heading", { level: 3 })).toHaveText(["Sign up", "Pick an app", "Invite your friends"]);
  await expect(steps).toContainText(
    "Invite your partner to your group in For Couples, or add friends in Shows or Books to share what you read and watch.",
  );
  const title = steps.getByRole("heading", { level: 3 }).first();
  await expect(title).toHaveCSS("font-size", "24px");
  const number = (await steps.getByRole("listitem").first().getByText("1", { exact: true }).boundingBox())!;
  const words = (await title.boundingBox())!;
  expect(words.x).toBeGreaterThan(number.x + number.width);
  expect(Math.abs(words.y + words.height / 2 - (number.y + number.height / 2))).toBeLessThan(3);

  // No Questions any more: Add to Home Screen, a slide a step.
  await expect(main.getByRole("region", { name: "Questions" })).toHaveCount(0);
  const guide = main.getByRole("region", { name: "Add to Home Screen" });
  const slides = guide.locator("[aria-roledescription='slide']");
  await expect(slides).toHaveCount(6);
  await expect(slides.first()).toHaveAccessibleName("Step 1 of 6");
  await expect(slides.first().getByRole("heading")).toHaveText("Open diogomota.com in Safari");
  const previous = guide.getByRole("button", { name: "Previous step" });
  const next = guide.getByRole("button", { name: "Next step" });
  const dots = guide.locator("[data-current]");
  // The slide showing is the one at the left edge of the steps (the page may scroll to the buttons).
  const track = guide.getByRole("group", { name: "Steps" });
  const showing = (i: number) =>
    expect
      .poll(async () => Math.abs((await slides.nth(i).boundingBox())!.x - (await track.boundingBox())!.x))
      .toBeLessThanOrEqual(1);
  await guide.scrollIntoViewIfNeeded();
  await showing(0);
  await expect(previous).toBeDisabled();
  await expect(dots).toHaveCount(1);
  await next.click();
  await showing(1);
  await expect(slides.nth(0)).not.toBeInViewport();
  await expect(previous).toBeEnabled();
  // The keys, on the steps: End to the last, which has no Next; the arrows one at a time.
  await track.press("End");
  await showing(5);
  await expect(slides.nth(5).getByRole("heading")).toHaveText("Open it from your Home Screen");
  await expect(next).toBeDisabled();
  await track.press("ArrowLeft");
  await showing(4);
  await expect(next).toBeEnabled();
  await previous.click();
  await showing(3);

  // And Sign up once more, at the end, with the footer close under it.
  const band = main.getByRole("region", { name: "Try it now and join the community" });
  await expect(band.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");

  // Only the year and build version remain in the footer, on the page's own gray (not a white band).
  const footer = page.getByRole("contentinfo");
  const bandBox = (await band.boundingBox())!;
  expect((await footer.boundingBox())!.y - (bandBox.y + bandBox.height)).toBeLessThanOrEqual(32);
  await expect(footer).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(footer.getByRole("link")).toHaveCount(0);
  await expect(footer.locator("span")).toHaveCount(2);
  await expect(footer).toContainText(`© ${new Date().getFullYear()} Diogo Mota`);
  await expect(footer.getByText(/^Version (dev|v\d+\.\d+\.\d+)$/)).toBeVisible();

  // The site's description and preview say what it is.
  const meta = (attribute: string, value: string) => page.locator(`head meta[${attribute}="${value}"]`);
  await expect(meta("name", "description")).toHaveAttribute(
    "content",
    "Small apps to share with friends: Calendar, Tasks, Recipes, Shows, Books, and Fitness.",
  );
  await expect(meta("property", "og:url")).toHaveAttribute("content", "https://diogomota.com");
  const image = await page.request.get("/opengraph-image");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toBe("image/png");

  await hero.getByRole("link", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
});

test("the website's header: the mark goes home, Apps opens a menu of them, then About; Log in and Sign up", async ({
  page,
}) => {
  await page.goto("/");
  // The website's header, not the apps' top bar.
  await expect(homeLink(page)).toHaveCount(0);
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "diogomota" })).toHaveAttribute("href", "/");
  await expect(header.getByRole("button", { name: "Menu" })).toBeHidden();
  const nav = siteNav(page);
  const appsButton = nav.getByRole("button", { name: "Apps" });
  await expect(appsButton).toHaveAttribute("aria-expanded", "false");
  expect(await linkNames(nav)).toEqual(["How it works", "About"]);
  await expect(nav.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/#how-it-works");
  // As everywhere, Log in first and plain, then Sign up, the call to action.
  const login = (await header.getByRole("link", { name: "Log in" }).boundingBox())!;
  const signup = (await header.getByRole("link", { name: "Sign up" }).boundingBox())!;
  expect(Math.abs(login.y + login.height / 2 - (signup.y + signup.height / 2))).toBeLessThan(2);
  expect(signup.x).toBeGreaterThan(login.x + login.width);

  // Apps: each app, its icon, name and what it is, to its section; Escape closes it, back on Apps.
  await appsButton.click();
  await expect(appsButton).toHaveAttribute("aria-expanded", "true");
  for (const app of apps) {
    const link = nav.getByRole("link", { name: `${app.name} ${app.description}` });
    await expect(link).toHaveAttribute("href", `/#${app.href.slice(1)}`);
  }
  await page.keyboard.press("Escape");
  await expect(nav.getByRole("link", { name: /^Shows/ })).toBeHidden();
  await expect(appsButton).toBeFocused();
  // A click outside closes it too; following one goes to its section, and closes it.
  await appsButton.click();
  await page.mouse.click(5, 300);
  await expect(nav.getByRole("link", { name: /^Shows/ })).toBeHidden();
  await appsButton.click();
  await nav.getByRole("link", { name: /^Shows/ }).click();
  await expect(page).toHaveURL("/#shows");
  await expect(nav.getByRole("link", { name: /^Shows/ })).toBeHidden();
  // Its icon, with its group's title over it, clear of the sticky header.
  await expect(appIcon(page, "Shows")).toBeInViewport();
  const groupTitle = (await appGroup(page, "Trackers").getByRole("heading").boundingBox())!;
  expect(groupTitle.y).toBeGreaterThanOrEqual((await page.getByRole("banner").boundingBox())!.height);

  await nav.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL("/about");
  await expect(siteNav(page).getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");

  // Log in leaves the website for the login page, in the apps' frame, whose ‹ Home comes back.
  await page.getByRole("banner").getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
  await homeLink(page).click();
  await expect(page).toHaveURL("/");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the header is the mark, Sign up and Menu, which has the site's links and then the apps; the groups one over the other", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(siteNav(page)).toBeHidden();
    await expect(header.getByRole("link", { name: "Log in" })).toBeHidden();
    await expect(header.getByRole("link", { name: "Sign up" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Login", exact: true })).toHaveAttribute(
      "href",
      "/login",
    );
    // The groups, one over the other, each with its apps' icons.
    const [couples, trackers, health] = await Promise.all(
      ["For Couples", "Trackers", "Health"].map(async (title) => (await appGroup(page, title).boundingBox())!),
    );
    expect(trackers.y).toBeGreaterThan(couples.y + couples.height);
    expect(health.y).toBeGreaterThan(trackers.y + trackers.height);
    for (const app of apps) await expect(appIcon(page, app.name)).toBeVisible();

    await header.getByRole("button", { name: "Menu" }).click();
    const menu = header.getByRole("navigation", { name: "Menu" });
    expect(await linkNames(menu)).toEqual([
      "How it works",
      "About",
      "Privacy",
      "Log in",
      ...apps.map((app) => `${app.name} ${app.description}`),
    ]);
    // Nothing of it off the screen.
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await menu.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");

    await page.goto("/");
    await expect(page.getByRole("contentinfo").getByRole("link")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The guide's steps swipe sideways, one at a time, within the page.
    const guide = page.getByRole("main").getByRole("region", { name: "Add to Home Screen" });
    const steps = guide.getByRole("group", { name: "Steps" });
    await steps.scrollIntoViewIfNeeded();
    await steps.evaluate((element) => element.scrollTo({ left: element.clientWidth, behavior: "instant" }));
    await expect(guide.locator("[aria-roledescription='slide']").nth(1)).toBeInViewport({ ratio: 0.9 });
    await expect(guide.getByRole("button", { name: "Previous step" })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("main").getByRole("link", { name: "Login", exact: true }).click();
    await expect(page).toHaveURL("/login");
  });
});

test("the login pages have the apps' top bar, with only ‹ Home (to the front page); Log in and Sign up link to each other", async ({
  page,
}) => {
  await page.goto("/login");
  // Logged out: ‹ Home and nothing else, no tabs and no Back to apps.
  expect(await linkNames(page.getByRole("banner"))).toEqual(["Home"]);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to apps" })).toHaveCount(0);

  const main = page.getByRole("main");
  await main.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");
  expect(await linkNames(page.getByRole("banner"))).toEqual(["Home"]);
  await main.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL("/login");
  await homeLink(page).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "diogomota" })).toBeVisible();

  // From an app's login prompt, the title says which app.
  await page.goto("/signup?next=%2Fshows");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign up to use Shows");
  await page.goto("/login?next=%2Fcalendar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in to open Calendar");
});

test("each app's icon on the front page opens its login prompt, which closes with Escape, its close button or the backdrop", async ({
  page,
}) => {
  await page.goto("/");
  for (const app of apps) {
    const open = appIcon(page, app.name);
    await open.click();
    const prompt = page.getByRole("dialog", { name: `Log in to open ${app.name}` });
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL("/");
    // What the app is for, under the title.
    await expect(prompt.getByRole("paragraph")).toHaveText(app.description);
    const next = new URLSearchParams({ next: app.href });
    await expect(prompt.getByRole("link", { name: "Log in" })).toHaveAttribute("href", `/login?${next}`);
    await expect(prompt.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", `/signup?${next}`);
    await page.keyboard.press("Escape");
    await expect(prompt).toBeHidden();
    await expect(open).toBeFocused();
  }

  const link = appIcon(page, "Calendar");
  const prompt = page.getByRole("dialog");
  await link.click();
  await prompt.getByRole("button", { name: "Close" }).click();
  await expect(prompt).toBeHidden();
  await link.click();
  await page.mouse.click(5, 5);
  await expect(prompt).toBeHidden();
  await expect(page).toHaveURL("/");

  await link.click();
  await prompt.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL("/login?next=%2Fcalendar");
});

test("logged in, / is who is here and the apps in three folders, no tab bar, and the email note sends its link from here", async ({
  page,
}) => {
  const user = newUser();
  await signUp(page, user);
  // Signing up with nowhere to go next lands on /.
  await expect(page).toHaveURL("/");
  const main = page.getByRole("main");
  // At the top, in the middle: the picture (the initials, without one), the name, (@username) and Account settings.
  const heading = main.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(user.name);
  await expect(heading).toHaveCSS("text-align", "center");
  await expect(main.getByText(`(@${user.username})`, { exact: true })).toBeVisible();
  const account = main.getByRole("link", { name: "Account settings", exact: true });
  await expect(account).toHaveAttribute("href", "/account");
  // No header and no tab bar: the profile and the folders are the way to everything.
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);

  // Once they have come in (anything that turns for as long as it waits aside).
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  const centre = (box: { x: number; width: number }) => box.x + box.width / 2;
  for (const part of [heading, account])
    expect(Math.abs(centre((await part.boundingBox())!) - width / 2)).toBeLessThanOrEqual(2);

  // Under it, the three folders in a row, in the middle: each its apps' small icons, its name, and what is in it.
  const buttons = folders.map((folder) => main.getByRole("button", { name: folder.title, exact: true }));
  const boxes = await Promise.all(buttons.map(async (button) => (await button.boundingBox())!));
  for (const box of boxes) expect(box.y).toBe(boxes[0].y);
  expect(boxes[0].y).toBeGreaterThan((await account.boundingBox())!.y);
  expect(Math.abs((boxes[0].x + boxes[2].x + boxes[2].width) / 2 - width / 2)).toBeLessThanOrEqual(2);
  for (const [i, folder] of folders.entries()) {
    await expect(buttons[i]).toHaveAttribute("aria-haspopup", "dialog");
    await expect(buttons[i].locator("img")).toHaveCount(folder.apps.length);
    const names = new Intl.ListFormat("en", { type: "conjunction" }).format(appsOf(folder).map((app) => app.name));
    await expect(buttons[i]).toHaveAccessibleDescription(
      folder.private ? `${names}. Private group: only you and your partner.` : `${names}.`,
    );
    // For Couples, the group's, has a lock in its top right corner.
    await expect(buttons[i].locator("[class*='lock']")).toHaveCount(folder.private ? 1 : 0);
  }
  const lock = (await buttons[0].locator("[class*='lock']").boundingBox())!;
  const tile = (await buttons[0].locator("[class*='tile']").boundingBox())!;
  expect(lock.x + lock.width).toBeGreaterThan(tile.x + tile.width);
  expect(lock.y).toBeLessThan(tile.y);
  // The small icons, square, two to a row from the top left: the first row as high in every folder, and For
  // Couples' third app, on a second row, as far from the tile's bottom as the first row is from its top.
  const minis = await Promise.all(
    buttons.map((button) =>
      button.locator("[class*='tile']").evaluate((element) => {
        const tile = element.getBoundingClientRect();
        return [...element.querySelectorAll("img")].map((img) => {
          const box = img.getBoundingClientRect();
          return { top: box.top - tile.top, bottom: tile.bottom - box.bottom, width: box.width, height: box.height };
        });
      }),
    ),
  );
  for (const icons of minis) {
    expect(Math.abs(icons[0].top - minis[0][0].top)).toBeLessThanOrEqual(0.5);
    for (const icon of icons) expect(Math.abs(icon.width - icon.height)).toBeLessThanOrEqual(0.5);
  }
  const third = minis[0][2];
  expect(third.top).toBeGreaterThan(minis[0][0].top + minis[0][0].height);
  expect(Math.abs(third.bottom - minis[0][0].top)).toBeLessThanOrEqual(1);

  // A folder opens in a popup, at its own URL: its apps, each straight into its app, with what it is for.
  const [, trackers, health] = buttons;
  await trackers.click();
  const popup = page.getByRole("dialog", { name: "Trackers" });
  await expect(page).toHaveURL("/?p=folder%3Atrackers");
  for (const app of appsOf(folders[1])) {
    const link = popup.getByRole("link", { name: app.name, exact: true });
    await expect(link).toHaveAttribute("href", app.href);
    await expect(link).toHaveAccessibleDescription(app.description);
    await expect(link.locator("img")).toHaveAttribute("src", app.logo);
  }
  await expect(trackers).toHaveAttribute("aria-expanded", "true");
  // Escape closes it, back where it was; so does Back.
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(page).toHaveURL("/");
  await expect(trackers).toBeFocused();
  await trackers.click();
  await expect(popup).toBeVisible();
  await page.goBack();
  await expect(popup).toBeHidden();
  await expect(page).toHaveURL("/");
  // A link opens one, and closing it stays on home.
  await page.goto("/?p=folder:health");
  const fitness = page.getByRole("dialog", { name: "Health" });
  await expect(fitness.getByRole("link", { name: "Fitness", exact: true })).toHaveAttribute("href", "/fitness");
  await fitness.getByRole("button", { name: "Close" }).click();
  await expect(fitness).toBeHidden();
  await expect(page).toHaveURL("/");
  await expect(health).toBeVisible();

  // For Couples, before there is a group, offers one; once made, its apps, and the way to the group's settings.
  await buttons[0].click();
  const couples = page.getByRole("dialog", { name: "For Couples" });
  await expect(couples).toContainText("Private group: only you and your partner.");
  await expect(couples.getByRole("link")).toHaveCount(0);
  await couples.getByRole("button", { name: "Create a group" }).click();
  for (const app of appsOf(folders[0]))
    await expect(couples.getByRole("link", { name: app.name, exact: true })).toHaveAttribute("href", app.href);
  await couples.getByRole("link", { name: "Group settings" }).click();
  await expect(page).toHaveURL("/couples");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Group settings");
  await expect(main.getByRole("region", { name: "Invite your partner" })).toBeVisible();
  // Back: home, with the folder open, as it was left.
  await page.goBack();
  await expect(couples.getByRole("link", { name: "Calendar", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(couples).toBeHidden();

  // Version, Privacy and Report a bug at the bottom of the page, well under the folders.
  const footer = (await main.getByText(/^Version (dev|v\d+\.\d+\.\d+) · Privacy · Report a bug$/).boundingBox())!;
  await expect(main.getByRole("link", { name: "Report a bug" })).toHaveAttribute("href", "/report-bug");
  await expect(main.getByRole("link", { name: "About" })).toHaveCount(0);
  const height = await page.evaluate(() => innerHeight);
  expect(footer.y).toBeGreaterThan(height - 100);
  expect(footer.y + footer.height).toBeLessThanOrEqual(height);
  // Nothing waiting yet: no badges.
  await expect(page.getByRole("main").locator("[class*='badge']")).toHaveCount(0);

  // Not confirmed yet: Send it again sends another link here, and says so.
  const note = page.getByRole("main").locator("form").filter({ hasText: "Confirm your email" });
  await expect(note).toContainText(user.email);
  await note.getByRole("button", { name: "Send it again" }).click();
  await expect(note.getByRole("button", { name: "Sent" })).toBeDisabled();
  await expect(note.getByRole("status")).toHaveText(`We sent a new link to ${user.email}.`);
  await expect(page).toHaveURL("/");
  await account.click();
  await expect(page).toHaveURL("/account");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Account");
});

test("For Couples' apps moved: their old addresses go to the new ones for good, with their open panels", async ({
  page,
}) => {
  for (const [from, to] of [
    ["/shared", "/calendar"],
    ["/shared?p=event%3Aabc", "/calendar?p=event%3Aabc"],
    ["/shared/tasks", "/tasks"],
    ["/shared/tasks?p=task%3Aabc", "/tasks?p=task%3Aabc"],
    ["/shared/settings", "/couples"],
    ["/shared/anything", "/calendar"],
    ["/benfica/games", "/couples"],
  ]) {
    const response = await page.request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(308);
    expect(response.headers().location, from).toBe(to);
  }
});

test("badges: Tasks' due for you, Recipes' to buy, Shows' friend requests and new recommendations, added up on their folders", async ({
  page,
  browser,
}) => {
  const me = newUser();
  await signUp(page, me);
  await expect(page).toHaveURL("/");
  const meId = await userId(me.username);
  const folder = (title: string) => page.getByRole("main").getByRole("button", { name: new RegExp(`^${title}\\b`) });
  /** An app's icon, in its folder's popup, opened for it. */
  const icon = async (title: string, name: string) => {
    if (!(await page.getByRole("dialog", { name: title }).isVisible())) await folder(title).click();
    return page.getByRole("dialog", { name: title }).getByRole("link", { name: new RegExp(`^${name}\\b`) });
  };

  // Tasks: due today or before, for me or for nobody; not later, not done, not someone else's.
  expect((await page.request.post("/api/shared/spaces", { data: {} })).ok()).toBe(true);
  const list = (await (await page.request.post("/api/shared/tasks/lists", { data: { name: "Home" } })).json()).data;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(
    new Date(Date.now() - 86_400_000),
  );
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(
    new Date(Date.now() + 86_400_000),
  );
  for (const task of [
    { title: "Rent", dueDate: today, assigneeIds: [meId] },
    { title: "Shelf", dueDate: yesterday },
    { title: "Later", dueDate: tomorrow },
    { title: "Done", dueDate: today, isComplete: true },
  ]) {
    const created = await page.request.post(`/api/shared/tasks/lists/${list.id}/tasks`, { data: task });
    expect(created.ok(), task.title).toBe(true);
  }
  // Recipes: what is left to buy on the group's list.
  const shopping = await page.request.post("/api/recipes/shopping", { data: { items: [{ text: "Bread" }] } });
  expect(shopping.ok()).toBe(true);
  await page.reload();
  // On For Couples' folder, added up, beside its lock along the top edge.
  await expect(folder("For Couples")).toHaveAccessibleName("For Couples, 3 waiting");
  const badge = (await folder("For Couples").locator("[class*='badge']").boundingBox())!;
  const lock = (await folder("For Couples").locator("[class*='lock']").boundingBox())!;
  expect(badge.x + badge.width).toBeLessThanOrEqual(lock.x + 1);
  expect(Math.abs(badge.y + badge.height / 2 - (lock.y + lock.height / 2))).toBeLessThan(3);
  await expect(folder("For Couples").getByText("3", { exact: true })).toBeVisible();
  // And on each app's icon in it; Calendar counts nothing.
  await expect(await icon("For Couples", "Tasks")).toHaveAccessibleName("Tasks, 2 tasks due");
  await expect((await icon("For Couples", "Tasks")).getByText("2", { exact: true })).toBeVisible();
  await expect(await icon("For Couples", "Recipes")).toHaveAccessibleName("Recipes, 1 to buy");
  await expect(await icon("For Couples", "Calendar")).toHaveAccessibleName("Calendar");
  await page.keyboard.press("Escape");
  await expect(folder("Trackers")).toHaveAccessibleName("Trackers");

  // Shows: a friend request waiting, then a friend's recommendation, which Discover then shows.
  const friend = await otherPerson(browser);
  expect((await friend.page.request.post("/api/social/friends", { data: { username: me.username } })).ok()).toBe(true);
  await page.reload();
  await expect(folder("Trackers")).toHaveAccessibleName("Trackers, 1 waiting");
  await expect(await icon("Trackers", "Shows")).toHaveAccessibleName("Shows, 1 new");
  await page.keyboard.press("Escape");

  expect((await page.request.post("/api/social/friends", { data: { username: friend.user.username } })).ok()).toBe(
    true,
  );
  const recommended = await friend.page.request.post("/api/shows/recommendations", {
    data: { friendId: meId, type: "tv", tmdbId: mockBase + 103 },
  });
  expect(recommended.ok()).toBe(true);
  await page.reload();
  await expect(await icon("Trackers", "Shows")).toHaveAccessibleName("Shows, 1 new");
  await page.keyboard.press("Escape");

  const seen = page.waitForResponse((response) => response.url().endsWith("/api/shows/recommendations/seen"));
  await page.goto("/shows/discover");
  await expect(page.getByRole("region", { name: "Recommended by Friends" })).toBeVisible();
  expect((await seen).ok()).toBe(true);
  await page.goto("/");
  await expect(folder("Trackers")).toHaveAccessibleName("Trackers");
  await expect(await icon("Trackers", "Shows")).toHaveAccessibleName("Shows");
  await friend.context.close();
});
