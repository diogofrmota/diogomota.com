import { accountButton, expect, formAlert, logIn, logOut, newUser, signUp, test } from "./fixtures";

const wrongCredentials = "Wrong username/email or password.";
const signUpConflict =
  "Couldn't sign up with that username and email. Try another username, or log in if you already have an account.";
const next = (path: string) => new URLSearchParams({ next: path }).toString();

test("sign up logs the new user in, and the cards go straight into the apps", async ({ page }) => {
  const user = newUser();
  // Usernames are saved in lowercase.
  await signUp(page, { ...user, username: user.username.toUpperCase() });

  await expect(page).toHaveURL("/apps");
  const account = page.getByRole("navigation", { name: "Account" });
  await expect(accountButton(page, user.username)).toBeVisible();
  await expect(account.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "One account for Shared and Shows" })).toHaveCount(0);

  await page.getByRole("main").getByRole("link", { name: "Shared", exact: true }).click();
  await expect(page).toHaveURL("/shared");
  await expect(accountButton(page, user.username)).toBeVisible();
});

test("sign up explains what is wrong with each field", async ({ page }) => {
  await signUp(page, { username: "ab", email: "not-an-email", password: "short" });

  await expect(page).toHaveURL("/signup");
  await expect(page.getByText("Use 3-20 characters: a-z, 0-9 and _.")).toBeVisible();
  await expect(page.getByText("Enter a valid email, like name@example.com.")).toBeVisible();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveAttribute("aria-invalid", "true");
  // What was typed stays, except the password.
  await expect(page.getByLabel("Username")).toHaveValue("ab");
  await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
  await expect(page.getByLabel("Password")).toHaveValue("");
});

test("a taken username or email gets one message that doesn't say which", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await logOut(page, user.username);

  const other = newUser();
  await signUp(page, { ...other, username: user.username });
  await expect(formAlert(page)).toHaveText(signUpConflict);

  await signUp(page, { ...other, email: user.email.toUpperCase() });
  await expect(formAlert(page)).toHaveText(signUpConflict);
});

test("log out from the account menu", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");

  await accountButton(page, user.username).click();
  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page).toHaveURL("/apps");
  const account = page.getByRole("navigation", { name: "Account" });
  await expect(account.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(account.getByRole("link", { name: "Sign Up" })).toBeVisible();
  await page.goto("/shared");
  await expect(page).toHaveURL(`/apps?${next("/shared")}`);
});

test("log in with the username or the email, in any case", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await logOut(page, user.username);

  await logIn(page, user.username, user.password);
  await expect(page).toHaveURL("/apps");
  await expect(accountButton(page, user.username)).toBeVisible();
  await logOut(page, user.username);

  await logIn(page, user.email.toUpperCase(), user.password);
  await expect(page).toHaveURL("/apps");
  await expect(accountButton(page, user.username)).toBeVisible();
});

test("a wrong password and an unknown account get the same message", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await logOut(page, user.username);

  await logIn(page, user.username, "not the password");
  await expect(formAlert(page)).toHaveText(wrongCredentials);
  await expect(page).toHaveURL("/login");
  await expect(page.getByLabel("Username or email")).toHaveValue(user.username);

  await logIn(page, newUser().email, user.password);
  await expect(formAlert(page)).toHaveText(wrongCredentials);

  await page.goto("/shows");
  await expect(page).toHaveURL(`/apps?${next("/shows")}`);
});

test("logged out, the apps redirect to /apps, which logs in and goes back", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await logOut(page, user.username);

  for (const path of ["/shared", "/shows", "/shows/anything?x=1", "/account"]) {
    await page.goto(path);
    await expect(page).toHaveURL(`/apps?${next(path)}`);
  }

  // The login prompt of the app the user tried to open is already open.
  await page.goto("/shows");
  const prompt = page.getByRole("dialog", { name: "Log in to open Shows" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL(`/login?${next("/shows")}`);

  await page.getByLabel("Username or email").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/shows");
  await expect(accountButton(page, user.username)).toBeVisible();
});

test("logged out, the apps' API routes answer 401", async ({ page }) => {
  for (const path of ["/api/shared/spaces", "/api/shows/library"]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  }

  // With a session the Spaces endpoint returns the user's current space.
  await signUp(page, newUser());
  await expect(page).toHaveURL("/apps");
  expect(await (await page.request.get("/api/shared/spaces")).json()).toEqual({ data: null });
});

test("sign up returns to the app the user tried to open", async ({ page }) => {
  await signUp(page, newUser(), `/signup?${next("/shared")}`);
  await expect(page).toHaveURL("/shared");
});

test("next never sends users off the site", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");

  for (const target of ["//evil.example/x", "https://evil.example/", "/\\evil.example"]) {
    await logOut(page, user.username);
    await logIn(page, user.username, user.password, `/login?${next(target)}`);
    await expect(page).toHaveURL("/apps");
  }
});

test("logged in, /login and /signup go on to /apps or next", async ({ page }) => {
  await signUp(page, newUser());
  await expect(page).toHaveURL("/apps");

  await page.goto("/login");
  await expect(page).toHaveURL("/apps");
  await page.goto(`/signup?${next("/shows")}`);
  await expect(page).toHaveURL("/shows");
});

test("login is rate limited per client address", async ({ page }) => {
  for (let i = 0; i < 10; i++) {
    await logIn(page, "e2e_nobody", "not the password");
    await expect(formAlert(page)).toHaveText(wrongCredentials);
  }
  await logIn(page, "e2e_nobody", "not the password");
  await expect(formAlert(page)).toHaveText("Too many login attempts. Wait 15 minutes and try again.");
});

test("sign-up is rate limited per client address", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await logOut(page, user.username);

  // Attempts that pass validation count, even when the username is taken.
  for (let i = 0; i < 4; i++) {
    await signUp(page, { ...newUser(), username: user.username });
    await expect(formAlert(page)).toHaveText(signUpConflict);
  }
  await signUp(page, newUser());
  await expect(formAlert(page)).toHaveText("Too many sign-ups from your network. Try again in an hour.");
});
