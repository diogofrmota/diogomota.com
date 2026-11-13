import { randomBytes } from "node:crypto";
import { test as base, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

export { expect };

// No test reaches TMDB. The app's server talks to a fake TMDB (lib/tmdb-mock.ts)
// when test hooks are on; the posters, which browsers load from TMDB's image
// server, are drawn here instead. Call this for contexts made with newContext().
export async function fakeTmdbImages(context: BrowserContext) {
  await context.route("https://image.tmdb.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513"><rect width="342" height="513" fill="#4b6584"/></svg>',
    }),
  );
}

// Every test comes from its own made-up client address. The app rate-limits
// login and sign-up per IP, read from X-Forwarded-For (set by nginx in
// production), so tests running in parallel never share a limit.
// (The fixture callback is usually named `use`, which the React hooks lint rule
// mistakes for React's use().)
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    const [a, b, c] = randomBytes(3);
    await provide({ "X-Forwarded-For": `10.${a}.${b}.${c}` });
  },
  context: async ({ context }, provide) => {
    await fakeTmdbImages(context);
    await provide(context);
  },
});

export type TestUser = { username: string; email: string; password: string; name: string };

// Details for a new account. The "e2e_" prefix marks what global-teardown.ts
// deletes. The name's second word is as unique as the username, to find them by.
export function newUser(): TestUser {
  const id = randomBytes(6).toString("hex");
  return {
    username: `e2e_${id}`,
    email: `e2e_${id}@example.test`,
    password: `correct horse ${id}`,
    name: `Tester Ln${id}`,
  };
}

/** Signs up with the sign-up form; without a name, leaves the Name field empty. */
export async function signUp(page: Page, user: Omit<TestUser, "name"> & Partial<TestUser>, path = "/signup") {
  await page.goto(path);
  await page.getByLabel("Name", { exact: true }).fill(user.name ?? "");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign up" }).click();
}

export async function logIn(page: Page, login: string, password: string, path = "/login") {
  await page.goto(path);
  await page.getByLabel("Username or email").fill(login);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** The account menu's items, top to bottom; on /apps, without Switch app. */
export const accountMenuItems = ["Account", "Switch app", "Log out"];
export const appsMenuItems = accountMenuItems.filter((item) => item !== "Switch app");

/** Opens the account menu in the top bar (the username) and follows its link named `name`. */
export async function followAccountMenu(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Account" }).locator("button[aria-expanded]").click();
  await page.getByRole("navigation", { name: "Account" }).getByRole("link", { name, exact: true }).click();
}

/** A tab of Shared's, in the middle of the top bar. */
export function sharedTab(page: Page, view: "Calendar" | "Tasks" | "Settings") {
  return page.getByRole("navigation", { name: "Shared", exact: true }).getByRole("button", { name: view, exact: true });
}

/**
 * Opens Shared's Settings tab: the space's members, invites and leaving.
 * The space loads again each time the tab is shown.
 */
export async function openSpaceSettings(page: Page) {
  await sharedTab(page, "Settings").click();
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("Settings");
}

/**
 * A setting's row on /account (Name, Username, Email or Theme): a button, named
 * by the setting and what it is now ("Theme: Light mode"), that opens its popup.
 */
export function accountSetting(page: Page, name: string) {
  return page.getByRole("main").getByRole("button", { name: new RegExp(`^${name}\\s*:`) });
}

/**
 * On /account: picks a theme in Theme's popup (opened if it isn't) and saves
 * it, waiting for the response of the server action that does, which starts
 * once the action has run (its headers say whether it revalidated), and for
 * the popup to close.
 */
export async function saveTheme(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name: "Theme", exact: true });
  if (!(await dialog.isVisible())) await accountSetting(page, "Theme").click();
  await dialog.getByRole("radio", { name, exact: true }).check();
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && "next-action" in response.request().headers(),
  );
  await dialog.getByRole("button", { name: "Save theme" }).click();
  expect((await saved).headers()["x-action-revalidated"]).toBeTruthy();
  await expect(dialog).toBeHidden();
}

/** The account menu button in the top bar, labelled with the username. */
export function accountButton(page: Page, username: string) {
  return page.getByRole("navigation", { name: "Account" }).getByRole("button", { name: username, exact: true });
}

export async function logOut(page: Page, username: string) {
  await page.goto("/apps");
  await accountButton(page, username).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Log in" })).toBeVisible();
}

/** A form's error message. Scoped to main: Next.js has a route announcer with role alert too. */
export function formAlert(page: Page) {
  return page.getByRole("main").getByRole("alert");
}

export type Email = { to: string; subject: string; text: string; html: string };

/** The emails the app sent to `address` (only those with `subject`, if given), oldest first. */
export async function emailsTo(request: APIRequestContext, address: string, subject?: string): Promise<Email[]> {
  const response = await request.get(`/api/test/outbox?${new URLSearchParams({ to: address })}`);
  const emails: Email[] = (await response.json()).emails;
  return subject ? emails.filter((email) => email.subject === subject) : emails;
}

export const confirmSubject = "Confirm your email for diogomota.com";

/**
 * Opens the link of the newest email confirming `address` (sign-up sends one,
 * and so does changing the email), as a path on this site, and waits for
 * Account to say it worked.
 */
export async function confirmEmail(page: Page, address: string, expected = "Your email is confirmed.") {
  await expect.poll(async () => (await emailsTo(page.request, address, confirmSubject)).length).toBeGreaterThan(0);
  const emails = await emailsTo(page.request, address, confirmSubject);
  const url = new URL(emails.at(-1)!.text.match(/^https?:\/\/\S+\/api\/auth\/verify-email\?\S+$/m)![0]);
  await page.goto(`${url.pathname}${url.search}`);
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: expected })).toBeVisible();
}
