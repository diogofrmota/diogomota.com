import type { Page } from "@playwright/test";
import { apps } from "../lib/apps";
import { siteTagline } from "../lib/site";
import { expect, linkNames, newUser, signUp, test } from "./fixtures";
import { mockBase, otherPerson, userId } from "./shows";

// Home (docs/decisions/0014, 0016). Logged out, the website's front page: its
// header, what the site is, Sign up, a section per app (Open opens its login
// prompt), How it works, Questions, and its footer. Logged in, "Diogo’s Apps":
// the apps' icons, with no tab bar, with what is waiting in each and going
// back to the view last used in it.

const appSection = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
const tabBar = (page: Page) => page.getByRole("navigation", { name: "Account" });
const siteNav = (page: Page) => page.getByRole("banner").getByRole("navigation", { name: "Site" });

test("/apps is now home: it redirects there for good, with its query", async ({ page }) => {
  const response = await page.request.get("/apps?next=%2Fshows", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("/?next=%2Fshows");
  await page.goto("/apps?account=deleted");
  await expect(page).toHaveURL("/?account=deleted");
  await expect(page.getByRole("status")).toHaveText("Your account and everything it had here were deleted.");
});

test("logged out, home is the website's front page: what the site is, the apps, How it works, Questions", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("diogo mota");
  // Logged out, in Light.
  await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "minimal-neutrals");
  const main = page.getByRole("main");
  const hero = main.getByRole("region", { name: siteTagline });
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText("Small apps to share with friends");
  await expect(hero).toContainText("Share your calendar and register your shows watchlist!");
  await expect(hero.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
  await expect(hero.getByRole("link", { name: "Login", exact: true })).toHaveAttribute("href", "/login");
  // Only the buttons: no "Have an account? Log in" under them, and no pictures of the apps.
  await expect(hero.getByText("Have an account?")).toHaveCount(0);
  await expect(hero.getByText(/^diogomota\.com\//)).toHaveCount(0);

  // A section per app, by its name: its icon, headline, what it does, and Open.
  expect(apps.map((app) => app.name)).toEqual(["Shared", "Shows", "Recipes", "Fitness"]);
  for (const app of apps) {
    const section = appSection(page, app.name);
    await expect(section).toHaveAttribute("id", app.href.slice(1));
    await expect(section).toContainText(app.tagline);
    for (const feature of app.features) await expect(section).toContainText(feature);
    const logo = section.getByRole("heading", { name: app.name }).locator("img");
    await expect(logo).toHaveAttribute("src", app.logo);
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(section.getByRole("link", { name: `Open ${app.name}` })).toBeVisible();
  }
  // Side by side, by turns: Shared's picture on the left, Shows' on the right, Recipes' on the left, Fitness' on the right.
  const pictureX = async (name: string) =>
    (await appSection(page, name).locator("[aria-hidden='true']").first().boundingBox())!.x;
  const wordsX = async (name: string) => (await appSection(page, name).getByRole("heading").boundingBox())!.x;
  expect(await pictureX("Shared")).toBeLessThan(await wordsX("Shared"));
  expect(await pictureX("Shows")).toBeGreaterThan(await wordsX("Shows"));
  expect(await pictureX("Recipes")).toBeLessThan(await wordsX("Recipes"));
  expect(await pictureX("Fitness")).toBeGreaterThan(await wordsX("Fitness"));

  // How it works, in three steps; Questions, with the way to About and Privacy.
  await expect(main.getByRole("region", { name: "How it works" }).getByRole("listitem")).toHaveCount(3);
  const questions = main.getByRole("region", { name: "Questions" });
  await expect(questions.getByRole("heading", { level: 3 })).toHaveText([
    "Who runs it?",
    "Is my data private?",
    "Can I use it on my phone?",
    "Can I take my data with me?",
  ]);
  await expect(questions).toContainText(
    "Diogo. The apps are made for friends and family, and anyone can sign up. More on the About page.",
  );
  await expect(questions.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
  await expect(questions.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  // And Sign up once more, at the end.
  await expect(
    main.getByRole("region", { name: "Try it now and join the community" }).getByRole("link", { name: "Sign up" }),
  ).toHaveAttribute("href", "/signup");

  // Only the year and build version remain in the footer, on the page's own gray (not a white band).
  const footer = page.getByRole("contentinfo");
  await expect(footer).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(footer.getByRole("link")).toHaveCount(0);
  await expect(footer.locator("span")).toHaveCount(2);
  await expect(footer).toContainText(`© ${new Date().getFullYear()} Diogo Mota`);
  await expect(footer.getByText(/^Version (dev|v\d+\.\d+\.\d+)$/)).toBeVisible();

  // The site's description and preview say what it is.
  const meta = (attribute: string, value: string) => page.locator(`head meta[${attribute}="${value}"]`);
  await expect(meta("name", "description")).toHaveAttribute(
    "content",
    "Small apps to share with friends: Shared, Shows, Recipes, and Fitness.",
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
  // The website's header, not the apps' tab bar.
  await expect(tabBar(page)).toHaveCount(0);
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
  await expect(appSection(page, "Shows")).toBeInViewport();

  await nav.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL("/about");
  await expect(siteNav(page).getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");

  // Log in leaves the website for the login page, in the apps' frame, whose Apps comes back.
  await page.getByRole("banner").getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
  await tabBar(page).getByRole("link", { name: "Apps" }).click();
  await expect(page).toHaveURL("/");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the header is the mark, Sign up and Menu, which has the rest; the apps' sections have no pictures", async ({
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
    // Each app's section is its words only: its picture is for wider screens.
    for (const app of apps) {
      await expect(appSection(page, app.name).getByRole("heading", { name: app.name })).toBeVisible();
      await expect(appSection(page, app.name).getByText(`diogomota.com${app.href}`)).toBeHidden();
    }

    await header.getByRole("button", { name: "Menu" }).click();
    const menu = header.getByRole("navigation", { name: "Menu" });
    expect(await linkNames(menu)).toEqual([
      ...apps.map((app) => `${app.name} ${app.description}`),
      "How it works",
      "About",
      "Privacy",
      "Log in",
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
    await page.getByRole("main").getByRole("link", { name: "Login", exact: true }).click();
    await expect(page).toHaveURL("/login");
  });
});

test("the login pages keep the apps' tab bar: Log in, Sign up (each its own icon) and Apps", async ({ page }) => {
  await page.goto("/login");
  const bar = tabBar(page);
  expect(await linkNames(bar)).toEqual(["Log in", "Sign up", "Apps"]);
  // No top bar and no Back to apps: the tab bar, with Log in current.
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to apps" })).toHaveCount(0);
  await expect(bar.getByRole("link", { name: "Log in" })).toHaveAttribute("aria-current", "page");
  const icons = await bar
    .getByRole("link")
    .evaluateAll((links) => links.flatMap((link) => link.querySelector("svg")?.innerHTML ?? []));
  expect(icons).toHaveLength(3);
  expect(new Set(icons).size).toBe(3);

  await bar.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");
  await expect(bar.getByRole("link", { name: "Sign up" })).toHaveAttribute("aria-current", "page");

  // From an app's login prompt, the title says which app.
  await page.goto("/signup?next=%2Fshows");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign up to use Shows");
  await page.goto("/login?next=%2Fshared");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in to open Shared");
});

test("sent home from a protected page, Log in and Sign up return there, and an app's prompt opens", async ({
  page,
}) => {
  await page.goto("/account");
  await expect(page).toHaveURL("/?next=%2Faccount");
  const hero = page.getByRole("main").getByRole("region", { name: siteTagline });
  await expect(hero.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup?next=%2Faccount");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Faccount");
  await expect(header.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup?next=%2Faccount");
  await expect(hero.getByRole("link", { name: "Login", exact: true })).toHaveAttribute(
    "href",
    "/login?next=%2Faccount",
  );

  await page.goto("/shows/discover");
  await expect(page).toHaveURL("/?next=%2Fshows%2Fdiscover");
  await expect(page.getByRole("dialog", { name: "Log in to open Shows" })).toBeVisible();
});

for (const app of apps) {
  test(`Open ${app.name} on the front page opens its login prompt`, async ({ page }) => {
    await page.goto("/");
    await appSection(page, app.name)
      .getByRole("link", { name: `Open ${app.name}` })
      .click();

    const prompt = page.getByRole("dialog", { name: `Log in to open ${app.name}` });
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL("/");
    // What the app is for, under the title.
    await expect(prompt.getByRole("paragraph")).toHaveText(app.description);

    const next = new URLSearchParams({ next: app.href });
    await expect(prompt.getByRole("link", { name: "Log in" })).toHaveAttribute("href", `/login?${next}`);
    await expect(prompt.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", `/signup?${next}`);

    await prompt.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(`/login?${next}`);
  });
}

test("the login prompt closes with Escape, its close button or the backdrop", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("main").getByRole("link", { name: "Open Shared" });
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
  await expect(page).toHaveURL("/");
});

test("logged in, / is the user's apps: their icons, no tab bar, and the email note sends its link from here", async ({
  page,
}) => {
  const user = newUser();
  await signUp(page, user);
  // Signing up with nowhere to go next lands on /.
  await expect(page).toHaveURL("/");
  const main = page.getByRole("main");
  const heading = main.getByRole("heading", { level: 1 });
  // The first word of the name: "Tester’s Apps".
  await expect(heading).toHaveText(`${user.name.split(" ")[0]}’s Apps`);
  await expect(heading).toHaveCSS("text-align", "center");
  // No header and no tab bar: the icons are the way to everything, Account among them.
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);

  // An icon for each app, straight into it, with what it is for read out with it.
  for (const app of apps) {
    const link = main.getByRole("link", { name: app.name, exact: true });
    await expect(link).toHaveAttribute("href", app.href);
    await expect(link).toHaveAccessibleDescription(app.description);
    await expect(link.locator("img")).toHaveAttribute("src", app.logo);
  }
  const account = main.getByRole("link", { name: "Account", exact: true });
  await expect(account).toHaveAttribute("href", "/account");
  await expect(account).toHaveAccessibleDescription("Manage your profile and account settings");
  await expect(account.locator("img")).toHaveAttribute("src", "/logos/account.svg");
  // Big icons, side by side in the middle of the page, under the heading (four to a row on a wide screen).
  // Once they have come in (anything that turns for as long as it waits aside).
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  const icons = await Promise.all(
    [...apps, { name: "Account" }].map(
      async (app) => (await main.getByRole("link", { name: app.name, exact: true }).locator("img").boundingBox())!,
    ),
  );
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  for (const icon of icons) expect(icon.width).toBeGreaterThanOrEqual(112);
  // The first row full, in the middle; the row under it, not full (Account), in the middle too.
  const middle = (left: { x: number }, right: { x: number; width: number }) => (left.x + right.x + right.width) / 2;
  const row = icons.slice(0, 4);
  for (const icon of row) expect(icon.y).toBe(icons[0].y);
  expect(Math.abs(middle(row[0], row[3]) - width / 2)).toBeLessThanOrEqual(2);
  const last = icons.at(-1)!;
  expect(last.y).toBeGreaterThan(icons[0].y);
  expect(Math.abs(middle(last, last) - width / 2)).toBeLessThanOrEqual(2);
  // Version and Privacy at the bottom of the page, well under the icons.
  const footer = (await main.getByText(/^Version (dev|v\d+\.\d+\.\d+) · Privacy$/).boundingBox())!;
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

test("an app's icon reopens the view last used in it, and Shared without a space its welcome", async ({ page }) => {
  await signUp(page, newUser());
  await expect(page).toHaveURL("/");

  await page.goto("/shows/discover");
  await expect(
    page.getByRole("navigation", { name: "Shows" }).getByRole("button", { name: "Discover" }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("navigation", { name: "Shows" }).getByRole("link", { name: "Apps" }).click();
  await expect(page).toHaveURL("/");
  const shows = page.getByRole("main").getByRole("link", { name: "Shows", exact: true });
  await expect(shows).toHaveAttribute("href", "/shows/discover");
  await shows.click();
  await expect(page).toHaveURL("/shows/discover");

  // Back on its first view: the app's own path.
  await page.getByRole("navigation", { name: "Shows" }).getByRole("button", { name: "Library" }).click();
  await page.goto("/");
  await expect(shows).toHaveAttribute("href", "/shows");

  // Shared remembers Tasks, but without a space it can only open on its welcome.
  await page.context().addCookies([{ name: "last-view-shared", value: "tasks", url: page.url() }]);
  await page.reload();
  await expect(page.getByRole("main").getByRole("link", { name: "Shared", exact: true })).toHaveAttribute(
    "href",
    "/shared",
  );
  expect((await page.request.post("/api/shared/spaces", { data: {} })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole("main").getByRole("link", { name: "Shared", exact: true })).toHaveAttribute(
    "href",
    "/shared/tasks",
  );
});

test("badges: Shared's tasks due for you, Shows' friend requests and new recommendations", async ({
  page,
  browser,
}) => {
  const me = newUser();
  await signUp(page, me);
  await expect(page).toHaveURL("/");
  const meId = await userId(me.username);
  const icon = (name: string) => page.getByRole("main").getByRole("link", { name: new RegExp(`^${name}\\b`) });

  // Shared: tasks due today or before, for me or for nobody; not later, not done, not someone else's.
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
  await page.reload();
  await expect(icon("Shared")).toHaveAccessibleName("Shared, 2 tasks due");
  await expect(icon("Shared").getByText("2", { exact: true })).toBeVisible();

  // Shows: a friend request waiting, then a friend's recommendation, which Discover then shows.
  const friend = await otherPerson(browser);
  expect((await friend.page.request.post("/api/shows/friends", { data: { username: me.username } })).ok()).toBe(true);
  await page.reload();
  await expect(icon("Shows")).toHaveAccessibleName("Shows, 1 new");

  expect((await page.request.post("/api/shows/friends", { data: { username: friend.user.username } })).ok()).toBe(true);
  const recommended = await friend.page.request.post("/api/shows/recommendations", {
    data: { friendId: meId, type: "tv", tmdbId: mockBase + 103 },
  });
  expect(recommended.ok()).toBe(true);
  await page.reload();
  await expect(icon("Shows")).toHaveAccessibleName("Shows, 1 new");

  const seen = page.waitForResponse((response) => response.url().endsWith("/api/shows/recommendations/seen"));
  await page.goto("/shows/discover");
  await expect(page.getByRole("region", { name: "Recommended by Friends" })).toBeVisible();
  expect((await seen).ok()).toBe(true);
  await page.goto("/");
  await expect(icon("Shows")).toHaveAccessibleName("Shows");
  await friend.context.close();
});
