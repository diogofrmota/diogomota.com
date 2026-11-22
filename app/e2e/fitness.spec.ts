import type { APIRequestContext, Page } from "@playwright/test";
import { expect, newUser, signUp, test } from "./fixtures";
import { otherPerson } from "./shows";

// The Fitness app (/fitness): a routine made, started at the gym and its sets
// logged (the last time's weights, a personal record), Today's water, steps,
// body weight and supplements (and home's count of them), a run with its pace,
// the history and records, and the API's rules: only your own data, and what
// it refuses.

const tab = (page: Page, view: "Today" | "Workouts" | "Progress") =>
  page.getByRole("navigation", { name: "Fitness", exact: true }).getByRole("button", { name: view, exact: true });

/** Today in Lisbon, and `n` days before it: the app's days. */
const lisbonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
const daysAgo = (n: number) =>
  new Date(Date.parse(`${lisbonToday()}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

async function openFitness(page: Page, path = "/fitness") {
  await signUp(page, newUser(), `/signup?next=${encodeURIComponent(path)}`);
  await expect(page).toHaveURL(path);
}

async function post(request: APIRequestContext, path: string, data: object) {
  const response = await request.post(`/api/fitness${path}`, { data });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return (await response.json()).data;
}

/** What the server has now. */
const serverData = async (page: Page) => (await (await page.request.get("/api/fitness")).json()).data;

/** Waits for the next change the app sends to the API. */
const changeSent = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method);

test("a routine: made, started at the gym, its sets logged with the last time's weights, a record on the way", async ({
  page,
}) => {
  await openFitness(page, "/fitness/workouts");
  await expect(page.getByRole("heading", { name: "Plan your workouts" })).toBeVisible();
  await page.getByRole("button", { name: "Create your first routine" }).click();
  const form = page.getByRole("dialog", { name: "New routine" });
  await expect(page).toHaveURL("/fitness/workouts?p=new-routine");

  // A name and an exercise are needed; Save says what to fix.
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Enter a name, like Push day.")).toBeVisible();
  await expect(form.getByText("Add at least one exercise.")).toBeVisible();

  await form.getByLabel("Name").fill("Push day");
  await form.getByLabel("Exercise 1", { exact: true }).fill("Bench press");
  await form.getByLabel("Reps of exercise 1").fill("8");
  await form.getByRole("button", { name: "Add exercise" }).click();
  await form.getByLabel("Exercise 2", { exact: true }).fill("Dips");
  await form.getByLabel("Sets of exercise 2").fill("2");
  await form.getByLabel("Reps of exercise 2").fill("0");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Enter from 1 to 100 reps.")).toBeVisible();
  await form.getByLabel("Reps of exercise 2").fill("12");
  // Moved first, then back down.
  await form.getByRole("button", { name: "Move exercise 2 up" }).click();
  await expect(form.getByLabel("Exercise 1", { exact: true })).toHaveValue("Dips");
  await form.getByRole("button", { name: "Move exercise 1 down" }).click();
  await expect(form.getByLabel("Exercise 1", { exact: true })).toHaveValue("Bench press");
  const saved = changeSent(page, "POST", /^\/api\/fitness\/routines$/);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  expect((await saved).status()).toBe(201);
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Push day" }) });
  await expect(card.getByRole("listitem")).toHaveText(["Bench press3 × 8", "Dips2 × 12"]);

  // Last week's session, from another device.
  await post(page.request, "/workouts", {
    date: daysAgo(7),
    name: "Push day",
    exercises: [
      {
        id: crypto.randomUUID(),
        name: "bench press",
        sets: [
          { reps: 8, weightKg: 60, done: true },
          { reps: 7, weightKg: 60, done: true },
        ],
      },
    ],
  });
  // The page shows what it kept from before at once: Start once the new session has loaded.
  const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/fitness");
  await page.reload();
  await loaded;

  // Started: its sets at its reps and the last time's weights, none done yet.
  await page.getByRole("button", { name: "Start Push day" }).click();
  const workout = page.getByRole("dialog", { name: "Push day" });
  await expect(page).toHaveURL(/\/fitness\/workouts\?p=workout%3A[0-9a-f-]{36}$/);
  const bench = workout.getByRole("region", { name: "Bench press" });
  await expect(bench).toContainText("60 kg × 8, 7");
  await expect(bench.getByLabel("Set 1 weight in kg")).toHaveValue("60");
  await expect(bench.getByLabel("Set 3 weight in kg")).toHaveValue("60");
  await expect(bench.getByLabel("Set 1 reps")).toHaveValue("8");
  await expect(workout).toContainText("2 exercises · 0 of 5 sets");

  // A heavier first set, ticked off: a personal record.
  await bench.getByLabel("Set 1 weight in kg").fill("62,5");
  const ticked = changeSent(page, "PATCH", /^\/api\/fitness\/workouts\//);
  await bench.getByRole("button", { name: "Set 1 done" }).click();
  await expect(bench.getByRole("button", { name: "Set 1 done" })).toHaveAttribute("aria-pressed", "true");
  expect((await ticked).status()).toBe(200);
  await expect(bench.getByLabel("Set 1 weight in kg")).toHaveValue("62.5");
  await expect(workout).toContainText("2 exercises · 1 of 5 sets · 500 kg");
  await expect(workout.getByText("A personal record", { exact: true })).toBeVisible();
  await expect(bench.getByRole("rowheader", { name: /^1 ?, a personal record$/ })).toBeVisible();
  await bench.getByRole("button", { name: "Set 2 done" }).click();
  await expect(workout).toContainText("2 of 5 sets");

  // Add set copies the last; Remove set takes it off.
  await bench.getByRole("button", { name: "Add set to Bench press" }).click();
  await expect(bench.getByLabel("Set 4 weight in kg")).toHaveValue("60");
  await bench.getByRole("button", { name: "Remove set from Bench press" }).click();
  await expect(bench.getByLabel("Set 4 weight in kg")).toHaveCount(0);

  // An exercise added; one removed waits for its Undo, here in the workout.
  await workout.getByLabel("Add an exercise").fill("Squat");
  await workout.getByLabel("Add an exercise").press("Enter");
  const squat = workout.getByRole("region", { name: "Squat" });
  await expect(squat.getByLabel("Set 1 reps")).toHaveValue("");
  await squat.getByRole("button", { name: "Remove Squat" }).click();
  await expect(workout.getByRole("status").filter({ hasText: "Squat removed." })).toBeVisible();
  await expect(squat).toHaveCount(0);
  await workout.getByRole("button", { name: "Undo" }).click();
  await expect(squat).toBeVisible();

  // All of it is saved: a reload opens the workout as it was.
  await expect
    .poll(async () => {
      const today = (await serverData(page)).workouts.find((w: { date: string }) => w.date === lisbonToday());
      return today?.exercises.map((e: { name: string; sets: unknown[] }) => [e.name, e.sets.length]);
    })
    .toEqual([
      ["Bench press", 3],
      ["Dips", 2],
      ["Squat", 1],
    ]);
  await page.reload();
  await expect(workout.getByRole("region", { name: "Bench press" }).getByLabel("Set 1 weight in kg")).toHaveValue(
    "62.5",
  );
  await expect(workout.getByRole("region", { name: "Squat" })).toBeVisible();
  await workout.getByRole("button", { name: "Done", exact: true }).click();
  await expect(workout).toBeHidden();

  // Today has it, and Progress the record.
  await tab(page, "Today").click();
  await expect(page.getByRole("button", { name: /^Push day\s*3 exercises · 2 of 6 sets · 980 kg/ })).toBeVisible();
  await tab(page, "Progress").click();
  const records = page.getByRole("list", { name: "Lifts" });
  await expect(records.getByRole("button", { name: /^Bench press\s*62\.5 kg × 8/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Exercise" })).toHaveValue("bench press");

  // A routine deleted waits for its Undo; the workouts started from it stay.
  await tab(page, "Workouts").click();
  await page.getByRole("button", { name: "Edit Push day" }).click();
  await page.getByRole("dialog", { name: "Edit routine" }).getByRole("button", { name: "Delete routine" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deleted “Push day”" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plan your workouts" })).toBeVisible();
  const deleted = changeSent(page, "DELETE", /^\/api\/fitness\/routines\//);
  expect((await deleted).status()).toBe(200);
  const data = await serverData(page);
  expect(data.routines).toEqual([]);
  expect(data.workouts).toHaveLength(2);
});

test("Today: water, steps, body weight and supplements, day by day; home counts what's left to take", async ({
  page,
}) => {
  await openFitness(page);
  await expect(page.getByRole("heading", { level: 2, name: "Today" })).toBeVisible();
  const water = page.getByRole("region", { name: "Water" });
  await expect(water).toContainText("0 of 2,000 ml");
  await water.getByRole("button", { name: "250 ml", exact: true }).click();
  await water.getByRole("button", { name: "500 ml", exact: true }).click();
  await water.getByRole("button", { name: "250 ml", exact: true }).click();
  await expect(water).toContainText("1,000 of 2,000 ml");
  await water.getByRole("button", { name: "250 ml less" }).click();
  await expect(water).toContainText("750 of 2,000 ml");

  const steps = page.getByRole("region", { name: "Steps" });
  await steps.getByLabel("Steps").fill("lots");
  await steps.getByRole("button", { name: "Save" }).click();
  await expect(steps.getByText("Enter the steps as a whole number, up to 200,000.")).toBeVisible();
  await steps.getByLabel("Steps").fill("8,500");
  await steps.getByRole("button", { name: "Save" }).click();
  await expect(steps).toContainText("8,500 of 10,000");

  const weight = page.getByRole("region", { name: "Body weight" });
  await expect(weight).toContainText("Weigh yourself at the same time each day");
  await weight.getByLabel("Body weight in kg").fill("78,4");
  await weight.getByRole("button", { name: "Save" }).click();
  await expect(weight).toContainText("78.4 kg");
  await expect(weight).toContainText("Your first weigh-in.");

  // The day before has its own log.
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Yesterday" })).toBeVisible();
  await expect(water).toContainText("0 of 2,000 ml");
  await weight.getByLabel("Body weight in kg").fill("79");
  await weight.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Next day" })).toBeEnabled();
  await page.getByRole("button", { name: "Back to today" }).click();
  await expect(page.getByRole("button", { name: "Next day" })).toBeDisabled();
  await expect(weight).toContainText("−0.6 kg since");

  // The goals.
  await water.getByRole("button", { name: "Goal 2,000 ml" }).click();
  const goals = page.getByRole("dialog", { name: "Daily goals" });
  await goals.getByLabel("Water in ml").fill("100");
  await goals.getByRole("button", { name: "Save" }).click();
  await expect(goals.getByText("Enter from 250 to 10,000 ml.")).toBeVisible();
  await goals.getByLabel("Water in ml").fill("2500");
  await goals.getByRole("button", { name: "Save" }).click();
  await expect(goals).toBeHidden();
  await expect(water).toContainText("750 of 2,500 ml");

  // Supplements: added, ticked off; home counts the ones left today.
  const supplements = page.getByRole("region", { name: "Supplements" });
  await supplements.getByRole("button", { name: "Add supplements" }).click();
  const list = page.getByRole("dialog", { name: "Supplements" });
  await list.getByRole("button", { name: "Add", exact: true }).click();
  await expect(list.getByText("Enter the supplement's name, like Creatine.")).toBeVisible();
  for (const [name, dose] of [
    ["Creatine", "5 g"],
    ["Vitamin D", ""],
    ["Magnesium", ""],
  ]) {
    await list.getByLabel("Name").fill(name);
    await list.getByLabel(/^Dose/).fill(dose);
    await list.getByRole("button", { name: "Add", exact: true }).click();
  }
  await expect(list.getByRole("list", { name: "Your supplements" }).getByRole("listitem")).toHaveCount(3);
  // Removed at once, with its Undo in the dialog.
  const removed = changeSent(page, "DELETE", /^\/api\/fitness\/supplements\//);
  await list.getByRole("button", { name: "Remove Magnesium" }).click();
  await expect(list.getByRole("status")).toHaveText("Magnesium removed.Undo");
  await list.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Removed “Magnesium”" })).toBeVisible();
  await expect(supplements.getByRole("checkbox")).toHaveCount(2);
  await supplements.getByRole("checkbox", { name: "Creatine · 5 g" }).check();
  await expect(supplements).toContainText("1 of 2 taken");
  expect((await removed).status()).toBe(200);
  const taken = async () =>
    (await serverData(page)).days.find((d: { date: string }) => d.date === lisbonToday())?.taken;
  await expect.poll(taken).toHaveLength(1);

  await page.goto("/");
  // Its folder, Health, says something is waiting (docs/decisions/0023), and
  // its icon in the folder says what: "Fitness, 1 supplement to take".
  const health = page.getByRole("main").getByRole("button", { name: /^Health\b/ });
  await expect(health).toHaveAccessibleName("Health, 1 waiting");
  await health.click();
  const icon = page.getByRole("dialog", { name: "Health" }).getByRole("link", { name: /^Fitness\b/ });
  await expect(icon).toHaveAccessibleName("Fitness, 1 supplement to take");
  await page.goto("/fitness");
  await page.getByRole("region", { name: "Supplements" }).getByRole("checkbox", { name: "Vitamin D" }).check();
  await expect(page.getByRole("region", { name: "Supplements" })).toContainText("All taken.");
  await expect.poll(taken).toHaveLength(2);
  await page.goto("/");
  await expect(health).toHaveAccessibleName("Health");
  await health.click();
  await expect(icon).toHaveAccessibleName("Fitness");

  // All of it on the server, by day.
  const data = await serverData(page);
  expect(data.goals).toEqual({ waterMl: 2500, steps: 10000 });
  expect(data.supplements.map((s: { name: string }) => s.name)).toEqual(["Creatine", "Vitamin D"]);
  expect(data.days).toEqual([
    { date: daysAgo(1), steps: null, waterMl: 0, weightKg: 79, taken: [] },
    {
      date: lisbonToday(),
      steps: 8500,
      waterMl: 750,
      weightKg: 78.4,
      taken: expect.arrayContaining(data.supplements.map((s: { id: string }) => s.id)),
    },
  ]);
});

test("a run: its pace as it's typed, in the history and the records; changed, then deleted with Undo", async ({
  page,
}) => {
  await openFitness(page);
  await page.getByRole("button", { name: "Log a run" }).click();
  const form = page.getByRole("dialog", { name: "Log a run" });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Enter the distance in km, like 5.2.")).toBeVisible();
  await form.getByLabel("Distance in km").fill("5,2");
  await form.getByLabel("Minutes").fill("28");
  await form.getByLabel("Seconds").fill("30");
  await expect(form.locator("output")).toHaveText("5:29 /km");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("button", { name: /^Run\s*5\.2 km · 28:30 · 5:29 \/km/ })).toBeVisible();

  // An older, longer one: Progress has the longest and the fastest.
  await post(page.request, "/runs", { date: daysAgo(3), distanceM: 10000, durationS: 3300 });
  await page.reload();
  await tab(page, "Progress").click();
  const runs = page.getByRole("list", { name: "Runs" });
  await expect(runs.getByRole("button", { name: /^Longest run\s*10 km/ })).toBeVisible();
  await expect(runs.getByRole("button", { name: /^Fastest pace\s*5:29 \/km/ })).toBeVisible();

  // In the history, Runs only; opened, changed.
  await tab(page, "Workouts").click();
  await page.getByRole("button", { name: "Runs", exact: true }).click();
  await expect(page.getByRole("button", { name: /Run\s*5\.2 km/ })).toBeVisible();
  await page.getByRole("button", { name: /Run\s*5\.2 km/ }).click();
  const run = page.getByRole("dialog", { name: "Run" });
  await expect(run.getByLabel("Distance in km")).toHaveValue("5.2");
  await run.getByLabel("Distance in km").fill("6");
  await run.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: /Run\s*6 km · 28:30 · 4:45 \/km/ })).toBeVisible();

  // Deleted with Undo, then for good.
  await page.getByRole("button", { name: /Run\s*6 km/ }).click();
  await run.getByRole("button", { name: "Delete run" }).click();
  await expect(page.getByRole("button", { name: /Run\s*6 km/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /Run\s*6 km/ })).toBeVisible();
  await page.getByRole("button", { name: /Run\s*6 km/ }).click();
  await run.getByRole("button", { name: "Delete run" }).click();
  const deleted = changeSent(page, "DELETE", /^\/api\/fitness\/runs\//);
  expect((await deleted).status()).toBe(200);
  const data = await serverData(page);
  expect(data.runs).toEqual([expect.objectContaining({ distanceM: 10000, durationS: 3300 })]);
});

test("the API: only your own data, and what it refuses @smoke", async ({ page, browser, request }) => {
  await openFitness(page);
  const routine = await post(page.request, "/routines", {
    name: "Legs",
    exercises: [{ name: "Squat", sets: 5, reps: 5 }],
  });
  const workout = await post(page.request, "/workouts", { date: daysAgo(0), name: "Legs", routineId: routine.id });
  const run = await post(page.request, "/runs", { date: daysAgo(1), distanceM: 5000, durationS: 1500 });
  const supplement = await post(page.request, "/supplements", { name: "Creatine" });

  // Sent twice (a change that waited offline), a new workout is answered with what is there.
  const again = await page.request.post("/api/fitness/workouts", {
    data: { id: workout.id, date: daysAgo(0), name: "Other" },
  });
  expect(again.status()).toBe(201);
  expect((await again.json()).data).toMatchObject({ id: workout.id, name: "Legs", routineId: routine.id });

  // Download my data has it all.
  const exported = await (await page.request.get("/api/account/export")).json();
  expect(exported.fitness).toMatchObject({
    routines: [expect.objectContaining({ name: "Legs" })],
    workouts: [expect.objectContaining({ id: workout.id })],
    runs: [expect.objectContaining({ distanceM: 5000 })],
    supplements: [expect.objectContaining({ name: "Creatine" })],
    goals: { waterMl: 2000, steps: 10000 },
  });

  // Someone else sees none of it, and can't change it.
  const other = await otherPerson(browser);
  const theirs = other.page.request;
  expect((await (await theirs.get("/api/fitness")).json()).data).toMatchObject({
    routines: [],
    workouts: [],
    runs: [],
    supplements: [],
    days: [],
  });
  for (const [path, data] of [
    [`/routines/${routine.id}`, { name: "Mine" }],
    [`/workouts/${workout.id}`, { name: "Mine" }],
    [`/runs/${run.id}`, { distanceM: 1000 }],
  ] as const) {
    expect((await theirs.patch(`/api/fitness${path}`, { data })).status()).toBe(404);
    expect((await theirs.delete(`/api/fitness${path}`)).status()).toBe(404);
  }
  expect((await theirs.delete(`/api/fitness/supplements/${supplement.id}`)).status()).toBe(404);
  // Their ids can't be taken over, and a workout from their routine is from no routine.
  expect((await theirs.post("/api/fitness/runs", { data: { id: run.id, ...run } })).status()).toBe(409);
  const fromTheirs = await post(theirs, "/workouts", { date: daysAgo(0), name: "Legs", routineId: routine.id });
  expect(fromTheirs.routineId).toBeNull();
  await other.context.close();

  // What it refuses, and why.
  const refused = async (response: Promise<{ status(): number; json(): Promise<{ error: string }> }>) => {
    const r = await response;
    return [r.status(), (await r.json()).error];
  };
  expect(await refused(page.request.post("/api/fitness/routines", { data: { name: "Empty", exercises: [] } }))).toEqual(
    [400, "Add at least one exercise."],
  );
  expect(
    await refused(
      page.request.patch(`/api/fitness/workouts/${workout.id}`, {
        data: {
          exercises: [{ id: crypto.randomUUID(), name: "Squat", sets: [{ reps: 5, weightKg: 2000, done: true }] }],
        },
      }),
    ),
  ).toEqual([400, "Enter a weight from 0 to 1000 kg."]);
  expect(
    await refused(page.request.patch(`/api/fitness/workouts/${workout.id}`, { data: { date: "2026-02-30" } })),
  ).toEqual([400, "Enter a date as dd/mm/yyyy."]);
  expect(await refused(page.request.patch(`/api/fitness/days/${daysAgo(0)}`, { data: { weightKg: 10 } }))).toEqual([
    400,
    "Enter a weight from 20 to 400 kg.",
  ]);
  expect((await page.request.patch("/api/fitness/days/yesterday", { data: { steps: 10 } })).status()).toBe(404);
  expect(await refused(page.request.patch("/api/fitness/goals", { data: { steps: 1 } }))).toEqual([
    400,
    "Enter a steps goal from 500 to 100,000.",
  ]);

  // A day with nothing logged any more has no row; null clears a value.
  await page.request.patch(`/api/fitness/days/${daysAgo(0)}`, { data: { steps: 4000, weightKg: 80 } });
  const cleared = await page.request.patch(`/api/fitness/days/${daysAgo(0)}`, { data: { steps: null } });
  expect((await cleared.json()).data).toEqual({
    date: daysAgo(0),
    steps: null,
    waterMl: 0,
    weightKg: 80,
    taken: [],
  });
  await page.request.patch(`/api/fitness/days/${daysAgo(0)}`, { data: { weightKg: null } });
  expect((await (await page.request.get("/api/fitness")).json()).data.days).toEqual([]);

  // Changes only from this site; logged out, nothing.
  const crossSite = await page.request.patch(`/api/fitness/runs/${run.id}`, {
    data: { distanceM: 1 },
    headers: { Origin: "https://evil.example" },
  });
  expect(crossSite.status()).toBe(403);
  expect((await request.get("/api/fitness")).status()).toBe(401);
});
