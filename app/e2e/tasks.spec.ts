import { randomBytes } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, newUser, signUp, test } from "./fixtures";
import { withDatabase } from "./db";
import { datePlus, localParts } from "../lib/calendar";
import type { Space } from "../lib/space-types";
import type { Task, TaskList } from "../lib/task-types";

const base = "/api/shared/tasks";
const contextOptions = () => ({ extraHTTPHeaders: { "X-Forwarded-For": `10.${[...randomBytes(3)].join(".")}` } });

async function setup(page: Page) {
  await signUp(page, newUser(), "/signup?next=/shared");
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  return (await (await page.request.get("/api/shared/spaces")).json()).data as Space;
}
async function openTasks(page: Page) {
  await page.getByRole("navigation", { name: "Shared", exact: true }).getByRole("button", { name: "Tasks" }).click();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await expect(page.getByText("Loading tasks…")).toHaveCount(0);
}
async function createFirstList(page: Page, name: string) {
  await page.getByLabel("List name").fill(name);
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(chips(page).getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
}
// Resolves once the API has answered a request that changed something.
function saved(page: Page, path: RegExp, method = "POST") {
  return page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname) && r.ok());
}
async function addTasks(page: Page, ...titles: string[]) {
  for (const title of titles) {
    const created = saved(page, /\/lists\/[^/]+\/tasks$/);
    await page.getByLabel("Write a task").fill(title);
    await page.getByLabel("Write a task").press("Enter");
    await created;
  }
}
async function readLists(page: Page): Promise<TaskList[]> {
  return (await (await page.request.get(base)).json()).data;
}
const chips = (page: Page) => page.getByRole("group", { name: "Task lists" });
const todoTitles = (page: Page) =>
  page
    .getByRole("list", { name: "To do" })
    .getByRole("checkbox")
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute("aria-label")));
const row = (page: Page, title: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("checkbox", { name: title, exact: true }) });
const handle = (page: Page, title: string) => page.getByRole("button", { name: `Reorder ${title}`, exact: true });

// Moves an item from one position to another (1-based) with the keyboard, as a
// screen reader user would, waiting for each announcement: dnd-kit only listens
// for the arrow keys a moment after the item is picked up.
async function keyboardMove(page: Page, title: string, from: number, to: number, of: number) {
  const announced = (text: string) => expect(page.getByRole("status").filter({ hasText: text })).toHaveCount(1);
  await handle(page, title).focus();
  await page.keyboard.press("Space");
  await announced(`Picked up ${title}, position ${from} of ${of}.`);
  for (let at = from; at !== to;) {
    at += to < from ? -1 : 1;
    await page.keyboard.press(to < from ? "ArrowUp" : "ArrowDown");
    await announced(`${title} moved to position ${at} of ${of}.`);
  }
  await page.keyboard.press("Space");
  await announced(`${title} dropped at position ${to} of ${of}.`);
}
async function mouseDrag(page: Page, from: Locator, to: Locator) {
  const start = (await from.boundingBox())!,
    end = (await to.boundingBox())!;
  const x = start.x + start.width / 2,
    y = start.y + start.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 8, { steps: 2 });
  await page.mouse.move(x, end.y + 4, { steps: 12 });
  await page.mouse.up();
}
// Real touch input (Chrome turns it into pointer events), from one point to another.
// At a finger's pace, about a move per frame, held still before lifting: moves sent
// all at once make Chrome start a fling, and the next tap only stops it (no click).
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= 12; i++) {
    await page.waitForTimeout(16);
    const point = { x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await page.waitForTimeout(100);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("lists: empty state, create, rename, reorder with the keyboard and delete, all persisted", async ({ page }) => {
  await setup(page);
  await openTasks(page);
  await expect(page.getByRole("heading", { name: "Start your first list" })).toBeVisible();
  await createFirstList(page, "House");
  await expect(page.getByText("Nothing to do yet — add your first task!")).toBeVisible();

  await chips(page).getByRole("button", { name: "New list" }).click();
  const dialog = page.getByRole("dialog", { name: "Lists" });
  await expect(dialog.getByLabel("New list")).toBeFocused();
  for (const name of ["Trip", "Groceries"]) {
    const created = saved(page, /\/lists$/);
    await dialog.getByLabel("New list").fill(name);
    await dialog.getByLabel("New list").press("Enter");
    await created;
  }
  const names = () =>
    dialog
      .getByRole("textbox", { name: /^Name of list/ })
      .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
  await expect.poll(names).toEqual(["House", "Trip", "Groceries"]);

  const renamed = saved(page, /\/lists\/[^/]+$/, "PATCH");
  await dialog.getByLabel("Name of list Trip").fill("Trip planning");
  await dialog.getByLabel("Name of list Trip").press("Enter");
  await renamed;

  const moved = saved(page, /\/lists\/[^/]+\/move$/);
  await keyboardMove(page, "Groceries", 3, 1, 3);
  await moved;
  await expect.poll(names).toEqual(["Groceries", "House", "Trip planning"]);

  // Deleting a list: its row says so, with Undo, for a few seconds (no "are you sure?").
  await dialog.getByRole("button", { name: "Delete House" }).click();
  const deletedRow = dialog.getByRole("status").filter({ hasText: "Deleted “House”" });
  await expect(deletedRow).toBeVisible();
  await deletedRow.getByRole("button", { name: "Undo" }).click();
  await expect(dialog.getByLabel("Name of list House")).toBeVisible();
  const deleted = saved(page, /\/lists\/[^/]+$/, "DELETE");
  await dialog.getByRole("button", { name: "Delete House" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "Deleted “House”" })).toBeVisible();
  await deleted;
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(chips(page).getByRole("button")).toHaveText(["Groceries", "Trip planning", "New list"]);

  // The open list is remembered on this device.
  await chips(page).getByRole("button", { name: "Trip planning" }).click();
  await page.reload();
  await openTasks(page);
  await expect(chips(page).getByRole("button")).toHaveText(["Groceries", "Trip planning", "New list"]);
  await expect(chips(page).getByRole("button", { name: "Trip planning" })).toHaveAttribute("aria-pressed", "true");
  expect((await readLists(page)).map((l) => l.name)).toEqual(["Groceries", "Trip planning"]);

  // Back closes the dialog without leaving the app.
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL("/shared/tasks");
});

test("tasks: add, reorder with mouse and keyboard (persists after reload), complete, assign and delete with undo", async ({
  page,
  browser,
  isMobile,
}) => {
  // Two sign-ups, two reloads and the 5 s undo window, twice: ~45 s on its own,
  // over the 60 s limit when the other workers keep the dev server busy.
  test.slow();
  const space = await setup(page);
  const friend = newUser();
  const context = await browser.newContext(contextOptions());
  try {
    const other = await context.newPage();
    await signUp(other, friend, "/signup?next=/shared");
    await expect(other.getByRole("heading", { name: "Your shared calendar" })).toBeVisible();
    const code = (await (await page.request.post(`/api/shared/spaces/${space.id}/invites`, { data: {} })).json()).data
      .code;
    expect((await other.request.post("/api/shared/spaces/join", { data: { code } })).ok()).toBe(true);
  } finally {
    await context.close();
  }
  await page.reload();
  const members: Space["members"] = (await (await page.request.get("/api/shared/spaces")).json()).data.members;
  const member = members.find((m) => m.username === friend.username)!;
  await openTasks(page);
  await createFirstList(page, "House");
  await addTasks(page, "Buy milk", "Fix the door", "Water plants");
  await expect.poll(() => todoTitles(page)).toEqual(["Buy milk", "Fix the door", "Water plants"]);
  await expect(page.getByLabel("Write a task")).toBeFocused();
  // How many are left to do, after the list's name.
  await expect(page.getByRole("heading", { level: 2, name: "House (3)", exact: true })).toBeVisible();

  let moved = saved(page, /\/move$/);
  await mouseDrag(page, handle(page, "Water plants"), row(page, "Buy milk"));
  await moved;
  await expect.poll(() => todoTitles(page)).toEqual(["Water plants", "Buy milk", "Fix the door"]);
  await page.reload();
  await openTasks(page);
  await expect.poll(() => todoTitles(page)).toEqual(["Water plants", "Buy milk", "Fix the door"]);

  moved = saved(page, /\/move$/);
  await keyboardMove(page, "Water plants", 1, 3, 3);
  await moved;
  await expect.poll(() => todoTitles(page)).toEqual(["Buy milk", "Fix the door", "Water plants"]);
  await page.reload();
  await openTasks(page);
  await expect.poll(() => todoTitles(page)).toEqual(["Buy milk", "Fix the door", "Water plants"]);

  // Ticked off, a task stays where it is for a moment, ticked (it no longer
  // counts as one to do), before it moves; unticked in that moment, it stays
  // and nothing is sent. Clicked from inside the page, so the moment is timed
  // there and not by the test's round trips.
  const patches: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH") patches.push(request.url());
  });
  const tick = page.getByRole("list", { name: "To do" }).getByRole("checkbox", { name: "Fix the door" });
  expect(
    await tick.evaluate(async (box: HTMLInputElement) => {
      box.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const shown = { checked: box.checked, inToDo: box.closest("ul")?.getAttribute("aria-label") === "To do" };
      box.click();
      return shown;
    }),
  ).toEqual({ checked: true, inToDo: true });
  await expect(tick).not.toBeChecked();
  await expect(page.getByRole("heading", { level: 2, name: "House (3)", exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(patches).toEqual([]);
  await expect.poll(() => todoTitles(page)).toEqual(["Buy milk", "Fix the door", "Water plants"]);

  // Complete: into the collapsed Done section, and back out at the end of the list.
  let changed = saved(page, /\/tasks\/[^/]+$/, "PATCH");
  await page.getByRole("checkbox", { name: "Fix the door" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "House (2)", exact: true })).toBeVisible();
  await changed;
  await expect.poll(() => todoTitles(page)).toEqual(["Buy milk", "Water plants"]);
  const done = page.locator("details", { hasText: "Done (1)" });
  await expect(done.getByRole("checkbox", { name: "Fix the door" })).toBeHidden();
  await page.reload();
  await openTasks(page);
  await done.getByText("Done (1)").click();
  await expect(done.getByRole("checkbox", { name: "Fix the door" })).toBeChecked();
  await expect(done.getByRole("button", { name: "Reorder Fix the door" })).toHaveCount(0);
  changed = saved(page, /\/tasks\/[^/]+$/, "PATCH");
  await done.getByRole("checkbox", { name: "Fix the door" }).click();
  await changed;
  await expect(done).toHaveCount(0);
  await expect.poll(() => todoTitles(page)).toEqual(["Buy milk", "Water plants", "Fix the door"]);
  expect((await readLists(page))[0].tasks.map((t) => [t.title, t.isComplete])).toEqual([
    ["Buy milk", false],
    ["Water plants", false],
    ["Fix the door", false],
  ]);

  // Assign, with a due date and notes, then unassign.
  const tomorrow = datePlus(localParts(new Date()).date, 1);
  await row(page, "Buy milk")
    .getByRole("button", { name: /^Buy milk/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  // Who it's for on the left, when it's due on the right; Save and Delete (its × closes it).
  const assigneePicker = dialog.getByRole("group", { name: "Who?" });
  const assigneeBox = (await assigneePicker.boundingBox())!;
  const dueBox = (await dialog.getByLabel("Due date").boundingBox())!;
  expect(assigneeBox.y).toBeLessThan(dueBox.y);
  await expect(dialog.getByRole("button", { name: /^(Save|Cancel|Delete)/ })).toHaveText(["Save", "Delete"]);
  // Each member's picture (or initial), by their name, then All, for nobody in particular: the one
  // select is how often it repeats.
  await expect(dialog.getByRole("combobox")).toHaveCount(1);
  await expect(dialog.getByRole("combobox", { name: "Repeat?" })).toHaveValue("");
  await expect(assigneePicker.getByRole("checkbox")).toHaveCount(members.length);
  await expect(assigneePicker.getByRole("checkbox", { name: "All", exact: true })).toHaveCount(0);
  await assigneePicker.getByRole("checkbox", { name: friend.name, exact: true }).check();
  // Typed day first: dd/mm/yyyy.
  await dialog.getByLabel("Due date").fill(`${tomorrow.slice(8, 10)}/${tomorrow.slice(5, 7)}/${tomorrow.slice(0, 4)}`);
  await dialog.getByLabel("Notes").fill("Two litres, semi-skimmed");
  changed = saved(page, /\/tasks\/[^/]+$/, "PATCH");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await changed;
  const assignee = row(page, "Buy milk").locator(`[title="${friend.name}"]`);
  await expect(row(page, "Buy milk")).toContainText("Due tomorrow");
  await expect(row(page, "Buy milk")).toContainText("Two litres, semi-skimmed");
  // In one line: the title, then their picture, then when it's due (the notes after, or under where they don't fit).
  const [titleBox, pictureBox, dueLineBox] = await Promise.all(
    [
      row(page, "Buy milk").getByText("Buy milk", { exact: true }),
      assignee,
      row(page, "Buy milk").getByText("Due tomorrow"),
    ].map(async (part) => (await part.boundingBox())!),
  );
  expect(pictureBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
  expect(dueLineBox.x).toBeGreaterThan(pictureBox.x + pictureBox.width);
  for (const box of [pictureBox, dueLineBox])
    expect(Math.abs(box.y + box.height / 2 - (titleBox.y + titleBox.height / 2))).toBeLessThan(4);
  await page.reload();
  await openTasks(page);
  expect(await assignee.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--member-color"))).toBe(
    member.color,
  );
  const milk = (await readLists(page))[0].tasks.find((t) => t.title === "Buy milk")!;
  expect(milk).toMatchObject({ assigneeId: member.id, dueDate: tomorrow, notes: "Two litres, semi-skimmed" });
  await row(page, "Buy milk")
    .getByRole("button", { name: /^Buy milk/ })
    .click();
  await expect(assigneePicker.getByRole("checkbox", { name: friend.name, exact: true })).toBeChecked();
  await expect(dialog.getByLabel("Due date")).toHaveValue(
    `${tomorrow.slice(8, 10)}/${tomorrow.slice(5, 7)}/${tomorrow.slice(0, 4)}`,
  );
  await assigneePicker.getByRole("checkbox", { name: friend.name, exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Clear" }).click();
  changed = saved(page, /\/tasks\/[^/]+$/, "PATCH");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await changed;
  await expect(row(page, "Buy milk").getByText(friend.username)).toHaveCount(0);
  await expect(row(page, "Buy milk")).not.toContainText("Due");
  expect((await readLists(page))[0].tasks.find((t) => t.title === "Buy milk")).toMatchObject({
    assigneeId: null,
    dueDate: null,
  });

  // Delete with undo: nothing is sent until the undo window closes. With the bin
  // button where there is a mouse; phones swipe (the phone test) or use the dialog.
  const deleteTask = async (title: string) => {
    if (!isMobile)
      return row(page, title)
        .getByRole("button", { name: `Delete ${title}` })
        .click();
    await row(page, title)
      .getByRole("button", { name: new RegExp(`^${title}`) })
      .click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    // A finger lifts after the tap; the emulated mouse stays where it clicked, at
    // the foot of the sheet, where the undo message then shows (and pauses while
    // a pointer is on it).
    await page.mouse.move(0, 0);
  };
  const deletes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "DELETE") deletes.push(r.url());
  });
  await deleteTask("Water plants");
  await expect.poll(() => todoTitles(page)).toEqual(["Buy milk", "Fix the door"]);
  const toast = page.getByRole("status").filter({ hasText: "Deleted “Water plants”" });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(toast).toHaveCount(0);
  await expect.poll(() => todoTitles(page)).toEqual(["Buy milk", "Water plants", "Fix the door"]);
  expect(deletes).toEqual([]);
  await deleteTask("Water plants");
  const gone = saved(page, /\/tasks\/[^/]+$/, "DELETE");
  await expect(toast).toBeVisible();
  await gone;
  await expect(toast).toHaveCount(0);
  expect(deletes).toHaveLength(1);
  // From the task's dialog too.
  await row(page, "Fix the door")
    .getByRole("button", { name: /^Fix the door/ })
    .click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Deleted “Fix the door”" })).toBeVisible();
  await page.getByRole("navigation", { name: "Shared", exact: true }).getByRole("button", { name: "Calendar" }).click();
  // Leaving the view ends the undo window.
  await expect.poll(async () => (await readLists(page))[0].tasks.map((t) => t.title)).toEqual(["Buy milk"]);
  await openTasks(page);
  await expect.poll(() => todoTitles(page)).toEqual(["Buy milk"]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("touch drag reorders, swipe deletes with undo, and the dialog is a bottom sheet", async ({ page }) => {
    await setup(page);
    await openTasks(page);
    await createFirstList(page, "Groceries");
    await addTasks(page, "Apples", "Bread", "Coffee");
    await expect(row(page, "Apples").getByRole("button", { name: "Delete Apples" })).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);

    const moved = saved(page, /\/move$/);
    const coffee = await center(handle(page, "Coffee"));
    const apples = (await row(page, "Apples").boundingBox())!;
    await touchDrag(page, coffee, { x: coffee.x, y: apples.y + 4 });
    await moved;
    await expect.poll(() => todoTitles(page)).toEqual(["Coffee", "Apples", "Bread"]);
    await page.reload();
    await openTasks(page);
    await expect.poll(() => todoTitles(page)).toEqual(["Coffee", "Apples", "Bread"]);

    // A short swipe snaps back; a long one deletes, with undo.
    const bread = (await row(page, "Bread").boundingBox())!;
    const y = bread.y + bread.height / 2;
    await touchDrag(page, { x: 320, y }, { x: 290, y });
    await expect(page.getByRole("status").filter({ hasText: "Deleted" })).toHaveCount(0);
    await expect.poll(() => todoTitles(page)).toEqual(["Coffee", "Apples", "Bread"]);
    await touchDrag(page, { x: 320, y }, { x: 60, y });
    await expect.poll(() => todoTitles(page)).toEqual(["Coffee", "Apples"]);
    const toast = page.getByRole("status").filter({ hasText: "Deleted “Bread”" });
    // Above the tab bar along the bottom of the screen.
    const box = (await toast.boundingBox())!;
    const tabs = (await page.getByRole("navigation", { name: "Shared" }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(tabs.y);
    await toast.getByRole("button", { name: "Undo" }).tap();
    await expect.poll(() => todoTitles(page)).toEqual(["Coffee", "Apples", "Bread"]);
    const gone = saved(page, /\/tasks\/[^/]+$/, "DELETE");
    await touchDrag(page, { x: 320, y }, { x: 60, y });
    await gone;
    await page.reload();
    await openTasks(page);
    await expect.poll(() => todoTitles(page)).toEqual(["Coffee", "Apples"]);

    // A tap still opens the task, in a sheet at the bottom.
    await row(page, "Apples")
      .getByRole("button", { name: /^Apples/ })
      .tap();
    const sheet = await page.getByRole("dialog", { name: "Edit task" }).boundingBox();
    expect(sheet!.y).toBeGreaterThan(0);
    expect(sheet!.y + sheet!.height).toBeLessThan(844);
  });
});

test("changes show before the server answers, and roll back when it refuses", async ({ page }) => {
  await setup(page);
  await openTasks(page);
  await createFirstList(page, "House");
  await addTasks(page, "Call the plumber", "Pay rent");
  const alert = page.getByRole("main").getByRole("alert");

  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${base}/*`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await held;
    await route.fulfill({ status: 500, json: { error: "The server is down." } });
  });
  await page.getByRole("checkbox", { name: "Call the plumber" }).click();
  await expect.poll(() => todoTitles(page)).toEqual(["Pay rent"]);
  await expect(page.getByText("Done (1)")).toBeVisible();
  release();
  await expect(alert).toContainText("The server is down. Your change was undone.");
  await expect.poll(() => todoTitles(page)).toEqual(["Call the plumber", "Pay rent"]);
  await expect(page.getByText("Done (1)")).toHaveCount(0);
  await page.unrouteAll();

  await page.route(`**${base}/*/move`, (route) =>
    route.fulfill({ status: 409, json: { error: "The order changed meanwhile. Try again." } }),
  );
  await keyboardMove(page, "Pay rent", 2, 1, 2);
  await expect(alert).toContainText("The order changed meanwhile. Try again. Your change was undone.");
  await expect.poll(() => todoTitles(page)).toEqual(["Call the plumber", "Pay rent"]);
  await page.unrouteAll();

  await page.route(`**${base}/lists/*/tasks`, (route) => route.abort());
  await page.getByLabel("Write a task").fill("Ghost task");
  await page.getByLabel("Write a task").press("Enter");
  await expect(alert).toContainText("Could not reach the server. Check your connection. Your change was undone.");
  await expect.poll(() => todoTitles(page)).toEqual(["Call the plumber", "Pay rent"]);
  await page.unrouteAll();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(alert).toHaveCount(0);
  await page.reload();
  await openTasks(page);
  await expect.poll(() => todoTitles(page)).toEqual(["Call the plumber", "Pay rent"]);
});

test("the tasks API is scoped to the caller's current space and validates what it saves", async ({
  page,
  browser,
  request,
}) => {
  const space = await setup(page);
  const created = await page.request.post(`${base}/lists`, { data: { name: "  Private  " } });
  expect(created.status()).toBe(201);
  const list: TaskList = (await created.json()).data;
  expect(list).toMatchObject({ name: "Private", tasks: [] });
  const taskResponse = await page.request.post(`${base}/lists/${list.id}/tasks`, {
    data: { title: "Secret", notes: "Hidden", dueDate: "2026-12-24", assigneeId: space.ownerId },
  });
  expect(taskResponse.status()).toBe(201);
  const task: Task = (await taskResponse.json()).data;
  expect(task).toMatchObject({
    listId: list.id,
    title: "Secret",
    notes: "Hidden",
    dueDate: "2026-12-24",
    assigneeId: space.ownerId,
    isComplete: false,
  });
  const second: TaskList = (await (await page.request.post(`${base}/lists`, { data: { name: "Other" } })).json()).data;
  const elsewhere: Task = (
    await (await page.request.post(`${base}/lists/${second.id}/tasks`, { data: { title: "Elsewhere" } })).json()
  ).data;
  expect((await request.get(base)).status()).toBe(401);

  const context = await browser.newContext(contextOptions());
  try {
    const other = await context.newPage();
    const otherSpace = await setup(other);
    expect((await (await other.request.get(base)).json()).data).toEqual([]);
    const attempts = [
      other.request.patch(`${base}/${task.id}`, { data: { title: "Mine" } }),
      other.request.delete(`${base}/${task.id}`),
      other.request.post(`${base}/${task.id}/move`, { data: { beforeId: null } }),
      other.request.patch(`${base}/lists/${list.id}`, { data: { name: "Mine" } }),
      other.request.delete(`${base}/lists/${list.id}`),
      other.request.post(`${base}/lists/${list.id}/move`, { data: { beforeId: null } }),
      other.request.post(`${base}/lists/${list.id}/tasks`, { data: { title: "Planted" } }),
    ];
    for (const response of await Promise.all(attempts)) expect(response.status()).toBe(404);
    // Its own list can't take another space's ids or members either.
    const own: TaskList = (await (await other.request.post(`${base}/lists`, { data: { name: "Own" } })).json()).data;
    expect(
      (await other.request.post(`${base}/lists/${own.id}/tasks`, { data: { id: task.id, title: "Clash" } })).status(),
    ).toBe(409);
    expect(
      (
        await other.request.post(`${base}/lists/${own.id}/tasks`, {
          data: { title: "Theirs", assigneeId: space.ownerId },
        })
      ).status(),
    ).toBe(400);
    expect((await readLists(page)).find((l) => l.id === list.id)!.tasks).toEqual([task]);
    await other.request.post(`/api/shared/spaces/${otherSpace.id}/leave`, { data: {} });
    expect((await other.request.get(base)).status()).toBe(403);

    // A member who joins can work on the tasks; leaving drops their assignments.
    const code = (await (await page.request.post(`/api/shared/spaces/${space.id}/invites`, { data: {} })).json()).data
      .code;
    await other.request.post("/api/shared/spaces/join", { data: { code } });
    const joined: Space = (await (await other.request.get("/api/shared/spaces")).json()).data;
    const memberId = joined.members.find((m) => m.id !== space.ownerId)!.id;
    expect(
      (await other.request.patch(`${base}/${task.id}`, { data: { assigneeId: memberId, isComplete: true } })).status(),
    ).toBe(200);
    await other.request.post(`/api/shared/spaces/${space.id}/leave`, { data: {} });
    expect((await other.request.get(base)).status()).toBe(403);
    expect((await readLists(page)).find((l) => l.id === list.id)!.tasks[0]).toMatchObject({
      assigneeId: null,
      isComplete: true,
    });
  } finally {
    await context.close();
  }

  const invalid: [string, string, object][] = [
    ["POST", `${base}/lists`, { name: " " }],
    ["POST", `${base}/lists`, { name: "x".repeat(81) }],
    ["POST", `${base}/lists`, { id: "not-a-uuid", name: "Bad id" }],
    ["POST", `${base}/lists/${list.id}/tasks`, { title: "" }],
    ["POST", `${base}/lists/${list.id}/tasks`, { title: "x".repeat(201) }],
    ["POST", `${base}/lists/${list.id}/tasks`, { title: "Bad date", dueDate: "2026-02-30" }],
    ["POST", `${base}/lists/${list.id}/tasks`, { title: "Bad notes", notes: "x".repeat(10001) }],
    ["PATCH", `${base}/${task.id}`, { isComplete: "yes" }],
    ["PATCH", `${base}/${task.id}`, { assigneeId: "00000000-0000-4000-8000-000000000000" }],
    ["POST", `${base}/${task.id}/move`, { beforeId: 7 }],
  ];
  for (const [method, url, data] of invalid)
    expect((await page.request.fetch(url, { method, data })).status(), `${method} ${url} ${JSON.stringify(data)}`).toBe(
      400,
    );
  // Positions are only within a list (or the space's lists).
  expect((await page.request.post(`${base}/${task.id}/move`, { data: { beforeId: elsewhere.id } })).status()).toBe(409);
  expect((await page.request.post(`${base}/lists/${list.id}/move`, { data: { beforeId: task.id } })).status()).toBe(
    409,
  );
  // A task is read with its list (GET /api/shared/tasks): no GET of its own.
  expect((await page.request.get(`${base}/${task.id}`)).status()).toBe(405);
  expect((await page.request.patch(`${base}/not-a-uuid`, { data: { title: "x" } })).status()).toBe(404);
  expect(
    (
      await page.request.post(`${base}/lists`, {
        data: { name: "Cross" },
        headers: { origin: "https://elsewhere.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await page.request.post(`${base}/lists`, { data: "name=x", headers: { "content-type": "text/plain" } })).status(),
  ).toBe(415);

  // Deleting a list deletes its tasks.
  expect((await page.request.delete(`${base}/lists/${list.id}`)).status()).toBe(200);
  await withDatabase(async (db) =>
    expect((await db.query("SELECT 1 FROM tasks WHERE id = $1", [task.id])).rowCount).toBe(0),
  );
  expect((await readLists(page)).map((l) => l.name)).toEqual(["Other"]);
});
