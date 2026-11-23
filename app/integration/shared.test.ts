import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { getPool } from "../lib/db";
import { createSpace, inSpace } from "../lib/spaces";
import { createList, addTask, updateTask, readLists } from "../lib/tasks";
import { createEvent, importBenficaGames } from "../lib/events";
import { assertTestIsolation } from "../e2e/isolation";

assertTestIsolation();
afterAll(() => getPool().end());
async function fixture() {
  const id = randomUUID();
  await getPool().query("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", [
    id,
    `test_${id.replaceAll("-", "").slice(0, 12)}`,
    `${id}@example.test`,
  ]);
  const space = await createSpace(id);
  const list = await inSpace(id, (db, s) => createList(db, s, id, { name: "Concurrency" }));
  const task = await inSpace(id, (db, s) =>
    addTask(db, s, id, list.id, {
      title: "Original",
      notes: "",
      dueDate: "2026-11-18",
      assigneeId: null,
      isComplete: false,
      repeat: "daily",
    }),
  );
  return { id, space, task };
}

it("retains independent task patches when the first transaction holds its result uncommitted", async () => {
  const { id, task } = await fixture();
  let release!: () => void;
  let updated!: () => void;
  const ready = new Promise<void>((resolve) => {
    updated = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = inSpace(id, async (db, s) => {
    await updateTask(db, s, id, task.id, { title: "Renamed", assigneeIds: [id] });
    updated();
    await barrier;
  });
  await ready;
  const second = inSpace(id, (db, s) => updateTask(db, s, id, task.id, { notes: "Independent notes" }));
  // Wait for the second database connection to block on the first transaction.
  for (let i = 0; i < 100; i++) {
    const result = await getPool().query(
      "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    );
    if (result.rowCount) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  release();
  await Promise.all([first, second]);
  const lists = await inSpace(id, readLists);
  expect(lists[0].tasks[0]).toMatchObject({
    title: "Renamed",
    notes: "Independent notes",
    assigneeId: id,
    assigneeIds: [id],
  });
});

it("concurrent fixture imports create one event and report accurate counts", async () => {
  const { id } = await fixture();
  const matches = [{ kickoff: "2026-12-01T20:00:00Z", homeTeam: "Benfica", awayTeam: "Opponent" }];
  // Both transactions already hold shared membership locks, as two members do.
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const run = () =>
    inSpace(id, async (db, s) => {
      if (++arrivals === 2) release();
      await barrier;
      return importBenficaGames(db, s, id, matches);
    });
  const results = await Promise.all([run(), run()]);
  expect(results.reduce((n, r) => n + r.added, 0)).toBe(1);
  expect(results.reduce((n, r) => n + r.skipped, 0)).toBe(1);
  for (let i = 0; i < 2; i++)
    await inSpace(id, (db, s) =>
      createEvent(db, s, id, {
        title: "Benfica vs Opponent",
        startsAt: matches[0].kickoff,
        endsAt: "2026-12-01T22:00:00Z",
        allDay: false,
        isGroup: true,
        assigneeIds: [],
      }),
    );
  expect(
    (
      await getPool().query(
        "SELECT count(*)::int AS count FROM events WHERE space_id = (SELECT space_id FROM users WHERE id = $1)",
        [id],
      )
    ).rows[0].count,
  ).toBe(3);
});

it("competing edits to the same task field serialize, retaining the last completed write", async () => {
  const { id, task } = await fixture();
  const completed: string[] = [];
  await Promise.all(
    ["First", "Second"].map((title) =>
      inSpace(id, (db, s) => updateTask(db, s, id, task.id, { title })).then((saved) => {
        completed.push(saved.title);
      }),
    ),
  );
  expect((await inSpace(id, readLists))[0].tasks[0].title).toBe(completed.at(-1));
  expect(new Set(completed)).toEqual(new Set(["First", "Second"]));
});

it("replaying and concurrently completing one occurrence advances only once; the next remains completable", async () => {
  const { id, task } = await fixture();
  const fields = { isComplete: true, expectedDueDate: task.dueDate };
  const complete = () => inSpace(id, (db, s) => updateTask(db, s, id, task.id, fields));
  const results = await Promise.all([complete(), complete()]);
  expect(results[0].dueDate).toBe(results[1].dueDate);
  expect((await complete()).dueDate).toBe(results[0].dueDate);
  const next = await inSpace(id, (db, s) =>
    updateTask(db, s, id, task.id, { isComplete: true, expectedDueDate: results[0].dueDate }),
  );
  expect(next.dueDate).not.toBe(results[0].dueDate);
  await expect(inSpace(id, (db, s) => updateTask(db, s, id, task.id, { isComplete: true }))).rejects.toMatchObject({
    status: 409,
  });
});
