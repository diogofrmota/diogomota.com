import { type Page } from "@playwright/test";
import sharp from "sharp";
import { accountButton, expect, formAlert, logIn, logOut, newUser, signUp, test } from "./fixtures";

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** The settings are dropdowns, closed on load: opens one and returns it. */
async function openSection(page: Page, name: string) {
  const region = section(page, name);
  const heading = region.getByRole("heading", { name, exact: true });
  await heading.click();
  await expect(region.locator("details")).toHaveAttribute("open", "");
  return region;
}

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test("the account menu opens settings, and closes with Escape or a click outside", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");

  const button = accountButton(page, user.username);
  const settings = page.getByRole("link", { name: "Account", exact: true });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(settings).toBeHidden();

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(settings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await expect(button).toBeFocused();

  await button.click();
  await expect(settings).toBeVisible();
  // Its left end: on a phone, the open menu covers the rest of the heading.
  await page.getByRole("heading", { level: 1, name: "apps" }).click({ position: { x: 5, y: 5 } });
  await expect(settings).toBeHidden();

  await button.click();
  await settings.click();
  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("heading", { level: 1, name: "account" })).toBeVisible();

  // Who is logged in, under the title.
  await expect(page.getByRole("main")).toContainText(user.email);
  await page.getByRole("link", { name: "Back to apps" }).click();
  await expect(page).toHaveURL("/apps");
});

test("change username", async ({ page }) => {
  const taken = newUser();
  await signUp(page, taken);
  await expect(page).toHaveURL("/apps");
  await logOut(page, taken.username);

  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await page.goto("/account");

  const form = await openSection(page, "Username");
  const field = form.getByLabel("Username");
  const save = form.getByRole("button", { name: "Save username" });
  await expect(field).toHaveValue(user.username);

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
  await expect(form.getByRole("status")).toHaveText("Username changed.");
  // The session has the new name too.
  await expect(accountButton(page, renamed)).toBeVisible();
  await page.goto("/shows");
  await expect(accountButton(page, renamed)).toBeVisible();

  await logOut(page, renamed);
  await logIn(page, user.username, user.password);
  await expect(formAlert(page)).toHaveText("Wrong username/email or password.");
  await logIn(page, renamed, user.password);
  await expect(page).toHaveURL("/apps");
  await expect(accountButton(page, renamed)).toBeVisible();
});

test("username checks ignore old responses and recover after a network failure", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await page.goto("/account");
  const form = await openSection(page, "Username");
  const field = form.getByLabel("Username");
  const status = form.getByRole("status");
  const endpoint = "**/api/account/username?*";
  let releaseOld!: () => void;
  const oldResponse = new Promise<void>((resolve) => { releaseOld = resolve; });
  let oldStarted!: () => void;
  const started = new Promise<void>((resolve) => { oldStarted = resolve; });
  let oldFinished!: () => void;
  const finished = new Promise<void>((resolve) => { oldFinished = resolve; });
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

test("username availability requires login, validates input and limits checks", async ({ page, playwright, baseURL }) => {
  const endpoint = "/api/account/username";
  const anonymous = await playwright.request.newContext({ baseURL });
  expect((await anonymous.get(`${endpoint}?username=someone`)).status()).toBe(401);
  await anonymous.dispose();
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
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
  await expect(page).toHaveURL("/apps");
  await page.goto("/account");
  // The one given at sign-up, by the dropdown's name.
  await expect(section(page, "Name").locator("summary")).toContainText(user.name);
  const name = await openSection(page, "Name");
  // One field, for the whole name.
  await expect(name.getByRole("textbox")).toHaveCount(1);
  const field = name.getByLabel("Name", { exact: true });
  await expect(field).toHaveValue(user.name);

  // A name is needed, one word is enough. Spaces around and between words are tidied.
  await field.fill("   ");
  await name.getByRole("button", { name: "Save name" }).click();
  await expect(name.getByText("Enter your name.")).toBeVisible();
  await field.fill("  Ana  ");
  await name.getByRole("button", { name: "Save name" }).click();
  await expect(name.getByRole("status")).toHaveText("Name saved.");
  await expect(name.locator("summary")).toContainText("Ana");
  await field.fill("  Ana   Sofia  Reis ");
  await name.getByRole("button", { name: "Save name" }).click();
  await expect(name.locator("summary")).toContainText("Ana Sofia Reis");
  await expect(field).toHaveValue("Ana Sofia Reis");

  await page.goto("/shows");
  await page.getByRole("navigation", { name: "Shows", exact: true }).getByRole("button", { name: "Profile", exact: true }).click();
  const main = page.getByRole("main");
  await expect(main.getByText("Ana Sofia Reis", { exact: true })).toBeVisible();
  await expect(main.getByText(`@${user.username}`, { exact: true })).toBeVisible();
});

test("change password, which logs out every device", async ({ page, browser }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  const otherDevice = await browser.newContext();
  const other = await otherDevice.newPage();
  await logIn(other, user.username, user.password);
  await expect(other).toHaveURL("/apps");
  await page.goto("/account");

  const form = await openSection(page, "Password");
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
  await expect(other).toHaveURL("/apps?next=%2Fshared");
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
  await expect(page).toHaveURL("/apps");

  const app = page.locator("[data-theme]");
  await page.goto("/shared");
  await expect(app).toHaveAttribute("data-theme", "light-2");

  await page.goto("/account");
  const form = await openSection(page, "Theme");
  // The theme in use, on the row, before it's opened.
  await expect(form.locator("summary")).toContainText("Light mode");
  await expect(form.getByRole("radio", { name: "Light mode", exact: true })).toBeChecked();
  await form.getByRole("radio", { name: "Graphite", exact: true }).check();
  await form.getByRole("button", { name: "Save theme" }).click();
  await expect(form.getByRole("status")).toHaveText("Theme saved.");

  await logOut(page, user.username);
  await logIn(page, user.username, user.password);
  await expect(page).toHaveURL("/apps");

  await page.goto("/account");
  await expect(form.locator("summary")).toContainText("Graphite");
  await openSection(page, "Theme");
  await expect(form.getByRole("radio", { name: "Graphite", exact: true })).toBeChecked();
  await page.goto("/shared");
  await expect(app).toHaveAttribute("data-theme", "graphite");
  await expect(app).toHaveCSS("background-color", "rgb(31, 32, 35)");
});

test("a profile picture, chosen or dropped, is adjusted, made small and shows in the account menu; Remove picture takes it away", async ({ page, request }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await page.goto("/account");
  // After Password.
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }))
    .toHaveText(["Name", "Username", "Password", "Profile picture", "Theme"]);
  const picture = await openSection(page, "Profile picture");
  // The account menu's button (the menu repeats it, for phones, once open).
  const menuPicture = accountButton(page, user.username).locator("img");
  await expect(menuPicture).toHaveCount(0);

  // A landscape phone photo, with metadata that mustn't be kept: blue on the left, orange on the right.
  const half = { width: 800, height: 1200, channels: 3 } as const;
  const photo = await sharp({ create: { ...half, width: 1600, background: "#3366cc" } })
    .composite([{ input: await sharp({ create: { ...half, background: "#ff8800" } }).png().toBuffer(), left: 800, top: 0 }])
    .withExif({ IFD0: { Copyright: "Where it was taken" } }).jpeg().toBuffer();
  await picture.locator('input[type="file"]').setInputFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: photo });

  // Nothing is sent yet: first, which part of it to show. Cancel keeps what there was.
  const crop = page.getByRole("dialog", { name: "Adjust your picture" });
  await expect(crop.getByRole("button", { name: "Save picture" })).toBeEnabled();
  await crop.getByRole("button", { name: "Cancel" }).click();
  await expect(crop).toBeHidden();
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
  await expect(picture.getByRole("status").filter({ hasText: "Profile picture" })).toHaveText("Profile picture saved.");
  await expect(menuPicture).toHaveAttribute("src", /^\/api\/avatars\/[0-9a-f-]{36}\?v=\d+$/);
  const url = (await menuPicture.getAttribute("src"))!;
  await expect(page.getByRole("main").locator(`img[src="${url}"]`)).toHaveCount(2);

  // Saved square, 512 px, as WebP without the photo's metadata, and only for those logged in.
  const saved = await page.request.get(url);
  expect(saved.headers()["content-type"]).toBe("image/webp");
  const info = await sharp(await saved.body()).metadata();
  expect({ format: info.format, width: info.width, height: info.height, exif: info.exif }).toEqual({ format: "webp", width: 512, height: 512, exif: undefined });
  // The part chosen: the orange right.
  const [red, green, blue] = (await sharp(await saved.body()).stats()).channels.map((channel) => channel.mean);
  expect(red).toBeGreaterThan(230);
  expect(green).toBeGreaterThan(110);
  expect(green).toBeLessThan(160);
  expect(blue).toBeLessThan(30);
  expect((await request.get(url)).status()).toBe(401);

  // Shown on the other pages too.
  await page.goto("/apps");
  await expect(menuPicture).toHaveAttribute("src", url);
  await page.goto("/account");
  await openSection(page, "Profile picture");

  // Dropped on the drop zone: a new picture, at a new URL.
  const dropped = await page.evaluateHandle(async (base64) => {
    const transfer = new DataTransfer();
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    transfer.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
    return transfer;
  }, (await sharp({ create: { width: 300, height: 500, channels: 4, background: "#ff8800" } }).png().toBuffer()).toString("base64"));
  await picture.locator("label").dispatchEvent("drop", { dataTransfer: dropped });
  await crop.getByRole("button", { name: "Save picture" }).click();
  await expect(picture.getByRole("status").filter({ hasText: "Profile picture" })).toHaveText("Profile picture saved.");
  await expect(menuPicture).not.toHaveAttribute("src", url);

  // What isn't a picture says so, here or (pretending to be one, which the browser can't show, so it goes as it is) from the server.
  await picture.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(picture.getByRole("alert")).toHaveText("That isn't a picture. Choose a JPEG, PNG or WebP.");
  await picture.locator('input[type="file"]').setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
  await expect(picture.getByRole("alert")).toHaveText("That file isn't a picture that can be read. Try a JPEG, PNG or WebP.");
  await expect(menuPicture).toHaveCount(1);

  // Removed: the initial again, and the picture is gone.
  const current = (await menuPicture.getAttribute("src"))!;
  await picture.getByRole("button", { name: "Remove picture" }).click();
  await expect(picture.getByRole("status").filter({ hasText: "Profile picture" })).toHaveText("Profile picture removed.");
  await expect(menuPicture).toHaveCount(0);
  await expect(accountButton(page, user.username)).toContainText(user.username.charAt(0).toUpperCase());
  expect((await page.request.get(current)).status()).toBe(404);
});

test("forgot password, under Password in account settings, opens the reset by email", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/apps");
  await page.goto("/account");

  const password = await openSection(page, "Password");
  await expect(password).toContainText("Don't know your current password?");
  await password.getByRole("link", { name: "Reset it by email" }).click();
  await expect(page).toHaveURL("/forgot-password");
});

test("logged out, /account redirects to /apps and Log in comes back to it", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL("/apps?next=%2Faccount");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Log in" }),
  ).toHaveAttribute("href", "/login?next=%2Faccount");
});

test.describe("at 320px wide", () => {
  test.use({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });

  test("logged-in /apps, its open menu and /account have no horizontal scroll", async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await expect(page).toHaveURL("/apps");
    await expectNoHorizontalScroll(page);

    await accountButton(page, user.username).click();
    await expect(page.getByRole("link", { name: "Account", exact: true })).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);

    await page.goto("/account");
    await expectNoHorizontalScroll(page);
  });
});
