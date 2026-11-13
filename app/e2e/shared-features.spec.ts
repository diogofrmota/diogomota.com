import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { datePlus, localInstants, localParts, type CalendarEvent } from "../lib/calendar";
import type { Space } from "../lib/space-types";
import type { TaskList } from "../lib/task-types";
import { expect, newUser, openSpaceSettings, sharedTab, signUp, test } from "./fixtures";

// Shared's newer features: the agenda, events for more than one person, loading
// a period at a time, the time grid (now line, dragging), the calendar
// subscription, inviting a partner, repeating tasks, live tasks and activity.

const events = "/api/shared/events";
const contextOptions = () => ({ extraHTTPHeaders: { "X-Forwarded-For": `10.${[...randomBytes(3)].join(".")}` } });

async function setup(page: Page) {
  const user = newUser();
  await signUp(page, user, "/signup?next=/shared");
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByRole("region", { name: /^(agenda|month|week|day) calendar$/ })).toBeVisible();
  return { user, space: (await (await page.request.get("/api/shared/spaces")).json()).data as Space };
}

/** Puts a second person in the space, in a browser of their own. */
async function partner(page: Page, space: Space, browser: import("@playwright/test").Browser) {
  const invite = await page.request.post(`/api/shared/spaces/${space.id}/invites`, { data: {} });
  expect(invite.ok(), await invite.text()).toBe(true);
  const { code } = (await invite.json()).data;
  const context = await browser.newContext(contextOptions());
  const other = await context.newPage();
  const user = newUser();
  await signUp(other, user, "/signup?next=/shared");
  // Signed up (and logged in) once Shared shows its welcome.
  await expect(other.getByRole("button", { name: "Create space" })).toBeVisible();
  const join = await other.request.post("/api/shared/spaces/join", { data: { code } });
  expect(join.ok(), await join.text()).toBe(true);
  const joined: Space = (await (await page.request.get("/api/shared/spaces")).json()).data;
  return { context, page: other, user, space: joined };
}

const today = () => localParts(new Date()).date;
const at = (date: string, time: string) => localInstants(date, time)[0];

test("a phone opens on the agenda, of the coming days with something planned; its week is three days", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { space } = await setup(page);
  for (const [title, day, time] of [
    ["Dinner", today(), "19:30"],
    ["Cinema", datePlus(today(), 2), "21:00"],
  ] as const) {
    const created = await page.request.post(events, {
      data: { title, startsAt: at(day, time), endsAt: at(day, "23:00"), isGroup: false, assigneeIds: [space.ownerId] },
    });
    expect(created.status()).toBe(201);
  }
  await page.reload();
  const agenda = page.getByRole("region", { name: "agenda calendar" });
  await expect(agenda).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "Agenda" }),
  ).toHaveAttribute("aria-pressed", "true");
  // Today and the day after tomorrow, each with its events and times; nothing for the empty day between.
  await expect(agenda.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(agenda.getByRole("heading", { level: 3 }).first()).toHaveText("Today");
  await expect(agenda.getByRole("region", { name: "Today" })).toContainText("19:30 – 23:00");
  await expect(agenda.getByRole("button", { name: /^Cinema, 21:00/ })).toBeVisible();
  await expect(agenda.getByRole("heading", { name: "Tomorrow" })).toHaveCount(0);

  // A week on a phone is three days, from the day shown.
  await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "3 days" }).click();
  const grid = page.getByRole("region", { name: "week calendar" });
  await expect(grid.getByRole("button", { name: /^(Dinner|Cinema),/ })).toHaveCount(2);
});

test("an event can be for two people: both pictures on it, and both in its name", async ({ page, browser }) => {
  const { user, space } = await setup(page);
  const ana = await partner(page, space, browser);
  try {
    await page.reload();
    await page.getByRole("button", { name: "Add event", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create a new event" });
    await dialog.getByLabel("Event title", { exact: true }).fill("Dinner out");
    const who = dialog.getByRole("group", { name: "Who?" });
    await who.getByRole("checkbox", { name: ana.user.name, exact: true }).check();
    // All is either/or with the members.
    await expect(who.getByRole("checkbox", { name: user.name, exact: true })).toBeChecked();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const event = page.getByRole("button", { name: /^Dinner out,/ });
    await expect(event).toHaveAccessibleName(
      new RegExp(`, (${user.name} and ${ana.user.name}|${ana.user.name} and ${user.name})$`),
    );
    const saved: CalendarEvent[] = (await (await page.request.get(events)).json()).data;
    expect(saved[0].assigneeIds).toHaveLength(2);
    // All instead: the group.
    await event.click();
    await page.getByRole("button", { name: "Edit event" }).click();
    await page.getByRole("group", { name: "Who?" }).getByRole("checkbox", { name: "All", exact: true }).check();
    await expect(
      page.getByRole("group", { name: "Who?" }).getByRole("checkbox", { name: user.name, exact: true }),
    ).not.toBeChecked();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Dinner out, .*, Group$/ })).toBeVisible();
  } finally {
    await ana.context.close();
  }
});

test("the calendar loads a period at a time: the API takes a range", async ({ page }) => {
  const { space } = await setup(page);
  const make = (title: string, day: string) =>
    page.request.post(events, {
      data: {
        title,
        startsAt: at(day, "10:00"),
        endsAt: at(day, "11:00"),
        isGroup: false,
        assigneeIds: [space.ownerId],
      },
    });
  await make("July", "2026-07-10");
  await make("September", "2026-09-10");
  const range = (from: string, to: string) => page.request.get(`${events}?${new URLSearchParams({ from, to })}`);
  const july: CalendarEvent[] = (await (await range(at("2026-07-01", "00:00"), at("2026-08-01", "00:00"))).json()).data;
  expect(july.map((e) => e.title)).toEqual(["July"]);
  expect((await range("2026-07-01", "2026-08-01")).status()).toBe(400);
  expect((await range(at("2026-01-01", "00:00"), at("2027-06-01", "00:00"))).status()).toBe(400);
  expect((await (await page.request.get(events)).json()).data).toHaveLength(2);
});

test("the week and day views show now as a line; an event dragged with the mouse moves, and its edge changes its end", async ({
  page,
}) => {
  const { space } = await setup(page);
  const day = today();
  const created = await page.request.post(events, {
    data: {
      title: "Call",
      startsAt: at(day, "02:00"),
      endsAt: at(day, "03:00"),
      isGroup: false,
      assigneeIds: [space.ownerId],
    },
  });
  const { id } = (await created.json()).data as CalendarEvent;
  await page.reload();
  await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "Day" }).click();
  const grid = page.getByRole("region", { name: "day calendar" });
  await grid.evaluate((el) => (el.scrollTop = 0));
  const event = grid.getByRole("button", { name: /^Call,/ });
  await expect(event).toBeVisible();

  // Down 60px is an hour later (1px a minute).
  const box = (await event.boundingBox())!;
  const moved = page.waitForResponse(
    (r) => r.url().endsWith(`/api/shared/events/${id}`) && r.request().method() === "PATCH",
  );
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 50, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y + 80, { steps: 5 });
  await page.mouse.up();
  expect((await moved).ok()).toBe(true);
  // Moving didn't open it.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let saved: CalendarEvent = (await (await page.request.get(`${events}/${id}`)).json()).data;
  expect(localParts(saved.startsAt).time).toBe("03:00");
  expect(localParts(saved.endsAt).time).toBe("04:00");

  // The bottom edge: half an hour longer.
  const after = (await event.boundingBox())!;
  const resized = page.waitForResponse(
    (r) => r.url().endsWith(`/api/shared/events/${id}`) && r.request().method() === "PATCH",
  );
  await page.mouse.move(after.x + after.width / 2, after.y + after.height - 2);
  await page.mouse.down();
  await page.mouse.move(after.x + after.width / 2, after.y + after.height + 30, { steps: 6 });
  await page.mouse.up();
  expect((await resized).ok()).toBe(true);
  saved = (await (await page.request.get(`${events}/${id}`)).json()).data;
  expect(localParts(saved.endsAt).time).toBe("04:30");

  // Now: a line across today, at the time it is.
  await expect(grid.locator('[aria-hidden="true"][style*="top"]').first()).toBeAttached();
});

test("Settings has a calendar link that calendar apps subscribe to; a new link stops the old one", async ({
  page,
  playwright,
  baseURL,
}) => {
  await setup(page);
  await page.request.post(events, {
    data: { title: "Anniversary", startsAt: at(today(), "20:00"), endsAt: at(today(), "22:00"), isGroup: true },
  });
  await openSpaceSettings(page);
  const card = page.getByRole("region", { name: "Calendar in your phone" });
  const url = await card.getByLabel("Calendar link").inputValue();
  await expect(card.getByRole("link", { name: "Add to my calendar" })).toHaveAttribute(
    "href",
    url.replace(/^http/, "webcal"),
  );
  // A calendar app has no session: the link is the key.
  const app = await playwright.request.newContext({ baseURL });
  try {
    const feed = await app.get(new URL(url).pathname);
    expect(feed.status()).toBe(200);
    expect(feed.headers()["content-type"]).toContain("text/calendar");
    const ics = await feed.text();
    expect(ics).toContain("SUMMARY:Anniversary\r\n");
    expect(ics).toContain("X-WR-CALNAME:Shared calendar\r\n");
    expect(ics).toContain("UID:");

    await card.getByRole("button", { name: "Make a new link" }).click();
    await card.getByRole("button", { name: "Make a new link" }).click();
    await expect(card.getByRole("status")).toContainText("New link made.");
    const renewed = await card.getByLabel("Calendar link").inputValue();
    expect(renewed).not.toBe(url);
    expect((await app.get(new URL(url).pathname)).status()).toBe(404);
    expect((await app.get(new URL(renewed).pathname)).status()).toBe(200);
  } finally {
    await app.dispose();
  }
});

test("a space of one is asked to invite their partner, until someone joins or Not now", async ({ page, browser }) => {
  const { space } = await setup(page);
  const prompt = page.getByRole("region", { name: "Invite your partner" });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("button", { name: "Share invite link" })).toBeVisible();
  await prompt.getByRole("button", { name: "Not now" }).click();
  await expect(prompt).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: /^(agenda|month|week|day) calendar$/ })).toBeVisible();
  await expect(prompt).toHaveCount(0);
  // Another member's browser never had it dismissed, but there are two of them now.
  const ana = await partner(page, space, browser);
  try {
    await ana.page.goto("/shared");
    await expect(ana.page.getByRole("region", { name: /^(agenda|month|week|day) calendar$/ })).toBeVisible();
    await expect(ana.page.getByRole("region", { name: "Invite your partner" })).toHaveCount(0);
  } finally {
    await ana.context.close();
  }
});

test("a repeating task comes back with its next due date when ticked off", async ({ page }) => {
  await setup(page);
  await sharedTab(page, "Tasks").click();
  await page.getByLabel("List name").fill("House");
  await page.getByRole("button", { name: "Create list" }).click();
  await page.getByLabel("Write a task").fill("Bins out");
  await page.getByLabel("Write a task").press("Enter");
  await page.getByRole("button", { name: /^Bins out/ }).click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  const due = today();
  await dialog
    .getByLabel("Due date (optional)", { exact: true })
    .fill(`${due.slice(8, 10)}/${due.slice(5, 7)}/${due.slice(0, 4)}`);
  await dialog.getByLabel("Repeat").selectOption("weekly");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /^Bins out/ })).toContainText("Every week");

  await page.getByRole("checkbox", { name: "Bins out" }).check();
  // Back in the list, unticked, due a week later; not in Done.
  await expect
    .poll(async () => ((await (await page.request.get("/api/shared/tasks")).json()).data as TaskList[])[0].tasks[0])
    .toMatchObject({ isComplete: false, dueDate: datePlus(due, 7), repeat: "weekly" });
  await expect(page.getByRole("checkbox", { name: "Bins out" })).not.toBeChecked();
  await expect(page.getByText(/^Done \(/)).toHaveCount(0);
});

test("Tasks shows what the other member adds and ticks off while it is open, without a reload", async ({
  page,
  browser,
}) => {
  const { space } = await setup(page);
  const list = (await (await page.request.post("/api/shared/tasks/lists", { data: { name: "Groceries" } })).json())
    .data;
  const ana = await partner(page, space, browser);
  try {
    await sharedTab(page, "Tasks").click();
    await expect(page.getByRole("heading", { name: /^Groceries/ })).toBeVisible();
    await ana.page.request.post(`/api/shared/tasks/lists/${list.id}/tasks`, { data: { title: "Oat milk" } });
    // It asks every few seconds while open.
    await expect(page.getByRole("checkbox", { name: "Oat milk" })).toBeVisible({ timeout: 15_000 });

    // And Settings has what each of them did.
    await openSpaceSettings(page);
    const activity = page.getByRole("region", { name: "Recent activity" });
    await expect(activity).toContainText(`${ana.user.name} added Oat milk to Groceries`);
    await expect(activity).toContainText(`${ana.user.name} joined the space`);
  } finally {
    await ana.context.close();
  }
});
