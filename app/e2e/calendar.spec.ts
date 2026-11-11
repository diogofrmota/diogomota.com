import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, newUser, signUp, test } from "./fixtures";
import { withDatabase } from "./db";
import { localParts, localInstants, calendarIcs, dateLabel, datePlus, type CalendarEvent } from "../lib/calendar";
import type { Space } from "../lib/space-types";

const base = "/api/shared/events";
test.use({ timezoneId: "America/New_York" });
async function setup(page: Page) {
  const user = newUser();
  await signUp(page, user, "/signup?next=/shared");
  await page.getByLabel("Space name").fill("Calendar home");
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByText("Nothing planned yet — tap a day to add your first event!")).toBeVisible();
  return { user, space: (await (await page.request.get("/api/shared/spaces")).json()).data as Space };
}
async function add(page: Page, title: string, assignee: string, date = localParts(new Date()).date) {
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Start date", { exact: true }).fill(date);
  await page.getByLabel("End date", { exact: true }).fill(date);
  await page.getByLabel("Start time", { exact: true }).fill("09:30");
  await page.getByLabel("End time", { exact: true }).fill("10:30");
  await page.getByLabel("Assignee").selectOption(assignee);
  await page.getByLabel("Notes (optional)").fill("Bring coffee, tea; and a notebook.\nSee you there!");
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function download(page: Page, name: string) {
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name, exact: true }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/\.ics$/);
  return readFile((await file.path())!, "utf8");
}

for (const mobile of [false, true]) {
  test(`calendar lifecycle, exports, views and back button (${mobile ? "mobile" : "desktop"})`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const { space } = await setup(page);
    await add(page, "Morning walk", space.members[0].id);
    await add(page, "Dinner together", "group");
    const personal = page.getByRole("button", { name: /^Morning walk,/ });
    const group = page.getByRole("button", { name: /^Dinner together,/ });
    await expect(personal).toBeVisible(); await expect(group).toContainText("Group");
    expect(await personal.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--event-color"))).toBe(space.members[0].color);
    expect(await group.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--event-color"))).toBe("var(--muted)");
    for (const view of ["Week", "Day", "Month"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await expect(page.getByRole("region", { name: `${view.toLowerCase()} calendar`, exact: true })).toBeVisible();
      await expect(personal).toBeAttached();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await personal.click();
    await expect(page.getByRole("dialog")).toContainText("Bring coffee");
    const box = await page.getByRole("dialog").boundingBox();
    if (mobile) expect(Math.abs(box!.y + box!.height - 844)).toBeLessThan(2);
    else expect(box!.width).toBeLessThan(600);
    const ics = await download(page, "Download event .ics");
    expect(ics).toContain("SUMMARY:Morning walk\r\n");
    expect(ics).toContain("DESCRIPTION:Bring coffee\\, tea\\; and a notebook.\\nSee you there!");
    const link = new URL((await page.getByRole("link", { name: "Export to Google Calendar" }).getAttribute("href"))!);
    expect(link.searchParams.get("ctz")).toBe("Europe/Lisbon");
    expect(link.searchParams.get("dates")).toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
    await page.goBack(); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page).toHaveURL("/shared");
    await personal.click(); await page.getByRole("button", { name: "Edit event", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toContainText("Time zone");
    await page.getByLabel("Title", { exact: true }).fill("Evening walk");
    await page.getByLabel("Start time", { exact: true }).fill("18:00");
    await page.getByLabel("End time", { exact: true }).fill("19:00");
    await page.getByRole("button", { name: "Save event" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Evening walk, 18:00/ })).toBeVisible();
    // Exports are per event, from its dialog: none for the whole calendar, and no time zone line (not in the form either).
    await expect(page.getByRole("link", { name: /Export calendar/ })).toHaveCount(0);
    await expect(page.getByText("Europe/Lisbon")).toHaveCount(0);
    await page.getByRole("button", { name: /^Evening walk,/ }).click();
    const edited = await download(page, "Download event .ics");
    expect(edited).toContain("SUMMARY:Evening walk"); expect(edited).not.toContain("SUMMARY:Dinner together");
    await page.goBack(); await expect(page.getByRole("dialog")).toHaveCount(0);
    for (const title of ["Evening walk", "Dinner together"]) {
      await page.getByRole("button", { name: new RegExp(`^${title},`) }).click();
      await page.getByRole("button", { name: "Delete event", exact: true }).click();
      await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await expect(page.getByText("Nothing planned yet — tap a day to add your first event!")).toBeVisible();
    await withDatabase(async (db) => expect((await db.query("SELECT id FROM events WHERE space_id=$1", [space.id])).rowCount).toBe(0));
    await page.getByRole("button", { name: "Add event", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("events and exports are isolated by current space; same-space members can collaborate", async ({ page, browser, request }) => {
  const { space } = await setup(page);
  const payload = { title: "Private appointment", notes: "Only our space", startsAt: "2026-07-10T08:00:00.000Z", endsAt: "2026-07-10T09:00:00.000Z", isGroup: false, assigneeId: space.members[0].id };
  const created = await page.request.post(base, { data: payload }); expect(created.status()).toBe(201);
  const event: CalendarEvent = (await created.json()).data;
  expect((await request.get(base)).status()).toBe(401);
  const context = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": `10.${[...randomBytes(3)].join(".")}` } });
  try {
    const other = await context.newPage(); const otherSpace = (await setup(other)).space;
    expect((await (await other.request.get(base)).json()).data).toEqual([]);
    for (const url of [`${base}/${event.id}`, `${base}/${event.id}/export`]) expect((await other.request.get(url)).status()).toBe(404);
    // There is no whole-calendar export, for anyone.
    for (const p of [page, other]) expect((await p.request.get(`${base}/export`)).status()).toBe(404);
    expect((await other.request.patch(`${base}/${event.id}`, { data: payload })).status()).toBe(404);
    expect((await other.request.delete(`${base}/${event.id}`)).status()).toBe(404);
    expect((await other.request.post(base, { data: payload })).status()).toBe(400);
    await other.request.post(`/api/shared/spaces/${otherSpace.id}/leave`, { data: {} });
    const code = (await (await page.request.post(`/api/shared/spaces/${space.id}/invites`, { data: {} })).json()).data.code;
    await other.request.post("/api/shared/spaces/join", { data: { code } });
    expect((await (await other.request.get(base)).json()).data).toHaveLength(1);
    const memberSpace: Space = (await (await other.request.get("/api/shared/spaces")).json()).data;
    const member = memberSpace.members.find((m) => m.id !== space.ownerId)!;
    expect((await other.request.patch(`${base}/${event.id}`, { data: { ...payload, assigneeId: member.id } })).status()).toBe(200);
    await other.request.post(`/api/shared/spaces/${space.id}/leave`, { data: {} });
    expect((await other.request.get(`${base}/${event.id}`)).status()).toBe(403);
    expect((await (await page.request.get(`${base}/${event.id}`)).json()).data.assigneeId).toBeNull();
    expect((await page.request.patch(`${base}/${event.id}`, { data: { ...payload, isGroup: true, assigneeId: null } })).status()).toBe(200);
  } finally { await context.close(); }
});

test("calendar uses Lisbon in a different browser timezone, stores UTC, rejects DST gaps and chooses repeated times", async ({ page }) => {
  const { space } = await setup(page);
  await add(page, "Summer lunch", "group", "2026-07-10");
  let events: CalendarEvent[] = (await (await page.request.get(base)).json()).data;
  expect(events[0].startsAt).toBe("2026-07-10T08:30:00.000Z");
  await withDatabase(async (db) => {
    const row = (await db.query("SELECT starts_at FROM events WHERE id=$1", [events[0].id])).rows[0];
    expect(row.starts_at.toISOString()).toBe(events[0].startsAt);
  });
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Clock change");
  await page.getByLabel("Start date", { exact: true }).fill("2026-03-29");
  await page.getByLabel("End date").fill("2026-03-29");
  await page.getByLabel("Start time").fill("01:30"); await page.getByLabel("End time").fill("03:00");
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("does not exist");
  await page.getByLabel("Start date", { exact: true }).fill("2026-10-25");
  await page.getByLabel("End date").fill("2026-10-25");
  await page.getByLabel("Start occurrence").selectOption("1");
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  events = (await (await page.request.get(base)).json()).data;
  expect(events.find((e) => e.title === "Clock change")!.startsAt).toBe("2026-10-25T01:30:00.000Z");
  await page.getByRole("button", { name: /^Clock change,/ }).click();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await expect(page.getByLabel("Start occurrence")).toHaveValue("1");
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const invalid = { title: "Invalid", notes: "", startsAt: "2026-02-30T08:00:00Z", endsAt: "2026-03-03T09:00:00Z", isGroup: false, assigneeId: space.ownerId };
  expect((await page.request.post(base, { data: invalid })).status()).toBe(400);
  expect((await page.request.post(base, { data: { ...invalid, startsAt: "2026-03-04T09:00:00Z" } })).status()).toBe(400);
  expect((await page.request.post(base, { data: invalid, headers: { origin: "https://elsewhere.example" } })).status()).toBe(403);
});

test("a tap on a day or an hour adds an event then; all-day events have no times, and export as dates", async ({ page }) => {
  const { space } = await setup(page);
  const month = localParts(new Date()).date.slice(0, 8);
  const [first, last, after] = [15, 17, 18].map((day) => `${month}${day}`);
  // A tap on a day of the month, away from its number: a new event that day, at 09:00.
  const number = page.getByRole("button", { name: `${dateLabel(first, { weekday: "long", day: "numeric", month: "long" })}, add event` });
  const cell = number.locator("..");
  const box = (await cell.boundingBox())!;
  await cell.click({ position: { x: box.width / 2, y: box.height - 6 } });
  const dialog = page.getByRole("dialog", { name: "New event" });
  await expect(dialog.getByLabel("Start date")).toHaveValue(first);
  await expect(dialog.getByLabel("End date")).toHaveValue(first);
  await expect(dialog.getByLabel("Start time")).toHaveValue("09:00");
  await expect(dialog.getByLabel("End time")).toHaveValue("10:00");
  // The date in words over the browser's field, which opens its picker.
  await expect(dialog.getByRole("group", { name: "Starts" })).toContainText(dateLabel(first, { weekday: "short", day: "numeric", month: "short" }));

  // All day: no times.
  await dialog.getByLabel("Title", { exact: true }).fill("Holiday");
  await dialog.getByRole("switch", { name: "All day" }).check();
  await expect(dialog.getByLabel("Start time")).toHaveCount(0);
  await expect(dialog.getByLabel("End time")).toHaveCount(0);
  await dialog.getByLabel("End date").fill(last);
  await dialog.getByRole("button", { name: "Save event" }).click();
  await expect(dialog).toHaveCount(0);
  // On each of its days, as All day; it runs from the first day's midnight to the one after the last.
  await expect(page.getByRole("button", { name: /^Holiday, All day, / })).toHaveCount(3);
  const events: CalendarEvent[] = (await (await page.request.get(base)).json()).data;
  expect(events).toEqual([expect.objectContaining({
    title: "Holiday", allDay: true, startsAt: localInstants(first, "00:00")[0], endsAt: localInstants(after, "00:00")[0],
  })]);

  // Its dialog: the days and All day; exported as whole days.
  await page.getByRole("button", { name: /^Holiday,/ }).first().click();
  const event = page.getByRole("dialog", { name: "Holiday" });
  await expect(event).toContainText("All day");
  const ics = await download(page, "Download event .ics");
  expect(ics).toContain(`DTSTART;VALUE=DATE:${first.replace(/-/g, "")}\r\n`);
  expect(ics).toContain(`DTEND;VALUE=DATE:${after.replace(/-/g, "")}\r\n`);
  const link = new URL((await event.getByRole("link", { name: "Export to Google Calendar" }).getAttribute("href"))!);
  expect(link.searchParams.get("dates")).toBe(`${first.replace(/-/g, "")}/${after.replace(/-/g, "")}`);
  // Its form opens with All day on.
  await event.getByRole("button", { name: "Edit event" }).click();
  const edit = page.getByRole("dialog", { name: "Edit event" });
  await expect(edit.getByRole("switch", { name: "All day" })).toBeChecked();
  await edit.getByRole("button", { name: "Cancel" }).click();
  await page.goBack();
  await expect(event).toBeHidden();

  // The day view: all-day events in their own row; a tap on an hour adds an event then.
  await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "Day" }).click();
  const grid = page.getByRole("region", { name: "day calendar" });
  await expect(grid.getByRole("button", { name: /^Holiday, All day, / })).toBeVisible();
  await expect(grid.getByText("All day", { exact: true })).toBeVisible();
  const hour = grid.getByText("14:00", { exact: true });
  await hour.scrollIntoViewIfNeeded();
  const hourBox = (await hour.boundingBox())!;
  const gridBox = (await grid.boundingBox())!;
  await page.mouse.click(gridBox.x + gridBox.width / 2, hourBox.y + 20);
  await expect(dialog.getByLabel("Start date")).toHaveValue(first);
  await expect(dialog.getByLabel("Start time")).toHaveValue("14:00");
  await expect(dialog.getByLabel("End time")).toHaveValue("15:00");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // The arrows move a whole period, and are drawn as chevrons.
  for (const name of ["Previous period", "Next period"]) {
    const arrow = page.getByRole("button", { name });
    await expect(arrow.locator("svg")).toHaveCount(1);
    expect((await arrow.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Next period" }).click();
  await expect(page.getByRole("heading", { level: 2, name: dateLabel(datePlus(first, 1), { day: "numeric", month: "long", year: "numeric" }) })).toBeVisible();

  // The API takes all-day events only from midnight to midnight.
  const payload = { title: "Odd", notes: "", isGroup: false, assigneeId: space.members[0].id, allDay: true };
  expect((await page.request.post(base, { data: { ...payload, startsAt: "2026-07-10T08:00:00.000Z", endsAt: "2026-07-11T08:00:00.000Z" } })).status()).toBe(400);
  expect((await page.request.post(base, { data: { ...payload, startsAt: "2026-07-09T23:00:00.000Z", endsAt: "2026-07-10T23:00:00.000Z", allDay: "yes" } })).status()).toBe(400);
  expect((await page.request.post(base, { data: { ...payload, startsAt: "2026-07-09T23:00:00.000Z", endsAt: "2026-07-10T23:00:00.000Z" } })).status()).toBe(201);
});

test("time conversion and iCalendar preserve DST, escaped text, UTF-8 folding and UTC", () => {
  expect(localInstants("2026-01-10", "09:30")).toEqual(["2026-01-10T09:30:00.000Z"]);
  expect(localInstants("2026-07-10", "09:30")).toEqual(["2026-07-10T08:30:00.000Z"]);
  expect(localInstants("2026-03-29", "01:30")).toEqual([]);
  expect(localInstants("2026-10-25", "01:30")).toEqual(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]);
  const title = "Café 🌍, meeting; ".repeat(15);
  const ics = calendarIcs([{ id: "id", title, notes: "Line 1\r\nLine 2\\", startsAt: "2026-07-10T08:30:00Z", endsAt: "2026-07-10T09:30:00Z", allDay: false, isGroup: true, assigneeId: null }]);
  expect(ics).toContain("DTSTART:20260710T083000Z\r\n");
  for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:${title.replace(/[,;]/g, "\\$&")}`);
  expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2\\\\");
});
