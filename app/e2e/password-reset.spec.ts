import { createHash } from "node:crypto";
import { type APIRequestContext, type Page } from "@playwright/test";
import { withDatabase } from "./db";
import { accountButton, expect, formAlert, logIn, logOut, newUser, signUp, test, type TestUser } from "./fixtures";

const requested =
  "If an account uses that email, we've sent it a link to reset the password. The link works for 1 hour.";
const linkExpired = "This password reset link has expired or was already used. Each link works once, for 1 hour.";
const wrongCredentials = "Wrong username/email or password.";

type Email = { to: string; subject: string; text: string; html: string };

// Without test hooks, the dev server would really send these emails (through
// Resend, when .env.local has RESEND_API_KEY), so make sure they're on first.
test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/test/outbox");
  expect(
    response.status(),
    "Test hooks are off: stop your dev server so Playwright starts one, or start it with E2E_TEST_HOOKS=1",
  ).toBe(200);
});

/** Signs up a new account, then logs out. */
async function existingUser(page: Page): Promise<TestUser> {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await logOut(page, user.username);
  return user;
}

async function requestReset(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(requested);
}

/** The emails the app sent to `address`, oldest first. */
async function emailsTo(request: APIRequestContext, address: string): Promise<Email[]> {
  const response = await request.get(`/api/test/outbox?${new URLSearchParams({ to: address })}`);
  return (await response.json()).emails;
}

/**
 * The reset link in the `count`th email to `address`, as a path on this site,
 * once exactly `count` have arrived (they are sent after the response).
 */
async function resetLink(request: APIRequestContext, address: string, count = 1): Promise<string> {
  await expect.poll(async () => (await emailsTo(request, address)).length).toBe(count);
  const { text } = (await emailsTo(request, address))[count - 1];
  const url = new URL(text.match(/^https?:\/\/\S+\/reset-password\?token=\S+$/m)![0]);
  return `${url.pathname}${url.search}`;
}

async function setNewPassword(page: Page, password: string, confirm = password) {
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(confirm);
  await page.getByRole("button", { name: "Set new password" }).click();
}

function heading(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

test("forgot password gives the same answer whether or not an account has the email", async ({
  page,
  request,
}) => {
  const user = await existingUser(page);
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL("/forgot-password");

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Enter a valid email, like name@example.com.")).toBeVisible();

  const unknown = newUser().email;
  await requestReset(page, unknown);
  // Any case; the email goes to the address as the account has it.
  await requestReset(page, user.email.toUpperCase());

  const link = await resetLink(request, user.email);
  const [email] = await emailsTo(request, user.email);
  expect(email.to).toBe(user.email);
  expect(email.subject).toBe("Reset your diogomota.com password");
  expect(email.text).toContain(`Hi ${user.username},`);
  expect(email.html).toContain(`">Choose a new password</a>`);
  expect(email.html).toContain(link);
  expect(await emailsTo(request, unknown)).toEqual([]);
});

test("reset the password with the emailed link, then log in with the new one", async ({ page, request }) => {
  const user = await existingUser(page);
  await requestReset(page, user.email);
  await page.goto(await resetLink(request, user.email));

  await expect(heading(page)).toHaveText("Reset password");
  await expect(page.getByRole("main")).toContainText(`Choose a new password for ${user.username}.`);

  // The sign-up rules.
  await setNewPassword(page, "short");
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  await setNewPassword(page, "é".repeat(37));
  await expect(page.getByText("That password is too long (at most 72 bytes).")).toBeVisible();
  await setNewPassword(page, "a brand new password", "a different password");
  await expect(page.getByText("The passwords don't match.")).toBeVisible();

  await setNewPassword(page, "a brand new password");
  await expect(page).toHaveURL("/login?password=changed");
  await expect(page.getByRole("main")).toContainText("Your password was changed. Log in with the new one.");

  await logIn(page, user.username, user.password);
  await expect(formAlert(page)).toHaveText(wrongCredentials);
  await logIn(page, user.email, "a brand new password");
  await expect(page).toHaveURL("/apps");
  await expect(accountButton(page, user.username)).toBeVisible();
});

test("a used link doesn't work again, not even from a page opened before", async ({
  page,
  context,
  request,
}) => {
  const user = await existingUser(page);
  await requestReset(page, user.email);
  const link = await resetLink(request, user.email);

  // The same link open in two tabs.
  const otherTab = await context.newPage();
  await otherTab.goto(link);
  await page.goto(link);
  await setNewPassword(page, "the first new password");
  await expect(page).toHaveURL("/login?password=changed");

  await setNewPassword(otherTab, "the second new password");
  await expect(heading(otherTab)).toHaveText("Link expired");
  await expect(otherTab.getByRole("main")).toContainText(linkExpired);

  await page.goto(link);
  await expect(heading(page)).toHaveText("Link expired");
  await page.getByRole("link", { name: "Get a new link" }).click();
  await expect(page).toHaveURL("/forgot-password");

  await logIn(page, user.username, "the second new password");
  await expect(formAlert(page)).toHaveText(wrongCredentials);
  await logIn(page, user.username, "the first new password");
  await expect(page).toHaveURL("/apps");
});

test("an expired link is rejected and the password stays the same", async ({ page, request }) => {
  const user = await existingUser(page);
  await requestReset(page, user.email);
  const link = await resetLink(request, user.email);
  await page.goto(link);
  await expect(heading(page)).toHaveText("Reset password");

  // The hour passes while the page is open.
  const token = new URL(link, "http://n.invalid").searchParams.get("token")!;
  const { rowCount } = await withDatabase((client) =>
    client.query(`UPDATE password_resets SET expires_at = now() - interval '1 second' WHERE token_hash = $1`, [
      createHash("sha256").update(token).digest("hex"),
    ]),
  );
  expect(rowCount).toBe(1);

  await setNewPassword(page, "a brand new password");
  await expect(heading(page)).toHaveText("Link expired");
  await page.goto(link);
  await expect(page.getByRole("main")).toContainText(linkExpired);

  await logIn(page, user.username, user.password);
  await expect(page).toHaveURL("/apps");
});

test("a new request replaces the earlier link", async ({ page, request }) => {
  const user = await existingUser(page);
  await requestReset(page, user.email);
  const first = await resetLink(request, user.email);
  await requestReset(page, user.email);
  const second = await resetLink(request, user.email, 2);
  expect(second).not.toBe(first);

  await page.goto(first);
  await expect(heading(page)).toHaveText("Link expired");
  await page.goto(second);
  await setNewPassword(page, "a brand new password");
  await expect(page).toHaveURL("/login?password=changed");
});

test("a reset logs out every session of the account", async ({ page, browser, request }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  const otherDevice = await browser.newContext();
  const other = await otherDevice.newPage();
  await logIn(other, user.username, user.password);
  await expect(other).toHaveURL("/apps");

  // Reset from the first device while it's still logged in.
  await requestReset(page, user.email);
  await page.goto(await resetLink(request, user.email));
  await setNewPassword(page, "a brand new password");
  await expect(page).toHaveURL("/login?password=changed");

  for (const tab of [page, other]) {
    await tab.goto("/shared");
    await expect(tab).toHaveURL("/apps?next=%2Fshared");
  }
  await otherDevice.close();
});

test("reset requests are rate limited per client address", async ({ page }) => {
  for (let i = 0; i < 5; i++) await requestReset(page, newUser().email);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(newUser().email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(formAlert(page)).toHaveText("Too many reset requests from your network. Try again in an hour.");
});

test("an address gets at most 3 reset emails an hour, with the same answer after that", async ({
  page,
  request,
}) => {
  const user = await existingUser(page);
  for (let i = 0; i < 4; i++) await requestReset(page, user.email);

  // The 4th request sent nothing, so the 3rd link is the one that works.
  const third = await resetLink(request, user.email, 3);
  await page.goto(third);
  await setNewPassword(page, "a brand new password");
  await expect(page).toHaveURL("/login?password=changed");
  expect(await emailsTo(request, user.email)).toHaveLength(3);
});
