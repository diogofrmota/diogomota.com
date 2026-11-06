import type { Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { expect, newUser, openSettings, signUp, test } from "./fixtures";
import { withDatabase } from "./db";
import type { Space } from "../lib/space-types";

const base = "/api/shared/spaces";
const contextOptions = () => ({ extraHTTPHeaders: { "X-Forwarded-For": `10.${[...randomBytes(3)].join(".")}` } });
async function register(page: Page) {
  const user = newUser();
  await signUp(page, user, "/signup?next=/shared");
  await expect(page.getByRole("heading", { name: "Your shared space" })).toBeVisible();
  return user;
}
async function create(page: Page, name = "Our home") {
  await page.getByLabel("Space name").fill(name);
  await page.getByRole("button", { name: "Create a Space" }).click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  return (await (await page.request.get(base)).json()).data as Space;
}
/** Settings, on Shared's settings: the space's. */
async function settings(page: Page) {
  await openSettings(page, "Shared");
  await expect(page.getByRole("region", { name: "Members" })).toBeVisible();
}
async function generate(page: Page, id: string) {
  const response = await page.request.post(`${base}/${id}/invites`, { data: {} });
  expect(response.ok()).toBe(true);
  return (await response.json()).data.code as string;
}
async function join(page: Page, code: string) {
  await page.getByLabel("Invite code").fill(code);
  await page.getByRole("button", { name: "Join with Code" }).click();
}
/** Leaves the space from its settings, then goes to Shared, which offers to create or join one. */
async function leave(page: Page) {
  await page.getByRole("button", { name: "Leave space", exact: true }).click();
  await page.getByRole("button", { name: "Confirm leave" }).click();
  await expect(page.getByRole("heading", { name: "No space yet" })).toBeVisible();
  await page.getByRole("link", { name: "Open Shared" }).click();
  await expect(page.getByRole("heading", { name: "Your shared space" })).toBeVisible();
}

test("two users create, copy invite, join, rename, transfer ownership and delete the last space", async ({ page, browser }) => {
  const owner = await register(page);
  const space = await create(page);
  await settings(page);
  await page.getByRole("button", { name: "Generate invite" }).click();
  const codeInput = page.getByLabel("Invite code");
  await expect(codeInput).toHaveValue(/^[A-HJ-NP-Z2-9]{8}$/);
  const code = await codeInput.inputValue();
  const expiry = await page.locator("time").getAttribute("datetime");
  expect(new Date(expiry!).getTime() - Date.now()).toBeGreaterThan(23.9 * 3600_000);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy code" }).click();
  await expect(page.getByRole("status")).toHaveText("Code copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);

  const context = await browser.newContext(contextOptions());
  const other = await context.newPage();
  try {
    const member = await register(other);
    await join(other, code.toLowerCase());
    await expect(other.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
    await settings(other);
    await expect(other.getByLabel("Space name")).toBeDisabled();
    await expect(other.getByRole("button", { name: "Generate invite" })).toHaveCount(0);
    const members = other.getByRole("region", { name: "Members" });
    await expect(members).toContainText(owner.username);
    await expect(members).toContainText(member.username);
    const data: Space = (await (await other.request.get(base)).json()).data;
    expect(new Set(data.members.map((member) => member.color)).size).toBe(2);
    expect((await other.request.patch(`${base}/${space.id}`, { data: { name: "Forbidden" } })).status()).toBe(403);
    expect((await other.request.post(`${base}/${space.id}/invites`, { data: {} })).status()).toBe(403);
    expect((await other.request.post(base, { data: { name: "Second" } })).status()).toBe(409);

    await page.getByLabel("Space name").fill("Lisbon home");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("status")).toHaveText("Space name saved.");
    // The other member's settings show the new name once loaded again.
    await other.reload();
    await expect(other.getByLabel("Space name")).toHaveValue("Lisbon home");
    await leave(page);
    expect((await page.request.get(`${base}/${space.id}`)).status()).toBe(404);
    await settings(other);
    await expect(other.getByRole("button", { name: "Save name" })).toBeVisible();
    await expect(other.getByRole("region", { name: "Members" })).toContainText("owner");
    await leave(other);
    await withDatabase(async (db) => {
      expect((await db.query("SELECT id FROM spaces WHERE id = $1", [space.id])).rowCount).toBe(0);
      expect((await db.query("SELECT id FROM invites WHERE space_id = $1", [space.id])).rowCount).toBe(0);
    });
  } finally { await context.close(); }
});

test("invalid, expired and used invite codes show clear errors; a member can leave and rejoin", async ({ page, browser }) => {
  await register(page);
  const space = await create(page);
  const context = await browser.newContext(contextOptions());
  const other = await context.newPage();
  try {
    await register(other);
    await join(other, "ZZZZZZZZ");
    await expect(other.getByRole("main").getByRole("alert")).toContainText("Invalid invite code");
    const expired = await generate(page, space.id);
    await withDatabase((db) => db.query("UPDATE invites SET expires_at = now() - interval '1 second' WHERE code = $1", [expired]));
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
  } finally { await context.close(); }
});

test("another space's data and mutations are denied, with and without a space", async ({ page, browser }) => {
  await register(page);
  const secret = await create(page, "Private space");
  const context = await browser.newContext(contextOptions());
  const other = await context.newPage();
  try {
    await register(other);
    for (const hasSpace of [false, true]) {
      if (hasSpace) await create(other, "Other space");
      const read = await other.request.get(`${base}/${secret.id}`);
      expect(read.status()).toBe(404);
      expect(await read.text()).not.toContain("Private space");
      expect((await other.request.patch(`${base}/${secret.id}`, { data: { name: "Hacked" } })).status()).toBe(404);
      for (const action of ["invites", "leave"]) expect((await other.request.post(`${base}/${secret.id}/${action}`, { data: {} })).status()).toBe(404);
    }
    expect((await (await page.request.get(base)).json()).data.name).toBe("Private space");
    expect((await page.request.patch(`${base}/${secret.id}`, { data: { name: " " } })).status()).toBe(400);
    expect((await page.request.post(`${base}/${secret.id}/invites`, { data: {}, headers: { Origin: "https://untrusted.example" } })).status()).toBe(403);
  } finally { await context.close(); }
});

test("concurrent creates and joins preserve one space per user and single-use invites", async ({ page, browser }) => {
  await register(page);
  const responses = await Promise.all([1, 2].map((n) => page.request.post(base, { data: { name: `Space ${n}` } })));
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
  } finally { await context.close(); }
});

test("on mobile the welcome and Settings fit both themes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await register(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await create(page);
  await settings(page);
  await page.getByRole("button", { name: "Generate invite" }).click();
  await expect(page.getByLabel("Invite code")).toHaveValue(/.{8}/);
  for (const theme of ["dark", "light"]) {
    // Shown without saving it (the theme is chosen in Account settings): every color comes from data-theme.
    if (theme === "light") await page.locator("[data-theme]").evaluate((shell) => shell.setAttribute("data-theme", "light"));
    await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Save name" })).toBeVisible();
  }
});

test("only one competing user consumes an invite and ownership follows join order, not account age", async ({ page, browser }) => {
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
    await withDatabase((db) => db.query("UPDATE users SET created_at = now() - interval '1 year' WHERE id = $1", [newestMember.id]));
    const outstandingCode = await generate(page, space.id);
    expect((await page.request.post(`${base}/${space.id}/leave`, { data: {} })).ok()).toBe(true);
    const transferred: Space = (await (await pages[winner].request.get(base)).json()).data;
    expect(transferred.ownerId).toBe(oldestMember.id);
    expect(new Set(transferred.members.map((m) => m.color)).size).toBe(2);
    const staleInvite = await page.request.post(`${base}/join`, { data: { code: outstandingCode } });
    expect(staleInvite.status()).toBe(400);
    expect((await staleInvite.json()).error).toContain("expired");
  } finally { await firstContext.close(); await secondContext.close(); }
});
