import { createHash } from "node:crypto";
import { type APIRequestContext, type Page } from "@playwright/test";
import { withDatabase } from "./db";
import {
  accountButton,
  confirmEmail,
  emailsTo as allEmailsTo,
  expect,
  formAlert,
  logIn,
  logOut,
  newUser,
  signUp,
  test,
  type TestUser,
} from "./fixtures";

const requested =
  "If an account uses that email and it is confirmed, we've sent it a link to reset the password. The link works for 1 hour.";
const linkExpired = "This password reset link has expired or was already used. Each link works once, for 1 hour.";
const wrongCredentials = "Wrong username/email or password.";

// Without test hooks, the dev server would really send these emails (through
// Resend, when .env.local has RESEND_API_KEY), so make sure they're on first.
test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/test/outbox");
  expect(
    response.status(),
    "Test hooks are off: stop your dev server so Playwright starts one, or start it with E2E_TEST_HOOKS=1",
  ).toBe(200);
});

/** Signs up a new account and confirms its email (resets only go to a confirmed one), then logs out. */
async function existingUser(page: Page): Promise<TestUser> {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await confirmEmail(page, user.email);
  await logOut(page, user.username);
  return user;
}

async function requestReset(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(requested);
}

/** The reset emails the app sent to `address`, oldest first (not the one confirming it). */
const emailsTo = (request: APIRequestContext, address: string) =>
  allEmailsTo(request, address, "Reset your diogomota.com password");

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

/** Makes the reset link's token an hour old: Better Auth keeps only the token's hash (auth.ts). */
async function expire(link: string) {
  const token = new URL(link, "http://n.invalid").searchParams.get("token")!;
  const { rowCount } = await withDatabase((client) =>
    client.query(`UPDATE verifications SET expires_at = now() - interval '1 second' WHERE identifier = $1`, [
      createHash("sha256").update(`reset-password:${token}`).digest("base64url"),
    ]),
  );
  expect(rowCount).toBe(1);
}

test("the emailed link resets the password once, by the sign-up's rules, and logs out every session @smoke", async ({
  page,
  context,
  browser,
  request,
}) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await confirmEmail(page, user.email);
  const otherDevice = await browser.newContext();
  const other = await otherDevice.newPage();
  await logIn(other, user.username, user.password);
  await expect(other).toHaveURL("/");

  // Reset from this device while it's still logged in, with the link open in two tabs.
  await requestReset(page, user.email);
  const link = await resetLink(request, user.email);
  const otherTab = await context.newPage();
  await otherTab.goto(link);
  await page.goto(link);
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

  // Used, the link doesn't work again, not even from a page opened before.
  await setNewPassword(otherTab, "the second new password");
  await expect(heading(otherTab)).toHaveText("Link expired");
  await expect(otherTab.getByRole("main")).toContainText(linkExpired);
  await page.goto(link);
  await expect(heading(page)).toHaveText("Link expired");
  await page.getByRole("link", { name: "Get a new link" }).click();
  await expect(page).toHaveURL("/forgot-password");

  // Every session of the account is logged out.
  for (const tab of [page, other]) {
    await tab.goto("/shared");
    await expect(tab).toHaveURL("/?next=%2Fshared");
  }
  await otherDevice.close();

  await logIn(page, user.username, user.password);
  await expect(formAlert(page)).toHaveText(wrongCredentials);
  await logIn(page, user.username, "the second new password");
  await expect(formAlert(page)).toHaveText(wrongCredentials);
  await logIn(page, user.email, "a brand new password");
  await expect(page).toHaveURL("/");
  await expect(accountButton(page, user.username)).toBeVisible();
});

test("the same answer whether or not an account has the email, or has confirmed it; a link expires after an hour", async ({
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
  expect(email.text).toContain(`Hi ${user.name},`);
  expect(email.html).toContain(`">Choose a new password</a>`);
  expect(email.html).toContain(link);
  expect(await emailsTo(request, unknown)).toEqual([]);

  // An email nobody confirmed gets no reset link, and the same answer.
  const unconfirmed = newUser();
  await signUp(page, unconfirmed);
  await expect(page).toHaveURL("/");
  // Until it is, home says so.
  await expect(page.getByRole("main")).toContainText(`Confirm your email (${unconfirmed.email})`);
  await logOut(page, unconfirmed.username);
  await requestReset(page, unconfirmed.email);
  // The sign-up's confirmation is the only email it got.
  await expect.poll(async () => (await allEmailsTo(request, unconfirmed.email)).length).toBe(1);

  // The hour passes while the reset page is open: the link is refused, and the password stays the same.
  await page.goto(link);
  await expect(heading(page)).toHaveText("Reset password");
  await expire(link);
  await setNewPassword(page, "a brand new password");
  await expect(heading(page)).toHaveText("Link expired");
  await page.goto(link);
  await expect(page.getByRole("main")).toContainText(linkExpired);
  await logIn(page, user.username, user.password);
  await expect(page).toHaveURL("/");
  expect(await emailsTo(request, unconfirmed.email)).toEqual([]);
});

test("a new request replaces the earlier link, and an address gets at most 3 an hour, with the same answer after that", async ({
  page,
  request,
}) => {
  const user = await existingUser(page);
  for (let i = 0; i < 4; i++) await requestReset(page, user.email);

  // The 4th request sent nothing, so the 3rd link is the one that works.
  const three = await resetLink(request, user.email, 3);
  const [one, two] = (await emailsTo(request, user.email)).slice(0, 2).map(({ text }) => {
    const url = new URL(text.match(/^https?:\/\/\S+\/reset-password\?token=\S+$/m)![0]);
    return `${url.pathname}${url.search}`;
  });
  expect(new Set([one, two, three]).size).toBe(3);
  for (const old of [one, two]) {
    await page.goto(old);
    await expect(heading(page)).toHaveText("Link expired");
  }
  await page.goto(three);
  await setNewPassword(page, "a brand new password");
  await expect(page).toHaveURL("/login?password=changed");
  expect(await emailsTo(request, user.email)).toHaveLength(3);
});
