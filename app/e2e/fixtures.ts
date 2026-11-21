import { randomBytes } from "node:crypto";
import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { appsOf, folders } from "../lib/apps";

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

// Details for a new account in this run's disposable database. The prefix is
// only a label, never evidence that a preexisting account belongs to a test.
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

/**
 * Goes where the account menu went before the tab bars had it all: / (its
 * Switch app, the tab bars' Apps now), and from there to Account (Account
 * settings under the profile on /, which has no tab bar).
 */
export async function followAccountMenu(page: Page, name: "Account" | "Switch app") {
  const apps = page.getByRole("link", { name: "Apps", exact: true });
  if (await apps.isVisible()) await apps.click();
  if (name === "Switch app") return;
  await expect(page).toHaveURL("/");
  await page.getByRole("main").getByRole("link", { name: "Account settings", exact: true }).click();
}

/**
 * On /, logged in: opens an app from its folder (docs/decisions/0023), its
 * popup first, then the app's icon in it.
 */
export async function openFromHome(page: Page, name: string) {
  const folder = folders.find((f) => appsOf(f).some((app) => app.name === name))!;
  await page.getByRole("main").getByRole("button", { name: folder.title }).click();
  await page.getByRole("dialog", { name: folder.title }).getByRole("link", { name, exact: true }).click();
}

/**
 * Opens For Couples' settings (/couples, docs/decisions/0023): the group's
 * members, inviting your partner, the calendar's import and subscription, and
 * leaving. The group loads again as the page is shown.
 */
export async function openGroupSettings(page: Page) {
  await page.goto("/couples");
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("Group settings");
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

/**
 * Account where a logged-in page has it (once the account menu, by the
 * username): Account settings under the profile on /, or its tab, with the
 * profile picture, in the tab bar of the pages around the apps (/privacy, an
 * invite, the 404; not /account itself).
 */
export function accountButton(page: Page, username: string) {
  void username;
  return page
    .getByRole("main")
    .getByRole("link", { name: "Account settings", exact: true })
    .or(page.locator('nav[aria-label="Account"]:not(header nav) a[href="/account"]'));
}

/** Logs out with Log out on /account, which lands home: logged out, the website, Log in in its header. */
export async function logOut(page: Page, username: string) {
  await page.goto("/account");
  void username;
  await page.getByRole("main").getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Log in" })).toBeVisible();
}

/** A form's error message. Scoped to main: Next.js has a route announcer with role alert too. */
export function formAlert(page: Page) {
  return page.getByRole("main").getByRole("alert");
}

export type Email = { to: string; subject: string; text: string; html: string; replyTo?: string };

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

/**
 * The names of a tab bar's links, as screen readers read them (a picture or an
 * icon in one is hidden from them): ["Account", "Apps"] logged in.
 */
export async function linkNames(nav: Locator): Promise<string[]> {
  return nav.getByRole("link").evaluateAll((links) =>
    links
      .filter((link) => (link as HTMLElement).offsetParent !== null)
      .map((link) => {
        const copy = link.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
        return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
      }),
  );
}
