import type { Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { expect, newUser, openSpaceSettings, sharedTab, signUp, test } from "./fixtures";
import { withDatabase } from "./db";
import type { Space } from "../lib/space-types";

const base = "/api/shared/spaces";
const contextOptions = () => ({ extraHTTPHeaders: { "X-Forwarded-For": `10.${[...randomBytes(3)].join(".")}` } });
async function register(page: Page) {
  const user = newUser();
  await signUp(page, user, "/signup?next=/shared");
  await expect(page.getByRole("heading", { name: "Your shared calendar" })).toBeVisible();
  return user;
}
/** Creates a space: a button, as a space has no name. */
async function create(page: Page) {
  await expect(page.getByLabel("Space name")).toHaveCount(0);
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  return (await (await page.request.get(base)).json()).data as Space;
}
/** Shared's Settings tab: the space's settings. */
async function settings(page: Page) {
  await openSpaceSettings(page);
  await expect(page.getByRole("region", { name: "Members" })).toBeVisible();
}
async function generate(page: Page, id: string) {
  const response = await page.request.post(`${base}/${id}/invites`, { data: {} });
  expect(response.ok()).toBe(true);
  return (await response.json()).data.code as string;
}
async function join(page: Page, code: string) {
  await page.getByLabel("Invite code").fill(code);
  await page.getByRole("button", { name: "Join space" }).click();
}
/**
 * Leaves the space from its settings: with Undo for a few seconds, or, as its
 * last member, after saying it deletes the space. Shared then offers to create
 * or join one.
 */
async function leave(page: Page) {
  await page.getByRole("button", { name: "Leave this group", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Leave and delete", exact: true });
  const undo = page.getByRole("status").filter({ hasText: "Leaving this group…" });
  await expect(confirm.or(undo)).toBeVisible();
  if (await confirm.isVisible()) await confirm.click();
  await expect(page.getByRole("heading", { name: "Your shared calendar" })).toBeVisible({ timeout: 15_000 });
}

test("two users create, copy invite, join, transfer ownership and delete the last space", async ({ page, browser }) => {
  const owner = await register(page);
  const space = await create(page);
  await settings(page);
  // Without the phone's share sheet (a desktop browser), the link is copied; and shown, with its code.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => Object.defineProperty(Navigator.prototype, "share", { value: undefined }));
  const invite = page.getByRole("region", { name: "Invite someone" });
  await invite.getByRole("button", { name: "Share invite link" }).click();
  await expect(invite.getByRole("status")).toHaveText("Link copied. Send it to them: it works once, for 24 hours.");
  const linkInput = invite.getByLabel("Invite link");
  await expect(linkInput).toHaveValue(/\/join\/[A-HJ-NP-Z2-9]{8}$/);
  const link = await linkInput.inputValue();
  const code = link.slice(-8);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await expect(invite).toContainText(`Or the code ${code}`);
  const expiry = await invite.locator("time").getAttribute("datetime");
  expect(new Date(expiry!).getTime() - Date.now()).toBeGreaterThan(23.9 * 3600_000);
  await invite.getByRole("button", { name: "Copy link" }).click();
  await expect(invite.getByRole("status")).toHaveText("Link copied.");

  const context = await browser.newContext(contextOptions());
  const other = await context.newPage();
  try {
    const member = await register(other);
    await join(other, code.toLowerCase());
    await expect(other.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
    await settings(other);
    // Any member can invite.
    await expect(other.getByRole("button", { name: "Share invite link" })).toBeVisible();
    // Each with their picture (or initial), name and @username.
    const members = other.getByRole("region", { name: "Members" });
    await expect(members.getByRole("listitem")).toHaveText([
      new RegExp(`^.${owner.name} \\(@${owner.username}\\)Owner$`),
      new RegExp(`^.${member.name} \\(@${member.username}\\) \\(you\\)$`),
    ]);
    const data: Space = (await (await other.request.get(base)).json()).data;
    expect(new Set(data.members.map((member) => member.color)).size).toBe(2);
    // No name, and nothing to rename it with.
    expect(data).not.toHaveProperty("name");
    expect((await page.request.patch(`${base}/${space.id}`, { data: { name: "Renamed" } })).status()).toBe(405);
    expect((await other.request.post(`${base}/${space.id}/invites`, { data: {} })).status()).toBe(200);
    expect((await other.request.post(base, { data: {} })).status()).toBe(409);

    await leave(page);
    expect((await page.request.get(`${base}/${space.id}`)).status()).toBe(404);
    // Now the owner, once the tab loads the space again.
    await sharedTab(other, "Calendar").click();
    await settings(other);
    await expect(other.getByRole("region", { name: "Members" })).toContainText("Owner");
    await leave(other);
    await withDatabase(async (db) => {
      expect((await db.query("SELECT id FROM spaces WHERE id = $1", [space.id])).rowCount).toBe(0);
      expect((await db.query("SELECT id FROM invites WHERE space_id = $1", [space.id])).rowCount).toBe(0);
    });
  } finally {
    await context.close();
  }
});

test("invalid, expired and used invite codes show clear errors; a member can leave and rejoin", async ({
  page,
  browser,
}) => {
  await register(page);
  const space = await create(page);
  const context = await browser.newContext(contextOptions());
  const other = await context.newPage();
  try {
    await register(other);
    await join(other, "ZZZZZZZZ");
    await expect(other.getByRole("main").getByRole("alert")).toContainText("Invalid invite code");
    const expired = await generate(page, space.id);
    await withDatabase((db) =>
      db.query("UPDATE invites SET expires_at = now() - interval '1 second' WHERE code = $1", [expired]),
    );
    await join(other, expired);
    await expect(other.getByRole("main").getByRole("alert")).toContainText("has expired");
    const code = await generate(page, space.id);
    await join(other, code);
    await expect(other.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
    await settings(other);
    await leave(other);
    await join(other, code);
    await expect(other.getByRole("main").getByRole("alert")).toContainText("already been used");
    await join(other, await generate(page, space.id));
    await expect(other.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("another space's data and mutations are denied, with and without a space", async ({ page, browser }) => {
  await register(page);
  const secret = await create(page);
  const context = await browser.newContext(contextOptions());
  const other = await context.newPage();
  try {
    await register(other);
    for (const hasSpace of [false, true]) {
      if (hasSpace) await create(other);
      const read = await other.request.get(`${base}/${secret.id}`);
      expect(read.status()).toBe(404);
      expect(await read.text()).not.toContain(secret.ownerId);
      for (const action of ["invites", "leave"])
        expect((await other.request.post(`${base}/${secret.id}/${action}`, { data: {} })).status()).toBe(404);
    }
    expect((await (await page.request.get(base)).json()).data.id).toBe(secret.id);
    expect(
      (
        await page.request.post(`${base}/${secret.id}/invites`, {
          data: {},
          headers: { Origin: "https://untrusted.example" },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await context.close();
  }
});

test("concurrent creates and joins preserve one space per user and single-use invites", async ({ page, browser }) => {
  await register(page);
  const responses = await Promise.all([1, 2].map(() => page.request.post(base, { data: {} })));
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
  const space: Space = (await (await page.request.get(base)).json()).data;
  const code = await generate(page, space.id);
  const context = await browser.newContext(contextOptions());
  const other = await context.newPage();
  try {
    await register(other);
    const results = await Promise.all([1, 2].map(() => other.request.post(`${base}/join`, { data: { code } })));
    expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
    expect((await (await page.request.get(base)).json()).data.members).toHaveLength(2);
  } finally {
    await context.close();
  }
});

test("on mobile the welcome and Settings fit both themes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await register(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await create(page);
  await settings(page);
  await page.evaluate(() => Object.defineProperty(Navigator.prototype, "share", { value: undefined }));
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("region", { name: "Invite someone" }).getByRole("button", { name: "Share invite link" }).click();
  await expect(page.getByLabel("Invite link")).toHaveValue(/\/join\/.{8}$/);
  for (const theme of ["minimal-neutrals", "graphite"]) {
    // Shown without saving it (the theme is chosen in Account settings): every color comes from data-theme.
    if (theme === "graphite")
      await page.locator("[data-theme]").evaluate((shell) => shell.setAttribute("data-theme", "graphite"));
    await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Leave this group", exact: true })).toBeVisible();
  }
});

test("only one competing user consumes an invite and ownership follows join order, not account age", async ({
  page,
  browser,
}) => {
  await register(page);
  const space = await create(page);
  const firstContext = await browser.newContext(contextOptions());
  const secondContext = await browser.newContext(contextOptions());
  try {
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    await register(first);
    await register(second);
    const code = await generate(page, space.id);
    const pages = [first, second];
    const responses = await Promise.all(pages.map((p) => p.request.post(`${base}/join`, { data: { code } })));
    expect(responses.map((r) => r.status()).sort()).toEqual([200, 400]);
    const winner = responses.findIndex((r) => r.status() === 200);
    expect((await responses[1 - winner].json()).error).toContain("already been used");
    const joined: Space = (await responses[winner].json()).data;
    const oldestMember = joined.members.find((m) => m.id !== space.ownerId)!;
    const freshCode = await generate(page, space.id);
    expect((await pages[1 - winner].request.post(`${base}/join`, { data: { code: freshCode } })).ok()).toBe(true);
    const full: Space = (await (await page.request.get(base)).json()).data;
    const newestMember = full.members.find((m) => m.id !== space.ownerId && m.id !== oldestMember.id)!;
    // An older account joined later: transfer must use membership age.
    await withDatabase((db) =>
      db.query("UPDATE users SET created_at = now() - interval '1 year' WHERE id = $1", [newestMember.id]),
    );
    const outstandingCode = await generate(page, space.id);
    expect((await page.request.post(`${base}/${space.id}/leave`, { data: {} })).ok()).toBe(true);
    const transferred: Space = (await (await pages[winner].request.get(base)).json()).data;
    expect(transferred.ownerId).toBe(oldestMember.id);
    expect(new Set(transferred.members.map((m) => m.color)).size).toBe(2);
    // Any member's invites keep working when the owner changes: the one who left can come back with theirs.
    const rejoin = await page.request.post(`${base}/join`, { data: { code: outstandingCode } });
    expect(rejoin.status()).toBe(200);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("an invite link shows who sent it, and joins once logged in (never by itself)", async ({ page, browser }) => {
  const owner = await register(page);
  const space = await create(page);
  const code = await generate(page, space.id);
  const context = await browser.newContext(contextOptions());
  const other = await context.newPage();
  try {
    // Logged out: who sent it, then Log in and Sign up, which come back to it.
    await other.goto(`/join/${code}`);
    await expect(other.getByRole("heading", { level: 1 })).toHaveText(`${owner.name} invited you to Shared`);
    await other.getByRole("link", { name: "Sign up" }).click();
    const member = newUser();
    await other.getByLabel("Name", { exact: true }).fill(member.name);
    await other.getByLabel("Username").fill(member.username);
    await other.getByLabel("Email").fill(member.email);
    await other.getByLabel("Password").fill(member.password);
    await other.getByRole("button", { name: "Sign up" }).click();
    await expect(other).toHaveURL(`/join/${code}`);
    // Opening it joined nothing: the button does.
    expect((await (await other.request.get(base)).json()).data).toBeNull();
    await other.getByRole("button", { name: `Join ${owner.name}'s space` }).click();
    await expect(other).toHaveURL("/shared");
    await expect(other.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
    expect((await (await other.request.get(base)).json()).data.id).toBe(space.id);
    // Used: it says so.
    await other.goto(`/join/${code}`);
    await expect(other.getByRole("heading", { level: 1 })).toHaveText("This invite doesn't work");
    await expect(other.getByRole("main")).toContainText("Someone already joined with it");
  } finally {
    await context.close();
  }
});
