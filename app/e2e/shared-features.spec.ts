import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { dateLabel, datePlus, localInstants, localParts, type CalendarEvent } from "../lib/calendar";
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

test("task Who? saves multiple people, keeps pictures after reload, and removes departing members", async ({
  page,
  browser,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { space, user } = await setup(page);
  const other = await partner(page, space, browser);
  try {
    const listResponse = await page.request.post("/api/shared/tasks/lists", { data: { name: "Together" } });
    expect(listResponse.ok(), await listResponse.text()).toBe(true);
    const list = (await listResponse.json()).data;
    const taskResponse = await page.request.post(`/api/shared/tasks/lists/${list.id}/tasks`, {
      data: { title: "Plan a trip" },
    });
    expect(taskResponse.ok(), await taskResponse.text()).toBe(true);
    const task = (await taskResponse.json()).data;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/shared/tasks");
    const add = page.getByLabel("Write a task");
    const row = page.getByRole("list", { name: "To do", exact: true }).getByRole("listitem");
    expect((await add.boundingBox())!.y).toBeLessThan((await row.boundingBox())!.y);
    await row.getByRole("button", { name: "Plan a trip", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit task" });
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBeLessThan(390);
    expect(box.height).toBeLessThan(844);
    // It grows in from 0.95 of its size, out of the row pressed; it doesn't slide up (motion.spec.ts).
    await expect(dialog).toHaveCSS("animation-name", /popup-in/);
    // No "Extra options:" label; the due date has Today, Tomorrow and Next week a tap away.
    await expect(dialog.getByText("Extra options:", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("group", { name: "Due" }).getByRole("button")).toHaveText([
      "Today",
      "Tomorrow",
      "Next week",
    ]);
    const picker = dialog.getByRole("group", { name: "Who?" });
    await expect(picker.getByRole("checkbox")).toHaveCount(2);
    await picker.getByRole("checkbox", { name: user.name, exact: true }).check();
    await picker.getByRole("checkbox", { name: other.user.name, exact: true }).check();
    const saved = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().endsWith(`/tasks/${task.id}`),
    );
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await expect(row.locator("[title]")).toHaveCount(2);
    await row.getByRole("button", { name: /^Plan a trip/ }).click();
    await expect(picker.getByRole("checkbox", { checked: true })).toHaveCount(2);
    await page.keyboard.press("Escape");
    const lists = (await (await page.request.get("/api/shared/tasks")).json()).data as TaskList[];
    expect(lists[0].tasks[0].assigneeIds).toEqual(
      expect.arrayContaining([space.ownerId, other.space.members.find((member) => member.id !== space.ownerId)!.id]),
    );
    // Reject a person outside this space, without losing the existing assignment.
    expect(
      (
        await page.request.patch(`/api/shared/tasks/${task.id}`, {
          data: { assigneeIds: ["00000000-0000-4000-8000-000000000000"] },
        })
      ).status(),
    ).toBe(400);
    expect((await other.page.request.post(`/api/shared/spaces/${space.id}/leave`, { data: {} })).ok()).toBe(true);
    const remaining = (await (await page.request.get("/api/shared/tasks")).json()).data as TaskList[];
    expect(remaining[0].tasks[0].assigneeIds).toEqual([space.ownerId]);
  } finally {
    await other.context.close();
  }
});

test("a phone opens on the agenda and can switch to month", async ({ page }) => {
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
  await expect(page.getByRole("button", { name: "Month", exact: true })).toBeVisible();
  // Today and the day after tomorrow, each with its events and times; nothing for the empty day between.
  await expect(agenda.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(agenda.getByRole("heading", { level: 3 }).first()).toHaveText("Today");
  await expect(agenda.getByRole("region", { name: "Today" })).toContainText("19:30 – 23:00");
  await expect(agenda.getByRole("button", { name: /^Cinema, 21:00/ })).toBeVisible();
  await expect(agenda.getByRole("heading", { name: "Tomorrow" })).toHaveCount(0);

  // The toolbar in one row: ‹ Nov 2026 › together, then Agenda | Month (both there, Agenda pressed) and Add event.
  const view = page.getByRole("group", { name: "Calendar view" });
  await expect(view.getByRole("button")).toHaveCount(2);
  await expect(view.getByRole("button").first()).toHaveAccessibleName("Agenda");
  await expect(view.getByRole("button").last()).toHaveAccessibleName("Month");
  await expect(view.getByRole("button", { name: "Agenda", exact: true })).toHaveAttribute("aria-pressed", "true");
  const controls = [
    page.getByRole("button", { name: "Previous month" }),
    page.getByRole("heading", { level: 2, name: dateLabel(today(), { month: "long", year: "numeric" }) }),
    page.getByRole("button", { name: "Next month" }),
    view,
    page.getByRole("button", { name: "Add event", exact: true }),
  ];
  const boxes = await Promise.all(controls.map(async (control) => (await control.boundingBox())!));
  for (const box of boxes)
    expect(Math.abs(box.y + box.height / 2 - (boxes[0].y + boxes[0].height / 2))).toBeLessThan(3);
  expect(boxes[1].x - (boxes[0].x + boxes[0].width)).toBeLessThan(12);
  expect(boxes[2].x - (boxes[1].x + boxes[1].width)).toBeLessThan(12);
  // The agenda has the page's margins.
  expect((await agenda.boundingBox())!.x).toBeGreaterThanOrEqual(15);

  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.getByRole("region", { name: "month calendar" })).toBeVisible();
  await expect(view.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(view.getByRole("button", { name: "Agenda", exact: true })).toBeVisible();
});

test("the agenda lists every event from today on, 20 at a time with Show more, in a centered column; the month has the whole width", async ({
  page,
}) => {
  await setup(page);
  // Yesterday's is over by today. The rest one every three days, from today: past the four weeks the agenda once had.
  const plans = Array.from({ length: 25 }, (_, i) => [
    `Plan ${String(i + 1).padStart(2, "0")}`,
    datePlus(today(), i * 3),
  ]);
  for (const [title, day] of [["Yesterday's", datePlus(today(), -1)], ...plans]) {
    const created = await page.request.post(events, {
      data: { title, startsAt: at(day, "09:00"), endsAt: at(day, "10:00"), isGroup: true },
    });
    expect(created.status()).toBe(201);
  }
  await page.reload();
  // The month, on a wide screen: from the window's one edge to the other.
  const month = page.getByRole("region", { name: "month calendar", exact: true });
  await expect(month).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  const monthBox = (await month.boundingBox())!;
  expect(monthBox.x).toBeLessThanOrEqual(1);
  expect(monthBox.width).toBeGreaterThanOrEqual(width - 2);

  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  const agenda = page.getByRole("region", { name: "agenda calendar", exact: true });
  await expect(agenda.getByRole("button", { name: /^Plan 01,/ })).toBeVisible();
  // Centered, with room on both sides.
  const agendaBox = (await agenda.boundingBox())!;
  expect(agendaBox.x).toBeGreaterThan(20);
  expect(Math.abs(agendaBox.x - (width - agendaBox.x - agendaBox.width))).toBeLessThanOrEqual(2);
  await expect(agenda.getByRole("button", { name: /^Yesterday's,/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /next 4 weeks/ })).toHaveCount(0);
  for (const [title] of plans.slice(0, 20))
    await expect(agenda.getByRole("button", { name: new RegExp(`^${title},`) })).toBeAttached();
  await expect(agenda.getByRole("button", { name: /^Plan 21,/ })).toHaveCount(0);
  // Show more adds the next ones under them, and goes once there are no more.
  const more = agenda.getByRole("button", { name: "Show more", exact: true });
  await more.click();
  for (const [title] of plans.slice(20))
    await expect(agenda.getByRole("button", { name: new RegExp(`^${title},`) })).toBeAttached();
  await expect(more).toHaveCount(0);
  await agenda.getByRole("button", { name: /^Plan 25,/ }).scrollIntoViewIfNeeded();
  await expect(agenda.getByRole("button", { name: /^Plan 25,/ })).toBeInViewport();
  const days = await agenda.getByRole("heading", { level: 3 }).allTextContents();
  expect(days).toHaveLength(25);
  expect(days[0]).toBe("Today");
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
    // Everyone is selected individually; there is no All shortcut.
    await event.click();
    await page.getByRole("button", { name: "Edit event" }).click();
    const picker = page.getByRole("group", { name: "Who?" });
    await expect(picker.getByRole("checkbox", { name: "All", exact: true })).toHaveCount(0);
    await picker.getByRole("checkbox", { name: user.name, exact: true }).uncheck();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(event).toHaveAccessibleName(new RegExp(ana.user.name + "$"));
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
  // Hidden at first: blurred, its secret as dots, until Show, which goes once pressed.
  const link = card.getByLabel("Calendar link");
  await expect(link).toHaveValue(/\/api\/calendar\/•+$/);
  await card.getByRole("button", { name: "Show the link", exact: true }).click();
  await expect(card.getByRole("button", { name: "Show the link", exact: true })).toHaveCount(0);
  await expect(link).toBeFocused();
  const url = await link.inputValue();
  expect(url).toMatch(/\/api\/calendar\/[\w-]+$/);
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
    .getByLabel("Due date", { exact: true })
    .fill(`${due.slice(8, 10)}/${due.slice(5, 7)}/${due.slice(0, 4)}`);
  await dialog.getByLabel("Repeat?").selectOption("weekly");
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
