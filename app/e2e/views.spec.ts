import { mockFixtures } from "./benfica";
import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";
import { checkView, emulateHomeIndicator } from "./checks";
import { accountSetting, expect, newUser, signUp, test } from "./fixtures";
import { card, grid, loadSections, mockBase, openShows, otherPerson, section, tab, userId, viewHeading } from "./shows";

// Every view of the site and of both apps, with their dialogs open and in their
// empty, loading-failed and filled states, through checks.ts: the layout at the
// project's sizes and axe in both themes. Each app's walk-through closes every
// dialog and leaves every view with Back, as a phone's back gesture does.

test.beforeEach(async ({ page, isMobile }) => {
  if (isMobile) await emulateHomeIndicator(page);
  // Each test checks a dozen views or more, with axe twice at each.
  test.slow();
});

const sharedTab = (page: Page, view: string) =>
  page.getByRole("navigation", { name: "Shared", exact: true }).getByRole("button", { name: view, exact: true });

async function goBackTo(page: Page, view: string) {
  await page.goBack();
  await expect(viewHeading(page)).toHaveText(view);
}

test("Benfica upcoming fixtures on one page", async ({ page, isMobile }) => {
  await mockFixtures(page);
  await signUp(page, newUser(), "/signup?next=%2Fbenfica");
  await expect(page).toHaveURL("/benfica");
  await expect(page.getByText("Home · Stadium day", { exact: true })).toBeVisible();
  await checkView(page, "Benfica upcoming fixtures");
  await page.screenshot({
    path: test.info().outputPath(isMobile ? "benfica-phone.png" : "benfica-desktop.png"),
    fullPage: true,
  });
});

test("Books shelves and dialogs", async ({ page }) => {
  await signUp(page, newUser(), "/signup?next=%2Fbooks");
  await expect(page).toHaveURL("/books");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Want to Read", "Currently Reading", "Finished"]);
  await checkView(page, "Books empty shelf");
  await page.getByRole("button", { name: "Add book", exact: true }).click();
  await checkView(page, "Books search dialog");
  await page.getByRole("button", { name: "Add manually" }).click();
  const form = page.getByRole("dialog", { name: "Add book", exact: true });
  await form.getByLabel("Title", { exact: true }).fill("A book with a long title for a narrow shelf");
  await form.getByLabel("Author", { exact: true }).fill("A. Reader");
  await form.getByLabel("Total pages").fill("300");
  await form.getByLabel("Shelf", { exact: true }).selectOption("currently-reading");
  await form.getByLabel("Pages read").fill("75");
  await checkView(page, "Books progress form");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog", { name: "Find a book" }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("75 of 300 pages · 25%")).toBeVisible();
  await checkView(page, "Books reading shelf");
});

/** A popup's text field starts focused with a mouse; on a touch screen it doesn't (the keyboard would cover the popup). */
async function expectFocusedWithMouse(page: Page, field: Locator) {
  if (await page.evaluate(() => matchMedia("(pointer: fine)").matches)) await expect(field).toBeFocused();
  else await expect(field).not.toBeFocused();
}

test("the site's pages", async ({ page }) => {
  for (const [path, view] of [
    ["/", "home"],
    ["/about", "about"],
    ["/privacy", "privacy"],
    ["/login", "login"],
    ["/signup", "sign up"],
    ["/forgot-password", "forgot password"],
    ["/reset-password", "expired reset link"],
    ["/no-such-page", "404"],
  ]) {
    await page.goto(path);
    await checkView(page, view);
  }

  await page.goto(`/test/error?id=${randomUUID()}`);
  await expect(page.getByRole("heading", { name: "something went wrong" })).toBeVisible();
  await checkView(page, "error page");

  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "Open Shows" }).click();
  await expect(page.getByRole("dialog", { name: "Log in to open Shows" })).toBeVisible();
  await checkView(page, "login prompt");
  await page.keyboard.press("Escape");
  // The website's menu: Apps on a wide screen, the menu on a phone.
  const header = page.getByRole("banner");
  const menu = header.getByRole("button", { name: "Menu" });
  await ((await menu.isVisible()) ? menu : header.getByRole("button", { name: "Apps" })).click();
  await checkView(page, "the website's menu");

  await page.goto("/signup");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByLabel("Username")).toHaveAttribute("aria-invalid", "true");
  await checkView(page, "sign up with errors");

  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await checkView(page, "apps, logged in");
  await page.getByRole("main").getByRole("link", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL("/account");
  await checkView(page, "account");

  // A setting's popup, and the profile picture's, then a photo chosen for it: Adjust your picture.
  await accountSetting(page, "Email").click();
  const email = page.getByRole("dialog", { name: "Email", exact: true });
  // A field focused with a mouse; on a touch screen, the keyboard waits for a tap on it.
  await expectFocusedWithMouse(page, email.getByLabel("Email", { exact: true }));
  await checkView(page, "account, a setting's popup");
  await page.keyboard.press("Escape");
  await expect(email).toBeHidden();
  await page.getByRole("main").getByRole("button", { name: "Profile picture", exact: true }).click();
  const picture = page.getByRole("dialog", { name: "Profile picture", exact: true });
  await expect(picture).toBeVisible();
  await checkView(page, "account, the profile picture's popup");
  await picture.locator('input[type="file"]').setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: await sharp({ create: { width: 800, height: 600, channels: 3, background: "#3366cc" } })
      .png()
      .toBuffer(),
  });
  const crop = page.getByRole("dialog", { name: "Adjust your picture" });
  await expect(crop.getByRole("button", { name: "Save picture" })).toBeEnabled();
  await checkView(page, "adjust your picture");
  await crop.getByRole("button", { name: "Cancel" }).click();
  await expect(crop).toBeHidden();
});

test("Shared: every view and dialog, each closed with Back", async ({ page }) => {
  await signUp(page, newUser(), "/signup?next=/shared");
  await expect(page.getByRole("heading", { name: "Your shared calendar" })).toBeVisible();
  await checkView(page, "Shared welcome");

  await page.getByRole("button", { name: "Create space" }).click();
  await expect(viewHeading(page)).toHaveText("Calendar");
  await expect(page.getByRole("region", { name: /^(agenda|month|week|day) calendar$/ })).toBeVisible();
  await checkView(page, "Calendar, empty");

  await page.getByRole("button", { name: "Add event", exact: true }).click();
  const newEvent = page.getByRole("dialog", { name: "Create a new event" });
  await expectFocusedWithMouse(page, newEvent.getByLabel("Event title"));
  await checkView(page, "new event");
  await page.goBack();
  await expect(newEvent).toBeHidden();
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await newEvent.getByLabel("Event title").fill("Dinner");
  await newEvent.getByRole("button", { name: "Save", exact: true }).click();
  await expect(newEvent).toBeHidden();

  await page.getByRole("button", { name: /^Dinner, 09:00/ }).click();
  const event = page.getByRole("dialog", { name: "Dinner" });
  await expect(event.getByRole("button", { name: "Edit event" })).toBeVisible();
  await checkView(page, "event");
  await page.goBack();
  await expect(event).toBeHidden();
  for (const view of ["Agenda", "Month"]) {
    const toggle = page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: view, exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await checkView(page, `Calendar, ${view.toLowerCase()}`);
  }

  await sharedTab(page, "Tasks").click();
  await expect(page.getByRole("heading", { name: "Start your first list" })).toBeVisible();
  await checkView(page, "Tasks, no lists");
  await page.getByLabel("List name").fill("Groceries");
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByText("Nothing to do yet — add your first task!")).toBeVisible();
  await checkView(page, "Tasks, empty list");
  for (const title of ["Apples", "Bread", "Coffee"]) {
    await page.getByLabel("Write a task").fill(title);
    await page.getByLabel("Write a task").press("Enter");
  }
  // Ticked off, it moves to the Done section, which opens with a click.
  await page.getByRole("checkbox", { name: "Coffee" }).click();
  await page.getByText("Done (1)").click();
  await expect(page.getByRole("list", { name: "Done" }).getByRole("checkbox", { name: "Coffee" })).toBeChecked();
  // Once saved: "Saving…" fades in when saving is slow, and axe would catch it half faded.
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await checkView(page, "Tasks");

  await page.getByRole("button", { name: /^Apples/ }).click();
  const task = page.getByRole("dialog", { name: "Edit task" });
  await checkView(page, "task");
  await page.goBack();
  await expect(task).toBeHidden();
  await page.getByRole("button", { name: "Edit" }).click();
  const lists = page.getByRole("dialog", { name: "Lists" });
  await checkView(page, "lists");
  await page.goBack();
  await expect(lists).toBeHidden();
  await page.getByRole("button", { name: /^Bread/ }).click();
  await task.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deleted “Bread”" })).toBeVisible();
  await checkView(page, "undo delete");

  await sharedTab(page, "Settings").click();
  await expect(viewHeading(page)).toHaveText("Settings");
  // Without a share sheet: the link is copied, and shown.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => Object.defineProperty(Navigator.prototype, "share", { value: undefined }));
  await page.getByRole("region", { name: "Invite someone" }).getByRole("button", { name: "Share invite link" }).click();
  await expect(page.getByLabel("Invite link")).toHaveValue(/\/join\/.{8}$/);
  await expect(page.getByLabel("Calendar link")).toHaveValue(/\/api\/calendar\//);
  await checkView(page, "Settings");
  // The last member: leaving deletes the space, so it asks first.
  await page.getByRole("button", { name: "Leave this space", exact: true }).click();
  await expect(page.getByRole("button", { name: "Leave and delete" })).toBeVisible();
  await checkView(page, "Settings, confirm leave");

  await goBackTo(page, "Tasks");
  await goBackTo(page, "Calendar");
});

test("Shows: every view and dialog, each closed with Back", async ({ page, browser }) => {
  const me = await openShows(page);
  // A new account's guide: TV shows, movies, friends, then what was added.
  const main = page.getByRole("main");
  const guide = main.getByRole("region", { name: "Which TV shows do you watch?" });
  const glass = card(grid(guide, "TV shows to choose from"), "Glass Meridian");
  await expect(glass).toBeVisible();
  await expect(guide.getByTestId("skeleton")).toHaveCount(0);
  await glass.click();
  const chooser = guide.getByRole("group", { name: "Add Glass Meridian as" });
  await expect(chooser.getByRole("button")).toHaveText(["Planned", "Watching", "Completed", "Cancel"]);
  await checkView(page, "Library, the guide's status chooser");
  await chooser.getByRole("button", { name: "Watching" }).click();
  const lastWatched = guide.getByRole("group", { name: "Last watched" });
  await expect(lastWatched.getByLabel("Season", { exact: true })).toBeFocused();
  await checkView(page, "Library, the guide's last episode watched");
  await lastWatched.getByRole("button", { name: "Save" }).click();
  await expect(glass).toHaveAccessibleName(/, in your library as Watching$/);
  await checkView(page, "Library, the guide");
  await main.getByRole("button", { name: "Next" }).click();
  await expect(main.getByRole("region", { name: "And which movies?" })).toBeVisible();
  await main.getByRole("button", { name: "Next" }).click();
  await expect(main.getByRole("region", { name: "Watch together" })).toBeVisible();
  await checkView(page, "Library, the guide's friends step");
  await main.getByRole("button", { name: "Back" }).click();
  await main.getByRole("button", { name: "Back" }).click();
  await expect(guide).toBeVisible();
  for (let i = 0; i < 3; i++) await main.getByRole("button", { name: /^(Next|Finish)$/ }).click();
  const allSet = main.getByRole("region", { name: "You’re all set!" });
  await expect(allSet.getByRole("list", { name: "In your library" }).getByRole("listitem")).toHaveText([
    "0 Planned",
    "1 Watching",
    "0 Completed",
  ]);
  await checkView(page, "Library, the guide's end");
  await allSet.getByRole("button", { name: "Go to my library" }).click();
  await expect(card(grid(section(page, "Watching"), "Watching TV shows"), "Glass Meridian")).toBeVisible();

  await tab(page, "Discover").click();
  await expect(card(grid(page, "Popular TV shows"), "Harbor Lights")).toBeVisible();
  await loadSections(page);
  await checkView(page, "Discover");

  await page.getByRole("main").getByRole("button", { name: "Search TV shows and movies" }).click();
  const search = page.getByRole("dialog", { name: "Search" });
  await search.getByRole("searchbox").fill("harbor");
  await expect(card(grid(search, "Search results"), "Harbor Lights")).toBeVisible();
  await checkView(page, "search");
  await card(grid(search, "Search results"), "Harbor Lights").click();
  const title = page.getByRole("dialog", { name: "Harbor Lights" });
  await expect(title.getByRole("group", { name: "Add to Library" })).toBeVisible();
  await checkView(page, "title");
  await title.getByRole("group", { name: "Add to Library" }).getByRole("button", { name: "Watching" }).click();
  await expect(title.getByRole("status")).toHaveText("In your library");
  await checkView(page, "title in the library");
  await page.goBack();
  await expect(title).toBeHidden();
  await expect(search).toBeVisible();
  await page.goBack();
  await expect(search).toBeHidden();

  await tab(page, "Library").click();
  await expect(card(grid(section(page, "Watching"), "Watching TV shows"), "Harbor Lights")).toBeVisible();
  await checkView(page, "Library");
  await page.getByRole("button", { name: "Quick actions for Harbor Lights" }).press("Enter");
  const actions = page.getByRole("dialog", { name: "Harbor Lights" });
  await expect(actions.getByRole("group", { name: "Status" })).toBeVisible();
  await checkView(page, "quick actions");
  await page.goBack();
  await expect(actions).toBeHidden();

  // A friend, with a title in their library, and someone asking to be one.
  const friend = await otherPerson(browser);
  const asker = await otherPerson(browser);
  const myId = await userId(me.username);
  await friend.page.request.post("/api/shows/library", {
    data: { type: "tv", tmdbId: mockBase + 101, status: "watching" },
  });
  expect((await page.request.post("/api/shows/friends", { data: { username: friend.user.username } })).status()).toBe(
    201,
  );
  expect((await friend.page.request.post(`/api/shows/friends/${myId}/accept`, { data: {} })).status()).toBe(200);
  expect((await asker.page.request.post("/api/shows/friends", { data: { username: me.username } })).status()).toBe(201);

  expect(
    (
      await friend.page.request.post("/api/books", {
        data: {
          title: "A friend's current book",
          author: "A. Reader",
          shelf: "currently-reading",
          totalPages: 240,
          pagesRead: 60,
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/shows/profile");
  await expect(page.getByRole("button", { name: `Accept ${asker.user.username}` })).toBeVisible();
  const friendLink = page
    .getByRole("list", { name: "Your friends" })
    .getByRole("link", { name: new RegExp(friend.user.username) });
  await expect(friendLink).toBeVisible();
  await checkView(page, "Shows Profile friends");
  await page.getByLabel("Add a friend").fill(asker.user.username.slice(0, 10));
  await expect(
    page.getByRole("listbox", { name: "People" }).getByRole("option", { name: new RegExp(asker.user.username) }),
  ).toBeVisible();
  await checkView(page, "Shows Profile search suggestions");
  await page.getByLabel("Add a friend").fill("");
  await friendLink.click();
  const profile = page.getByRole("main");
  await expect(profile.getByRole("link", { name: /Harbor Lights/ })).toBeVisible();
  await checkView(page, "Shows friend's profile");
  await page.goBack();
  await expect(friendLink).toBeVisible();
  await page.goto(`/books/profile/${friend.id}`);
  await expect(page.getByRole("main")).toContainText("A friend's current book");
  await checkView(page, "Books friend's profile");
  await page.getByRole("navigation", { name: "Books", exact: true }).getByRole("button", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
  await checkView(page, "Books Profile");
  await friend.context.close();
  await asker.context.close();
});

test("Recipes: every view and dialog, each closed with Back", async ({ page }) => {
  const recipesTab = (view: string) =>
    page.getByRole("navigation", { name: "Recipes", exact: true }).getByRole("button", { name: view, exact: true });
  await signUp(page, newUser(), "/signup?next=/recipes");
  await expect(page.getByRole("heading", { name: "Your recipes, in one place" })).toBeVisible();
  await checkView(page, "Recipes, empty");
  await recipesTab("Favourites").click();
  await expect(page.getByRole("heading", { name: "No favourites yet" })).toBeVisible();
  await checkView(page, "Favourites, empty");
  await recipesTab("Shopping").click();
  await expect(page.getByText(/^Nothing to buy yet\./)).toBeVisible();
  await checkView(page, "Shopping list, empty");
  await goBackTo(page, "Favourites");
  await goBackTo(page, "Recipes");

  await page.getByRole("button", { name: "Add your first recipe" }).click();
  const form = page.getByRole("dialog", { name: "New recipe" });
  await expectFocusedWithMouse(page, form.getByLabel("Title"));
  await checkView(page, "new recipe");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Enter a title.")).toBeVisible();
  await checkView(page, "new recipe with errors");
  await page.goBack();
  await expect(form).toBeHidden();

  // Filled: a recipe with everything (two photos), and a plain one.
  const created = await page.request.post("/api/recipes", {
    data: {
      title: "Roast chicken with lemon, garlic and thyme, and a very long name to wrap",
      servings: 4,
      ingredients: ["For the chicken:", "1 whole chicken (1.5 kg)", "2 lemons", "6 cloves garlic", "Salt, to taste"],
      steps: ["Heat the oven to 200°C.", "Stuff the chicken with the lemons and garlic, and roast for 90 minutes."],
      notes: "Rest it for 15 minutes before carving.",
      sourceUrl: "https://www.bbcgoodfood.com/recipes/roast-chicken",
      tags: ["Dinner", "Sunday", "Family"],
    },
  });
  const recipe = (await created.json()).data;
  for (const background of ["#d35400", "#16a085"]) {
    const buffer = await sharp({ create: { width: 800, height: 600, channels: 3, background } })
      .png()
      .toBuffer();
    const added = await page.request.post(`/api/recipes/${recipe.id}/photos`, {
      multipart: { photo: { name: "dish.png", mimeType: "image/png", buffer } },
    });
    expect(added.status()).toBe(201);
  }
  expect((await page.request.post("/api/recipes", { data: { title: "Toast", tags: ["Breakfast"] } })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Toast/ })).toBeVisible();
  await checkView(page, "Recipes, filled");

  await page.getByRole("button", { name: /^Roast chicken/ }).click();
  const dialog = page.getByRole("dialog", { name: /^Roast chicken/ });
  await expect(dialog.getByRole("img", { name: /^Photo of Roast chicken/ })).toBeVisible();
  await checkView(page, "recipe");
  // For six: 3 lemons.
  await dialog.getByRole("button", { name: "More servings" }).click();
  await dialog.getByRole("button", { name: "More servings" }).click();
  await dialog.getByRole("button", { name: "Add to shopping list" }).click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(4);
  await checkView(page, "recipe, adding to the shopping list");
  await dialog.getByRole("button", { name: "Add 4 items to the list" }).click();
  await expect(dialog.getByText(/^Added 4 items/)).toBeVisible();
  await dialog.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit recipe" });
  await expect(edit.getByRole("button", { name: "Remove the tag Sunday" })).toBeVisible();
  await checkView(page, "edit recipe");
  await page.goBack();
  await expect(edit).toBeHidden();
  await page.goBack();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /^Favourite Toast/ }).click();
  await recipesTab("Favourites").click();
  await expect(page.getByRole("button", { name: /^Toast/ })).toBeVisible();
  await checkView(page, "Favourites, filled");
  await recipesTab("Shopping").click();
  await page.getByRole("checkbox", { name: "3 lemons" }).check();
  await expect(page.getByRole("list", { name: "Ticked off" })).toBeVisible();
  await checkView(page, "Shopping list, filled");
  await goBackTo(page, "Favourites");
  await goBackTo(page, "Recipes");
});

test("Fitness: every view and dialog, each closed with Back", async ({ page }) => {
  const fitnessTab = (view: string) =>
    page.getByRole("navigation", { name: "Fitness", exact: true }).getByRole("button", { name: view, exact: true });
  await signUp(page, newUser(), "/signup?next=/fitness");
  await expect(page.getByText("No workout or run yet today.")).toBeVisible();
  await checkView(page, "Today, empty");
  await fitnessTab("Workouts").click();
  await expect(page.getByRole("heading", { name: "Plan your workouts" })).toBeVisible();
  await checkView(page, "Workouts, empty");
  await fitnessTab("Progress").click();
  await expect(page.getByRole("heading", { name: "Your progress, over time" })).toBeVisible();
  await checkView(page, "Progress, empty");
  await goBackTo(page, "Workouts");

  await page.getByRole("button", { name: "Create your first routine" }).click();
  const routine = page.getByRole("dialog", { name: "New routine" });
  await expectFocusedWithMouse(page, routine.getByLabel("Name"));
  await checkView(page, "new routine");
  await routine.getByRole("button", { name: "Save" }).click();
  await expect(routine.getByText("Enter a name, like Push day.")).toBeVisible();
  await checkView(page, "new routine with errors");
  await page.goBack();
  await expect(routine).toBeHidden();
  await goBackTo(page, "Today");

  // Today's dialogs, with nothing yet.
  await page.getByRole("button", { name: "Start workout" }).click();
  const start = page.getByRole("dialog", { name: "Start a workout" });
  await expect(start.getByRole("button", { name: "Empty workout" })).toBeVisible();
  await checkView(page, "start a workout, no routines");
  await page.goBack();
  await expect(start).toBeHidden();
  await page.getByRole("button", { name: "Log a run" }).click();
  const newRun = page.getByRole("dialog", { name: "Log a run" });
  await expectFocusedWithMouse(page, newRun.getByLabel("Distance in km"));
  await newRun.getByRole("button", { name: "Save" }).click();
  await expect(newRun.getByText("Enter the distance in km, like 5.2.")).toBeVisible();
  await checkView(page, "log a run with errors");
  await page.goBack();
  await expect(newRun).toBeHidden();
  await page.getByRole("button", { name: "Add supplements" }).click();
  const supplements = page.getByRole("dialog", { name: "Supplements" });
  await checkView(page, "supplements, none");
  await page.goBack();
  await expect(supplements).toBeHidden();
  await page.getByRole("button", { name: "Goal 2,000 ml" }).click();
  const goals = page.getByRole("dialog", { name: "Daily goals" });
  await checkView(page, "daily goals");
  await page.goBack();
  await expect(goals).toBeHidden();

  // Filled: a routine, six weeks of workouts and runs, two months of days, supplements.
  const lisbonToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
  const day = (n: number) =>
    new Date(Date.parse(`${lisbonToday}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const post = async (path: string, data: object) => {
    const response = await page.request.post(`/api/fitness${path}`, { data });
    expect(response.status(), path).toBe(201);
    return (await response.json()).data;
  };
  await post("/routines", {
    name: "Push day, with a very long name to see that it wraps and pushes nothing out",
    exercises: [
      { name: "Bench press", sets: 3, reps: 8 },
      { name: "Overhead press", sets: 3, reps: 10 },
      { name: "Dips", sets: 3, reps: 12 },
    ],
  });
  for (let week = 6; week >= 1; week--) {
    await post("/workouts", {
      date: day(week * 7 - 2),
      name: "Push day",
      exercises: [
        {
          id: randomUUID(),
          name: "Bench press",
          sets: [8, 8, 7].map((reps) => ({ reps, weightKg: 70 - week * 2.5, done: true })),
        },
        { id: randomUUID(), name: "Dips", sets: [12, 10].map((reps) => ({ reps, weightKg: null, done: true })) },
      ],
    });
    await post("/runs", { date: day(week * 7 - 4), distanceM: 4000 + week * 700, durationS: 1500 + week * 240 });
  }
  for (let n = 60; n >= 0; n--) {
    const response = await page.request.patch(`/api/fitness/days/${day(n)}`, {
      data: { steps: 5000 + ((n * 1373) % 8000), waterMl: 1000 + ((n * 250) % 1500), weightKg: 80 - n * 0.04 },
    });
    expect(response.ok()).toBe(true);
  }
  await post("/supplements", { name: "Creatine", dose: "5 g" });
  await post("/supplements", { name: "Vitamin D" });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Creatine · 5 g" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Creatine · 5 g" }).check();
  await checkView(page, "Today, filled");
  await page.getByRole("button", { name: "Edit supplements" }).click();
  const list = page.getByRole("dialog", { name: "Supplements" });
  await list.getByRole("button", { name: "Remove Vitamin D" }).click();
  await expect(list.getByRole("status")).toBeVisible();
  // Focused, its Undo waits for the checks.
  await list.getByRole("button", { name: "Undo" }).focus();
  await checkView(page, "supplements, one just removed");
  await list.getByRole("button", { name: "Undo" }).click();
  await page.goBack();
  await expect(list).toBeHidden();

  await fitnessTab("Workouts").click();
  await expect(page.getByRole("button", { name: /^Start Push day/ })).toBeVisible();
  await checkView(page, "Workouts, filled");
  await page.getByRole("button", { name: /^Start Push day/ }).click();
  const workout = page.getByRole("dialog", { name: /^Push day/ });
  const bench = workout.getByRole("region", { name: "Bench press" });
  await bench.getByLabel("Set 1 weight in kg").fill("72.5");
  await bench.getByRole("button", { name: "Set 1 done" }).click();
  await expect(workout.getByText("A personal record", { exact: true })).toBeVisible();
  await checkView(page, "workout");
  await workout.getByRole("button", { name: "Remove Dips" }).click();
  await expect(workout.getByText("Dips removed.")).toBeVisible();
  await workout.getByRole("button", { name: "Undo" }).focus();
  await checkView(page, "workout, an exercise just removed");
  await workout.getByRole("button", { name: "Undo" }).click();
  await page.goBack();
  await expect(workout).toBeHidden();
  await page.getByRole("button", { name: /^Edit Push day/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit routine" });
  await expect(edit.getByLabel("Exercise 3", { exact: true })).toHaveValue("Dips");
  await checkView(page, "edit routine");
  await page.goBack();
  await expect(edit).toBeHidden();
  await page.getByRole("button", { name: "Runs", exact: true }).click();
  await page
    .getByRole("main")
    .getByRole("button", { name: /Run\s*\d/ })
    .first()
    .click();
  const run = page.getByRole("dialog", { name: "Run" });
  await expect(run.getByLabel("Distance in km")).not.toHaveValue("");
  await checkView(page, "run");
  await page.goBack();
  await expect(run).toBeHidden();

  await fitnessTab("Progress").click();
  await expect(page.getByRole("heading", { name: "Personal records" })).toBeVisible();
  await page.getByText("Show as a table").first().click();
  // A chart's point, shown from the keyboard.
  await page.getByRole("group", { name: /^Bench press, heaviest set each day/ }).focus();
  await checkView(page, "Progress, filled");
  await goBackTo(page, "Workouts");
  await goBackTo(page, "Today");
});

test("a load that fails says so, and Retry loads it again", async ({ page }) => {
  const offline = "Could not reach the server. Check your connection.";
  const failing = async (path: string | RegExp, view: () => Promise<void>, name: string) => {
    await page.route(path, (route) =>
      route.request().method() === "GET" ? route.abort("internetdisconnected") : route.fallback(),
    );
    await view();
    const alert = page.getByRole("main").getByRole("alert").filter({ hasText: offline });
    await expect(alert).toBeVisible();
    await checkView(page, `${name}, failed to load`);
    await page.unroute(path);
    await alert.getByRole("button", { name: "Retry" }).click();
    await expect(alert).toBeHidden();
  };

  await signUp(page, newUser(), "/signup?next=/shared");
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(viewHeading(page)).toHaveText("Calendar");
  // Persisted data from before stays shown under the alert (components/common/QueryProvider).
  await failing(
    /\/api\/shared\/events(\?|$)/,
    async () => {
      await page.reload();
    },
    "Calendar",
  );
  await expect(page.getByRole("region", { name: /^(agenda|month|week|day) calendar$/ })).toBeVisible();
  await failing("**/api/shared/tasks", () => sharedTab(page, "Tasks").click(), "Tasks");
  await expect(page.getByRole("heading", { name: "Start your first list" })).toBeVisible();
  await failing("**/api/shared/spaces", () => sharedTab(page, "Settings").click(), "Settings");
  await expect(page.getByRole("listitem").filter({ hasText: "(you)" })).toBeVisible();

  await failing(
    "**/api/shows/library",
    async () => {
      await page.goto("/shows");
    },
    "Shows Library",
  );
  await expect(page.getByRole("heading", { name: "Which TV shows do you watch?" })).toBeVisible();
  // Not Popular or Trending, which the guide just loaded: Discover shows those again without asking.
  await failing(
    "**/api/shows/discover/tv/top-rated",
    async () => {
      await tab(page, "Discover").click();
      await section(page, "Top Rated").scrollIntoViewIfNeeded();
    },
    "Discover",
  );
  await expect(grid(page, "Top Rated TV shows").getByRole("listitem").first()).toBeVisible();
  await failing("**/api/social/friends", () => page.goto("/shows/profile").then(() => {}), "Shows Profile friends");
  await expect(page.getByText("No friends yet.", { exact: false })).toBeVisible();
});
