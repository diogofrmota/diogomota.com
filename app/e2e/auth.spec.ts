import { siteTagline } from "../lib/site";
import { accountButton, expect, formAlert, logIn, logOut, newUser, signUp, test } from "./fixtures";

const wrongCredentials = "Wrong username/email or password.";
const signUpConflict =
  "Couldn't sign up with that username and email. Try another username, or log in if you already have an account.";
const next = (path: string) => new URLSearchParams({ next: path }).toString();

test("sign up logs the new user in, home, whose icons go straight into the apps; /login and /signup then go on @smoke", async ({
  page,
}) => {
  const user = newUser();
  // Usernames are saved in lowercase.
  await signUp(page, { ...user, username: user.username.toUpperCase() });

  await expect(page).toHaveURL("/");
  await expect(accountButton(page, user.username)).toBeVisible();
  // Logged in, no front page (the website's): the apps' icons, with no header or tab bar.
  await expect(page.getByRole("region", { name: "Small apps to share with friends" })).toHaveCount(0);
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);

  await page.getByRole("main").getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL("/shared");
  await expect(page.getByRole("link", { name: "Apps", exact: true })).toBeVisible();
  // With a session the Spaces endpoint returns the user's current space.
  expect(await (await page.request.get("/api/shared/spaces")).json()).toEqual({ data: null });

  // Logged in, /login and /signup go on home or to next.
  await page.goto("/login");
  await expect(page).toHaveURL("/");
  await page.goto(`/signup?${next("/shows")}`);
  await expect(page).toHaveURL("/shows");
});

test("sign up explains what is wrong with each field, and a taken username or email gets one message that doesn't say which", async ({
  page,
}) => {
  await signUp(page, { username: "ab", email: "not-an-email", password: "short" });
  await expect(page).toHaveURL("/signup");
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(page.getByText("Use 3-20 characters: a-z, 0-9 and _.")).toBeVisible();
  await expect(page.getByText("Enter a valid email, like name@example.com.")).toBeVisible();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveAttribute("aria-invalid", "true");
  // What was typed stays, except the password.
  await expect(page.getByLabel("Username")).toHaveValue("ab");
  await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
  await expect(page.getByLabel("Password")).toHaveValue("");

  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await logOut(page, user.username);
  const other = newUser();
  await signUp(page, { ...other, username: user.username });
  await expect(formAlert(page)).toHaveText(signUpConflict);
  await signUp(page, { ...other, email: user.email.toUpperCase() });
  await expect(formAlert(page)).toHaveText(signUpConflict);
});

test("log out from Account; log in with the username or the email, in any case, never sent off the site; a wrong password and an unknown account get the same message @smoke", async ({
  page,
}) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  // Not on / (which has no tab bar): only on Account.
  await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  await page.getByRole("main").getByRole("link", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL("/account");
  await page.getByRole("main").getByRole("button", { name: "Log out", exact: true }).click();
  // Logged out, home is the website: Log in and Sign up in its header.
  await expect(page).toHaveURL("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Sign Up" })).toBeVisible();
  await page.goto("/shared");
  await expect(page).toHaveURL(`/?${next("/shared")}`);

  await logIn(page, user.username, user.password);
  await expect(page).toHaveURL("/");
  await expect(accountButton(page, user.username)).toBeVisible();
  await logOut(page, user.username);
  await logIn(page, user.email.toUpperCase(), user.password);
  await expect(page).toHaveURL("/");
  await expect(accountButton(page, user.username)).toBeVisible();

  // next is only ever a path of this site.
  for (const target of ["//evil.example/x", "https://evil.example/", "/\\evil.example"]) {
    await logOut(page, user.username);
    await logIn(page, user.username, user.password, `/login?${next(target)}`);
    await expect(page).toHaveURL("/");
  }
  await logOut(page, user.username);

  await logIn(page, user.username, "not the password");
  await expect(formAlert(page)).toHaveText(wrongCredentials);
  await expect(page).toHaveURL("/login");
  await expect(page.getByLabel("Username or email")).toHaveValue(user.username);
  await logIn(page, newUser().email, user.password);
  await expect(formAlert(page)).toHaveText(wrongCredentials);
});

test("logged out, the apps and Account send home, with the app's login prompt, and logging in goes back; their APIs answer 401 @smoke", async ({
  page,
}) => {
  for (const path of ["/api/shared/spaces", "/api/shows/library", "/api/books", "/api/recipes", "/api/fitness"]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(401);
    expect(await response.json(), path).toEqual({ error: "Unauthorized" });
  }

  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await logOut(page, user.username);
  for (const path of ["/shared", "/shows", "/shows/anything?x=1", "/account"]) {
    await page.goto(path);
    await expect(page).toHaveURL(`/?${next(path)}`);
  }

  // Account has no prompt: home's Log in and Sign up come back to it.
  await expect(page.getByRole("dialog")).toBeHidden();
  const hero = page.getByRole("main").getByRole("region", { name: siteTagline });
  const header = page.getByRole("banner");
  const back = next("/account");
  await expect(header.getByRole("link", { name: "Log in" })).toHaveAttribute("href", `/login?${back}`);
  await expect(header.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", `/signup?${back}`);
  await expect(hero.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", `/signup?${back}`);
  await expect(hero.getByRole("link", { name: "Login", exact: true })).toHaveAttribute("href", `/login?${back}`);

  // An app's view: home, with that app's login prompt open.
  for (const [path, app] of [
    ["/shows/discover", "Shows"],
    ["/fitness/progress", "Fitness"],
    ["/recipes/shopping", "Recipes"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(`/?${next(path)}`);
    await expect(page.getByRole("dialog", { name: `Log in to open ${app}` })).toBeVisible();
  }

  await page.goto("/shows");
  const prompt = page.getByRole("dialog", { name: "Log in to open Shows" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL(`/login?${next("/shows")}`);
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/shows");
  await expect(page.getByRole("link", { name: "Apps", exact: true })).toBeVisible();
});

test("Remember me, on to start with, keeps the session for 30 days; off, its cookie ends when the browser closes", async ({
  page,
}) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await logOut(page, user.username);
  const sessionCookie = async () =>
    (await page.context().cookies()).find((cookie) => cookie.name.endsWith("session_token"))!;

  await page.goto("/login");
  const remember = page.getByRole("checkbox", { name: "Remember me" });
  await expect(remember).toBeChecked();
  // Unticked, it stays so after a wrong password.
  await remember.uncheck();
  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill("not the password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(formAlert(page)).toHaveText(wrongCredentials);
  await expect(remember).not.toBeChecked();
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
  await expect(accountButton(page, user.username)).toBeVisible();
  // A cookie for this browser session only: no expiry.
  expect((await sessionCookie()).expires).toBe(-1);

  await logOut(page, user.username);
  await logIn(page, user.username, user.password);
  await expect(page).toHaveURL("/");
  await expect(accountButton(page, user.username)).toBeVisible();
  const days = ((await sessionCookie()).expires * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29);
});

test("sign-up, password reset requests and login are each rate limited per client address", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await logOut(page, user.username);
  // Attempts that pass validation count, even when the username is taken.
  for (let i = 0; i < 4; i++) {
    await signUp(page, { ...newUser(), username: user.username });
    await expect(formAlert(page)).toHaveText(signUpConflict);
  }
  await signUp(page, newUser());
  await expect(formAlert(page)).toHaveText("Too many sign-ups from your network. Try again in an hour.");

  const requestReset = async (email: string) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
  };
  for (let i = 0; i < 5; i++) {
    await requestReset(newUser().email);
    await expect(page.getByRole("main").getByRole("status")).toContainText("we've sent it a link");
  }
  await requestReset(newUser().email);
  await expect(formAlert(page)).toHaveText("Too many reset requests from your network. Try again in an hour.");

  for (let i = 0; i < 10; i++) {
    await logIn(page, "e2e_nobody", "not the password");
    await expect(formAlert(page)).toHaveText(wrongCredentials);
  }
  await logIn(page, "e2e_nobody", "not the password");
  await expect(formAlert(page)).toHaveText("Too many login attempts. Wait 15 minutes and try again.");
});
