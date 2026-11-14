import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { forgetActivity, recordActivity } from "./activity";
import { localParts } from "./calendar";
import { HttpError } from "./http";
import { isUuid, type listInput, type taskCreate, type taskPatch } from "./schemas";
import type { Space } from "./space-types";
import { applyTaskFields, moveBefore, type Task, type TaskList } from "./task-types";

// A space's task lists and tasks. Every function runs in inSpace's transaction
// (lib/spaces.ts), with the space's rows locked for sharing. Clients may choose
// the ids of what they create (taskCreate, listInput), so they can keep working
// with it before the response arrives (optimistic updates).

const columns = `id, list_id AS "listId", title, coalesce(notes, '') AS notes, due_date::text AS "dueDate",
  assignee_id AS "assigneeId", ARRAY(SELECT user_id FROM task_assignees WHERE task_id = tasks.id ORDER BY user_id) AS "assigneeIds", is_complete AS "isComplete", repeat`;

/** Today in the calendar's time zone, for due dates. */
const today = () => localParts(new Date()).date;

export async function readLists(db: PoolClient, space: Space): Promise<TaskList[]> {
  const lists = await db.query("SELECT id, name FROM task_lists WHERE space_id = $1 ORDER BY position, id", [space.id]);
  const tasks = await db.query<Task>(
    `SELECT ${columns} FROM tasks
     WHERE list_id IN (SELECT id FROM task_lists WHERE space_id = $1) ORDER BY position, id`,
    [space.id],
  );
  return lists.rows.map((list) => ({ ...list, tasks: tasks.rows.filter((task) => task.listId === list.id) }));
}

async function findList(db: PoolClient, space: Space, id: string): Promise<{ id: string; name: string }> {
  if (!isUuid(id)) throw new HttpError("List not found.", 404);
  const { rows } = await db.query("SELECT id, name FROM task_lists WHERE id = $1 AND space_id = $2", [id, space.id]);
  if (!rows[0]) throw new HttpError("List not found.", 404);
  return rows[0];
}

async function findTask(db: PoolClient, space: Space, id: string): Promise<Task & { list: string }> {
  if (!isUuid(id)) throw new HttpError("Task not found.", 404);
  const { rows } = await db.query<Task & { list: string }>(
    `SELECT ${columns}, (SELECT name FROM task_lists l WHERE l.id = tasks.list_id) AS list FROM tasks
     WHERE id = $1 AND list_id IN (SELECT id FROM task_lists WHERE space_id = $2)`,
    [id, space.id],
  );
  if (!rows[0]) throw new HttpError("Task not found.", 404);
  return rows[0];
}

function checkAssignees(space: Space, ids: readonly string[]) {
  if (!ids.every((id) => space.members.some((member) => member.id === id)))
    throw new HttpError("Assign the task to a current member, or to nobody.");
}

async function saveAssignees(db: PoolClient, taskId: string, ids: string[]) {
  await db.query("DELETE FROM task_assignees WHERE task_id = $1", [taskId]);
  if (ids.length)
    await db.query(
      "INSERT INTO task_assignees (task_id, user_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING",
      [taskId, ids],
    );
}

// Puts `id` before `before` (null: at the end) and renumbers the rows 0, 1, 2...
// `table` and `scope` are constants, never user input.
async function move(
  db: PoolClient,
  table: "tasks" | "task_lists",
  scope: "list_id" | "space_id",
  scopeId: string,
  id: string,
  before: string | null,
) {
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE ${scope} = $1 ORDER BY position, id`, [scopeId]);
  const order = moveBefore(rows, id, before);
  if (!order) throw new HttpError("The order changed meanwhile. Try again.", 409);
  await db.query(
    `UPDATE ${table} SET position = o.n - 1 FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, n)
     WHERE ${table}.id = o.id`,
    [order.map((row) => row.id)],
  );
}

export async function createList(db: PoolClient, space: Space, userId: string, input: z.output<typeof listInput>) {
  const { rows } = await db.query(
    `INSERT INTO task_lists (id, space_id, name, position)
     SELECT $1::uuid, $2::uuid, $3::text, coalesce(max(position) + 1, 0) FROM task_lists WHERE space_id = $2
     ON CONFLICT (id) DO NOTHING RETURNING id, name`,
    [input.id ?? randomUUID(), space.id, input.name],
  );
  if (!rows[0]) throw new HttpError("Could not create the list. Try again.", 409);
  await recordActivity(db, {
    userId,
    spaceId: space.id,
    kind: "list-added",
    key: `list:${rows[0].id}`,
    data: { name: input.name },
  });
  return { ...rows[0], tasks: [] };
}

export async function renameList(db: PoolClient, space: Space, id: string, name: string) {
  await findList(db, space, id);
  const { rows } = await db.query(
    "UPDATE task_lists SET name = $3 WHERE id = $1 AND space_id = $2 RETURNING id, name",
    [id, space.id, name],
  );
  return rows[0];
}

export async function deleteList(db: PoolClient, space: Space, userId: string, id: string): Promise<null> {
  await findList(db, space, id);
  await db.query("DELETE FROM task_lists WHERE id = $1 AND space_id = $2", [id, space.id]);
  await forgetActivity(db, userId, `list:${id}`);
  return null;
}

export async function moveList(db: PoolClient, space: Space, id: string, beforeId: string | null): Promise<null> {
  await findList(db, space, id);
  await move(db, "task_lists", "space_id", space.id, id, beforeId);
  return null;
}

export async function addTask(
  db: PoolClient,
  space: Space,
  userId: string,
  listId: string,
  input: z.output<typeof taskCreate>,
): Promise<Task> {
  const list = await findList(db, space, listId);
  const assigneeIds = input.assigneeIds ?? (input.assigneeId ? [input.assigneeId] : []);
  checkAssignees(space, assigneeIds);
  const { rows } = await db.query<Task>(
    `INSERT INTO tasks (id, list_id, title, notes, due_date, assignee_id, is_complete, repeat, position)
     SELECT $1::uuid, $2::uuid, $3::text, nullif($4::text, ''), $5::date, $6::uuid, $7::boolean, $8::text,
       coalesce(max(position) + 1, 0)
     FROM tasks WHERE list_id = $2 ON CONFLICT (id) DO NOTHING RETURNING ${columns}`,
    [
      input.id ?? randomUUID(),
      list.id,
      input.title,
      input.notes,
      input.dueDate,
      assigneeIds[0] ?? null,
      input.isComplete,
      input.repeat,
    ],
  );
  if (!rows[0]) throw new HttpError("Could not create the task. Try again.", 409);
  await saveAssignees(db, rows[0].id, assigneeIds);
  await recordActivity(db, {
    userId,
    spaceId: space.id,
    kind: "task-added",
    key: `task:${rows[0].id}`,
    data: { title: input.title, list: list.name },
  });
  return { ...rows[0], assigneeIds };
}

/**
 * Changes any of a task's fields. Ticking off a repeating task moves its due
 * date on instead (applyTaskFields), and a task ticked off again goes to the end
 * of its list, just above Done.
 */
export async function updateTask(
  db: PoolClient,
  space: Space,
  userId: string,
  id: string,
  fields: z.output<typeof taskPatch>,
): Promise<Task> {
  const current = await findTask(db, space, id);
  const task = applyTaskFields(current, fields, today());
  const assigneeIds = task.assigneeIds ?? [];
  checkAssignees(space, assigneeIds);
  const reopened = current.isComplete && !task.isComplete;
  const { rows } = await db.query<Task>(
    `UPDATE tasks SET title = $2, notes = nullif($3, ''), due_date = $4, assignee_id = $5, is_complete = $6, repeat = $7,
       position = CASE WHEN $8 THEN (SELECT coalesce(max(position) + 1, 0) FROM tasks WHERE list_id = $9) ELSE position END
     WHERE id = $1 RETURNING ${columns}`,
    [id, task.title, task.notes, task.dueDate, task.assigneeId, task.isComplete, task.repeat, reopened, current.listId],
  );
  if (fields.assigneeIds !== undefined || fields.assigneeId !== undefined) await saveAssignees(db, id, assigneeIds);
  if (fields.isComplete && !current.isComplete) {
    await recordActivity(db, {
      userId,
      spaceId: space.id,
      kind: "task-done",
      key: `task-done:${id}`,
      data: { title: task.title, list: current.list },
    });
  }
  return { ...rows[0], assigneeIds };
}

export async function deleteTask(db: PoolClient, space: Space, userId: string, id: string): Promise<null> {
  await findTask(db, space, id);
  await db.query("DELETE FROM tasks WHERE id = $1", [id]);
  await forgetActivity(db, userId, `task:${id}`);
  return null;
}

/**
 * Moves a task before another of its list, or to its end (null). With
 * `listId`, to the end of that list of the space instead (the task's popup, List).
 */
export async function moveTask(
  db: PoolClient,
  space: Space,
  id: string,
  beforeId: string | null,
  listId?: string,
): Promise<null> {
  const task = await findTask(db, space, id);
  if (listId && listId !== task.listId) {
    await findList(db, space, listId);
    await db.query(
      `UPDATE tasks SET list_id = $2, position = (SELECT coalesce(max(position) + 1, 0) FROM tasks WHERE list_id = $2)
       WHERE id = $1`,
      [id, listId],
    );
    return null;
  }
  await move(db, "tasks", "list_id", task.listId, id, beforeId);
  return null;
}
