import { randomBytes } from "node:crypto";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

export { expect };

// No test reaches TMDB. The app's server talks to a fake TMDB (lib/tmdb-mock.ts)
// when test hooks are on; the posters, which browsers load from TMDB's image
// server, are drawn here instead. Call this for contexts made with newContext().
export async function fakeTmdbImages(context: BrowserContext) {
  await context.route("https://image.tmdb.org/**", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513"><rect width="342" height="513" fill="#4b6584"/></svg>',
  }));
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

export type TestUser = { username: string; email: string; password: string };

// Details for a new account. The "e2e_" prefix marks what global-teardown.ts deletes.
export function newUser(): TestUser {
  const id = randomBytes(6).toString("hex");
  return { username: `e2e_${id}`, email: `e2e_${id}@example.test`, password: `correct horse ${id}` };
}

export async function signUp(page: Page, user: TestUser, path = "/signup") {
  await page.goto(path);
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

/** The account menu button in the top bar, labelled with the username. */
export function accountButton(page: Page, username: string) {
  return page.getByRole("navigation", { name: "Account" }).getByRole("button", { name: username, exact: true });
}

export async function logOut(page: Page, username: string) {
  await page.goto("/apps");
  await accountButton(page, username).click();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Login" })).toBeVisible();
}

/** A form's error message. Scoped to main: Next.js has a route announcer with role alert too. */
export function formAlert(page: Page) {
  return page.getByRole("main").getByRole("alert");
}
