import { type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { initials } from "../lib/names";
import { withDatabase } from "./db";
import {
  accountButton,
  accountSetting,
  confirmEmail,
  confirmSubject,
  emailsTo,
  expect,
  formAlert,
  linkNames,
  logIn,
  logOut,
  newUser,
  signUp,
  test,
} from "./fixtures";

/** Clicks what opens a popup on /account (a setting's row, the profile picture, Update password) and returns the popup. */
async function openPopup(page: Page, opener: Locator, name: string) {
  await opener.click();
  const dialog = page.getByRole("dialog", { name, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
const openSetting = (page: Page, name: string) => openPopup(page, accountSetting(page, name), name);
const profilePicture = (page: Page) =>
  page.getByRole("main").getByRole("button", { name: "Profile picture", exact: true });
/** What the last popup saved, said under the settings once it closes. */
const notice = (page: Page, text: string) => page.getByRole("main").getByRole("status").filter({ hasText: text });

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test("Account and Home in the tab bar go between home and the settings; /account has no top bar", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  const bar = page.getByRole("navigation", { name: "Account", exact: true });
  // On a wide screen, the site's name on the left, then the tabs.
  expect(await linkNames(bar)).toEqual(["diogomota.com", "Account", "Home"]);
  await expect(bar.getByRole("link", { name: "diogomota.com" })).toHaveAttribute("href", "/");
  await expect(bar.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");

  await bar.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("heading", { level: 1, name: "account" })).toBeVisible();
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to apps" })).toHaveCount(0);
  await expect(bar.getByRole("link", { name: "Account", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(bar.getByRole("link", { name: "Home", exact: true })).not.toHaveAttribute("aria-current");

  // Who is logged in: their settings, each with what it is now.
  await expect(page.getByRole("main")).toContainText(user.email);
  await bar.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
});

test("Account: the profile picture in the middle, a row per setting with its value, then Log out, About and Privacy", async ({
  page,
}) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  const main = page.getByRole("main");

  // The picture (the name's initials, without one), in the middle of the column, over the rows.
  const picture = profilePicture(page);
  await expect(picture).toContainText(initials(user.username, user.name));
  const list = main.getByRole("list");
  const [pictureBox, listBox] = [(await picture.boundingBox())!, (await list.boundingBox())!];
  expect(Math.abs(pictureBox.x + pictureBox.width / 2 - (listBox.x + listBox.width / 2))).toBeLessThanOrEqual(1);
  expect(pictureBox.y + pictureBox.height).toBeLessThan(listBox.y);

  await expect(list.getByRole("button")).toHaveText([
    new RegExp(`^Name.*${user.name}`),
    new RegExp(`^Username.*${user.username}`),
    new RegExp(`^Email.*${user.email}`),
    /^Theme.*Light/,
    /^Password.*Change/,
  ]);
  // Nothing else to open on the page: no dropdowns.
  await expect(main.locator("details")).toHaveCount(0);
  // Log out on its own under the rows, then About and Privacy under it.
  const update = accountSetting(page, "Password");
  const logOutButton = main.getByRole("button", { name: "Log out", exact: true });
  const logOutBox = (await logOutButton.boundingBox())!;
  expect(logOutBox.y).toBeGreaterThan(listBox.y + listBox.height);
  for (const [name, href] of [
    ["About", "/about"],
    ["Privacy", "/privacy"],
  ]) {
    const link = main.getByRole("link", { name, exact: true }).first();
    await expect(link).toHaveAttribute("href", href);
  }
  expect((await main.getByRole("link", { name: "About", exact: true }).boundingBox())!.y).toBeGreaterThan(
    logOutBox.y + logOutBox.height,
  );

  // Each opens a popup, which Escape, a click outside or its × closes, back on the button that opened it.
  for (const name of ["Name", "Username", "Email", "Theme"]) {
    const dialog = await openSetting(page, name);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(accountSetting(page, name)).toBeFocused();
  }
  const dialog = await openPopup(page, picture, "Profile picture");
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
  const password = await openPopup(page, update, "Update password");
  await password.getByRole("button", { name: "Close" }).click();
  await expect(password).toBeHidden();

  await logOutButton.click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Log in" })).toBeVisible();
});

test("change username", async ({ page }) => {
  const taken = newUser();
  await signUp(page, taken);
  await expect(page).toHaveURL("/");
  await logOut(page, taken.username);

  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/account");

  const form = await openSetting(page, "Username");
  const field = form.getByLabel("Username");
  const save = form.getByRole("button", { name: "Save username" });
  await expect(field).toHaveValue(user.username);
  await expect(field).toBeFocused();

  await field.fill("not valid!");
  await expect(form.getByText("Use 3-20 characters: a-z, 0-9 and _.")).toBeVisible();

  await field.fill(taken.username.toUpperCase());
  await expect(form.getByText("That username is taken.")).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await save.click();
  await expect(save).toBeEnabled();
  await expect(form.getByText("That username is taken.")).toBeVisible();

  await field.fill(user.username.toUpperCase());
  await expect(form.getByRole("status")).toHaveText("3-20 characters: a-z, 0-9 and _.");
  await expect(field).not.toHaveAttribute("aria-invalid", "true");

  const renamed = newUser().username;
  await field.fill(renamed);
  await expect(form.getByRole("status")).toHaveText("That username is available.");
  await expect(accountButton(page, user.username)).toBeVisible();
  await save.click();
  // Saved, the popup closes, and the row has the new one.
  await expect(form).toBeHidden();
  await expect(notice(page, "Username changed.")).toBeVisible();
  await expect(accountSetting(page, "Username")).toContainText(renamed);
  // The session has the new name too.
  await expect(accountButton(page, renamed)).toBeVisible();
  await page.goto("/shows");
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeVisible();

  await logOut(page, renamed);
  await logIn(page, user.username, user.password);
  await expect(formAlert(page)).toHaveText("Wrong username/email or password.");
  await logIn(page, renamed, user.password);
  await expect(page).toHaveURL("/");
  await expect(accountButton(page, renamed)).toBeVisible();
});

test("username checks ignore old responses and recover after a network failure", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  const form = await openSetting(page, "Username");
  const field = form.getByLabel("Username");
  const status = form.getByRole("status");
  const endpoint = "**/api/account/username?*";
  let releaseOld!: () => void;
  const oldResponse = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  let oldStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    oldStarted = resolve;
  });
  let oldFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    oldFinished = resolve;
  });
  await page.route(endpoint, async (route) => {
    if (new URL(route.request().url()).searchParams.get("username") === "e2e_slow") {
      oldStarted();
      await oldResponse;
      await route.fulfill({ json: { data: { available: false } } });
      oldFinished();
    } else {
      await route.fulfill({ json: { data: { available: true } } });
    }
  });
  await field.fill("e2e_slow");
  await started;
  await expect(status).toHaveText("Checking availability…");
  await field.fill("e2e_fast");
  await expect(status).toHaveText("That username is available.");
  releaseOld();
  await finished;
  await expect(status).toHaveText("That username is available.");

  await page.unroute(endpoint);
  await page.route(endpoint, (route) => route.abort());
  await field.fill(newUser().username);
  await expect(status).toHaveText("Could not reach the server. Check your connection.");
  await page.unroute(endpoint);
  await field.fill(newUser().username);
  await expect(status).toHaveText("That username is available.");
});

test("username availability requires login, validates input and limits checks", async ({
  page,
  playwright,
  baseURL,
}) => {
  const endpoint = "/api/account/username";
  const anonymous = await playwright.request.newContext({ baseURL });
  expect((await anonymous.get(`${endpoint}?username=someone`)).status()).toBe(401);
  await anonymous.dispose();
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  expect((await page.request.get(`${endpoint}?username=ab`)).status()).toBe(400);
  const own = await page.request.get(`${endpoint}?username=${user.username.toUpperCase()}`);
  expect(await own.json()).toEqual({ data: { available: true } });
  expect(own.headers()["cache-control"]).toContain("no-store");
  for (let i = 1; i < 60; i++) {
    expect((await page.request.get(`${endpoint}?username=${user.username}`)).status()).toBe(200);
  }
  expect((await page.request.get(`${endpoint}?username=${user.username}`)).status()).toBe(429);
});

test("Name sets the name, one word or more, which Shows' Profile shows over the @username", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  // The one given at sign-up, on its row.
  const nameRow = accountSetting(page, "Name");
  await expect(nameRow).toContainText(user.name);
  let name = await openSetting(page, "Name");
  // One field, for the whole name.
  await expect(name.getByRole("textbox")).toHaveCount(1);
  const field = name.getByLabel("Name", { exact: true });
  await expect(field).toHaveValue(user.name);
  await expect(field).toBeFocused();

  // A name is needed, one word is enough. Spaces around and between words are tidied.
  await field.fill("   ");
  await name.getByRole("button", { name: "Save name" }).click();
  await expect(name.getByText("Enter your name.")).toBeVisible();
  await field.fill("  Ana  ");
  await name.getByRole("button", { name: "Save name" }).click();
  await expect(name).toBeHidden();
  await expect(notice(page, "Name saved.")).toBeVisible();
  await expect(nameRow).toContainText("Ana");
  name = await openSetting(page, "Name");
  // The message goes when another popup opens.
  await expect(notice(page, "Name saved.")).toHaveCount(0);
  await field.fill("  Ana   Sofia  Reis ");
  await name.getByRole("button", { name: "Save name" }).click();
  await expect(nameRow).toContainText("Ana Sofia Reis");
  await openSetting(page, "Name");
  await expect(field).toHaveValue("Ana Sofia Reis");

  await page.goto("/shows");
  await page
    .getByRole("navigation", { name: "Shows", exact: true })
    .getByRole("button", { name: "Profile", exact: true })
    .click();
  const main = page.getByRole("main");
  await expect(main.getByText("Ana Sofia Reis", { exact: true })).toBeVisible();
  await expect(main.getByText(`@${user.username}`, { exact: true })).toBeVisible();
});

test("Email changes with the current password, once the link sent to the new one is opened, and logs in after", async ({
  page,
}) => {
  const taken = newUser();
  await signUp(page, taken);
  await expect(page).toHaveURL("/");
  await logOut(page, taken.username);
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/account");

  const emailRow = accountSetting(page, "Email");
  await expect(emailRow).toContainText(user.email);
  const form = await openSetting(page, "Email");
  const field = form.getByLabel("Email", { exact: true });
  const password = form.getByLabel("Current password");
  const save = form.getByRole("button", { name: "Save email" });
  await expect(field).toHaveValue(user.email);
  await expect(field).toBeFocused();

  await field.fill("not an email");
  await save.click();
  await expect(form.getByText("Enter a valid email, like name@example.com.")).toBeVisible();
  await expect(form.getByText("Enter your current password.")).toBeVisible();

  const email = `${newUser().username}@example.test`;
  await field.fill(email);
  await password.fill("not the password");
  await save.click();
  await expect(form.getByText("That isn't your current password.")).toBeVisible();

  // One another account has: the same answer (it says nothing of who has an account), and nothing changes.
  await field.fill(taken.email.toUpperCase());
  await password.fill(user.password);
  await save.click();
  await expect(form).toBeHidden();
  await expect(
    notice(page, `We sent a link to ${taken.email.toUpperCase()}. Your email changes once you open it.`),
  ).toBeVisible();
  expect(await emailsTo(page.request, taken.email, confirmSubject)).toHaveLength(1);

  await openSetting(page, "Email");
  await field.fill(email);
  await password.fill(user.password);
  await save.click();
  await expect(form).toBeHidden();
  await expect(notice(page, `We sent a link to ${email}. Your email changes once you open it.`)).toBeVisible();
  // Not until the link is opened.
  await expect(emailRow).toContainText(user.email);
  await confirmEmail(page, email, "Your email is changed.");
  await expect(emailRow).toContainText(email);
  await expect(emailRow).not.toContainText("not confirmed");

  // Logs in with the new one, not the old one.
  await logOut(page, user.username);
  await logIn(page, user.email, user.password);
  await expect(formAlert(page)).toHaveText("Wrong username/email or password.");
  await logIn(page, email, user.password);
  await expect(page).toHaveURL("/");
});

test("change password, which logs out every device", async ({ page, browser }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  const otherDevice = await browser.newContext();
  const other = await otherDevice.newPage();
  await logIn(other, user.username, user.password);
  await expect(other).toHaveURL("/");
  await page.goto("/account");

  const form = await openPopup(page, accountSetting(page, "Password"), "Update password");
  await expect(form.getByLabel("Current password")).toBeFocused();
  const newPassword = "a whole new password";
  async function submit(current: string, password: string, confirm: string) {
    await form.getByLabel("Current password").fill(current);
    await form.getByLabel("New password", { exact: true }).fill(password);
    await form.getByLabel("Confirm new password").fill(confirm);
    await form.getByRole("button", { name: "Change password" }).click();
  }

  await submit("not the password", newPassword, newPassword);
  await expect(form.getByText("That isn't your current password.")).toBeVisible();

  await submit(user.password, newPassword, "something else entirely");
  await expect(form.getByText("The new passwords don't match.")).toBeVisible();

  await submit(user.password, "short", "short");
  await expect(form.getByText("Use at least 10 characters.")).toBeVisible();

  await submit(user.password, newPassword, newPassword);
  await expect(page).toHaveURL("/login?password=changed&next=%2Faccount");
  await expect(page.getByRole("main")).toContainText("Your password was changed. Log in with the new one.");
  await other.goto("/shared");
  await expect(other).toHaveURL("/?next=%2Fshared");
  await otherDevice.close();

  await logIn(page, user.username, user.password);
  await expect(formAlert(page)).toHaveText("Wrong username/email or password.");
  // Back to account settings.
  await logIn(page, user.username, newPassword, "/login?next=%2Faccount");
  await expect(page).toHaveURL("/account");
});

test("theme preference persists after logging in again", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");

  const app = page.locator("[data-theme]");
  await page.goto("/shared");
  await expect(app).toHaveAttribute("data-theme", "minimal-neutrals");

  await page.goto("/account");
  // The theme in use, on its row; two to choose from, Light and Dark.
  const themeRow = accountSetting(page, "Theme");
  await expect(themeRow).toContainText("Light");
  const form = await openSetting(page, "Theme");
  await expect(form.getByRole("radio")).toHaveCount(2);
  await expect(form.getByRole("radio", { name: "Light", exact: true })).toBeChecked();
  await form.getByRole("radio", { name: "Dark", exact: true }).check();
  await form.getByRole("button", { name: "Save theme" }).click();
  await expect(form).toBeHidden();
  await expect(notice(page, "Theme saved.")).toBeVisible();
  await expect(app).toHaveAttribute("data-theme", "graphite");

  await logOut(page, user.username);
  await logIn(page, user.username, user.password);
  await expect(page).toHaveURL("/");

  await page.goto("/account");
  await expect(themeRow).toContainText("Dark");
  await openSetting(page, "Theme");
  await expect(form.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  await page.goto("/shared");
  await expect(app).toHaveAttribute("data-theme", "graphite");
  await expect(app).toHaveCSS("background-color", "rgb(31, 32, 35)");
});

test("a profile picture, chosen or dropped, is adjusted, made small and shows in the account menu; Remove picture takes it away", async ({
  page,
  request,
}) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  const picture = await openPopup(page, profilePicture(page), "Profile picture");
  // The account menu's button (the menu repeats it, for phones, once open).
  const menuPicture = accountButton(page, user.username).locator("img");
  await expect(menuPicture).toHaveCount(0);

  // A landscape phone photo, with metadata that mustn't be kept: blue on the left, orange on the right.
  const half = { width: 800, height: 1200, channels: 3 } as const;
  const photo = await sharp({ create: { ...half, width: 1600, background: "#3366cc" } })
    .composite([
      {
        input: await sharp({ create: { ...half, background: "#ff8800" } })
          .png()
          .toBuffer(),
        left: 800,
        top: 0,
      },
    ])
    .withExif({ IFD0: { Copyright: "Where it was taken" } })
    .jpeg()
    .toBuffer();
  await picture.locator('input[type="file"]').setInputFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: photo });

  // Nothing is sent yet: first, which part of it to show, over the popup. Cancel keeps what there was.
  const crop = page.getByRole("dialog", { name: "Adjust your picture" });
  await expect(crop.getByRole("button", { name: "Save picture" })).toBeEnabled();
  await crop.getByRole("button", { name: "Cancel" }).click();
  await expect(crop).toBeHidden();
  await expect(picture).toBeVisible();
  await expect(menuPicture).toHaveCount(0);
  await picture.locator('input[type="file"]').setInputFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: photo });

  // Zoomed all the way in (the slider, from the keyboard), then dragged to the photo's right edge: all orange.
  const zoom = crop.getByRole("slider", { name: "Zoom" });
  await zoom.focus();
  await page.keyboard.press("End");
  await expect(zoom).toHaveValue("4");
  await expect(crop.getByRole("button", { name: "Zoom in" })).toBeDisabled();
  const stage = crop.getByRole("application", { name: "Picture position" });
  const box = (await stage.boundingBox())!;
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
  }
  await crop.getByRole("button", { name: "Save picture" }).click();
  await expect(crop).toBeHidden();
  // Saved: the popup closes, and the page has it, in the middle, as does the account menu.
  await expect(picture).toBeHidden();
  await expect(notice(page, "Profile picture saved.")).toBeVisible();
  await expect(menuPicture).toHaveAttribute("src", /^\/api\/avatars\/[0-9a-f-]{36}\?v=\d+$/);
  const url = (await menuPicture.getAttribute("src"))!;
  await expect(profilePicture(page).locator("img")).toHaveAttribute("src", url);

  // Saved square, 512 px, as WebP without the photo's metadata, and only for those logged in.
  const saved = await page.request.get(url);
  expect(saved.headers()["content-type"]).toBe("image/webp");
  const info = await sharp(await saved.body()).metadata();
  expect({ format: info.format, width: info.width, height: info.height, exif: info.exif }).toEqual({
    format: "webp",
    width: 512,
    height: 512,
    exif: undefined,
  });
  // The part chosen: the orange right.
  const [red, green, blue] = (await sharp(await saved.body()).stats()).channels.map((channel) => channel.mean);
  expect(red).toBeGreaterThan(230);
  expect(green).toBeGreaterThan(110);
  expect(green).toBeLessThan(160);
  expect(blue).toBeLessThan(30);
  expect((await request.get(url)).status()).toBe(401);

  // Shown on the other pages too.
  await page.goto("/");
  await expect(menuPicture).toHaveAttribute("src", url);
  await page.goto("/account");
  await openPopup(page, profilePicture(page), "Profile picture");
  await expect(picture.locator(`img[src="${url}"]`)).toHaveCount(1);

  // Dropped on the drop zone: a new picture, at a new URL.
  const dropped = await page.evaluateHandle(
    async (base64) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      transfer.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
      return transfer;
    },
    (
      await sharp({ create: { width: 300, height: 500, channels: 4, background: "#ff8800" } })
        .png()
        .toBuffer()
    ).toString("base64"),
  );
  await picture.locator("label").dispatchEvent("drop", { dataTransfer: dropped });
  await crop.getByRole("button", { name: "Save picture" }).click();
  await expect(notice(page, "Profile picture saved.")).toBeVisible();
  await expect(menuPicture).not.toHaveAttribute("src", url);

  // What isn't a picture says so, here or (pretending to be one, which the browser can't show, so it goes as it is) from the server.
  await openPopup(page, profilePicture(page), "Profile picture");
  await picture
    .locator('input[type="file"]')
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(picture.getByRole("alert")).toHaveText("That isn't a picture. Choose a JPEG, PNG or WebP.");
  await picture
    .locator('input[type="file"]')
    .setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
  await expect(picture.getByRole("alert")).toHaveText(
    "That file isn't a picture that can be read. Try a JPEG, PNG or WebP.",
  );
  await expect(menuPicture).toHaveCount(1);

  // Removed: the initial again, and the picture is gone.
  const current = (await menuPicture.getAttribute("src"))!;
  await picture.getByRole("button", { name: "Remove picture" }).click();
  await expect(picture).toBeHidden();
  await expect(notice(page, "Profile picture removed.")).toBeVisible();
  await expect(menuPicture).toHaveCount(0);
  await expect(accountButton(page, user.username)).toContainText(initials(user.username, user.name));
  await expect(profilePicture(page)).toContainText(initials(user.username, user.name));
  expect((await page.request.get(current)).status()).toBe(404);
});

test("forgot password, in Update password, opens the reset by email", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/account");

  const password = await openPopup(page, accountSetting(page, "Password"), "Update password");
  await expect(password).toContainText("Don't know your current password?");
  await password.getByRole("link", { name: "Reset it by email" }).click();
  await expect(page).toHaveURL("/forgot-password");
});

test("logged out, /account redirects home and Log in comes back to it", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL("/?next=%2Faccount");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Log in" })).toHaveAttribute(
    "href",
    "/login?next=%2Faccount",
  );
});

test.describe("at 320px wide", () => {
  test.use({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });

  test("logged-in home and /account, with a popup open, have no horizontal scroll", async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await expect(page).toHaveURL("/");
    await expectNoHorizontalScroll(page);

    await expect(page.getByRole("link", { name: "Account", exact: true })).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);

    await page.goto("/account");
    await expectNoHorizontalScroll(page);
    // On a touch screen, a popup opens without its field focused: the keyboard
    // would come up over it. A tap on the field types.
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    for (const name of ["Name", "Username", "Email"]) {
      const popup = await openSetting(page, name);
      await expect(popup.getByRole("textbox").first()).not.toBeFocused();
      await expect(popup.getByRole("button", { name: "Close" })).toBeFocused();
      await popup.getByRole("textbox").first().tap();
      await expect(popup.getByRole("textbox").first()).toBeFocused();
      await popup.getByRole("button", { name: "Close" }).tap();
      await expect(popup).toBeHidden();
    }
    const theme = await openSetting(page, "Theme");
    await expect(theme).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);
  });
});

test("a theme that no longer exists shows as Light", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await withDatabase((db) =>
    db.query("UPDATE users SET theme_preference = 'space' WHERE username = $1", [user.username]),
  );
  await page.goto("/account");
  await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "minimal-neutrals");
  await expect(accountSetting(page, "Theme")).toContainText("Light");
});

test("an email not confirmed yet says so, and the link can be sent again", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  await expect(accountSetting(page, "Email")).toContainText("(not confirmed)");
  await page.getByRole("button", { name: "Send the link again" }).click();
  await expect(
    page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: `We sent a new link to ${user.email}.` }),
  ).toBeVisible();
  await expect.poll(async () => (await emailsTo(page.request, user.email, confirmSubject)).length).toBe(2);
  await confirmEmail(page, user.email);
  await expect(accountSetting(page, "Email")).not.toContainText("not confirmed");
  await expect(page.getByRole("button", { name: "Send the link again" })).toHaveCount(0);
});

test("Download my data has the account, library and space; Delete my account takes the password and deletes it all", async ({
  page,
}) => {
  const user = newUser();
  await signUp(page, user, "/signup?next=%2Fshared");
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  const { data: space } = await (await page.request.get("/api/shared/spaces")).json();
  await page.goto("/account");

  // A file with what the site keeps about them.
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download my data" }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/^diogomota-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await (await import("node:fs/promises")).readFile((await file.path())!, "utf8"));
  expect(data.account).toMatchObject({ username: user.username, email: user.email, name: user.name });
  expect(data.shared.members).toEqual([{ username: user.username, name: user.name, role: "owner" }]);
  expect(data.shows.library).toEqual([]);
  expect(JSON.stringify(data)).not.toContain("password");

  // Deleting: the password first.
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete my account" });
  await dialog.getByLabel("Password").fill("not the password");
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(dialog.getByText("That isn't your password.")).toBeVisible();
  await dialog.getByLabel("Password").fill(user.password);
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL("/?account=deleted");
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    "Your account and everything it had here were deleted.",
  );
  await withDatabase(async (db) => {
    expect((await db.query("SELECT 1 FROM users WHERE username = $1", [user.username])).rowCount).toBe(0);
    // The space went with its last member.
    expect((await db.query("SELECT 1 FROM spaces WHERE id = $1", [space.id])).rowCount).toBe(0);
  });
  await logIn(page, user.username, user.password);
  await expect(formAlert(page)).toHaveText("Wrong username/email or password.");
});
