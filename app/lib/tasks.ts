import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Space } from "./space-types";
import { moveBefore, type Task, type TaskList } from "./task-types";
import { readSpace, SpaceError } from "./spaces";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const columns = `id, list_id AS "listId", title, coalesce(notes, '') AS notes, due_date::text AS "dueDate",
  assignee_id AS "assigneeId", is_complete AS "isComplete"`;

export async function readLists(db: PoolClient, spaceId: string): Promise<TaskList[]> {
  const lists = await db.query("SELECT id, name FROM task_lists WHERE space_id = $1 ORDER BY position, id", [spaceId]);
  const tasks = await db.query<Task>(`SELECT ${columns} FROM tasks
    WHERE list_id IN (SELECT id FROM task_lists WHERE space_id = $1) ORDER BY position, id`, [spaceId]);
  return lists.rows.map((list) => ({ ...list, tasks: tasks.rows.filter((task) => task.listId === list.id) }));
}

// Clients may choose the id of what they create, so they can keep working with
// it before the response arrives (optimistic updates).
function newId(value: unknown) {
  if (value === undefined) return randomUUID();
  if (typeof value !== "string" || !uuid.test(value)) throw new SpaceError("Invalid id.");
  return value.toLowerCase();
}
function listName(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
    throw new SpaceError("Enter a list name between 1 and 80 characters.");
  return value.trim();
}
const validDate = (value: unknown): value is string => typeof value === "string" && /^(19|2\d)\d{2}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

// The fields of a new task, or of `current` with the ones in `body` changed.
function taskFields(space: Space, body: Record<string, unknown>, current?: Task) {
  const { title, notes, dueDate, assigneeId, isComplete } = { notes: "", dueDate: null, assigneeId: null, isComplete: false, ...current, ...body };
  if (typeof title !== "string" || !title.trim() || title.trim().length > 200) throw new SpaceError("Enter a task title between 1 and 200 characters.");
  if (typeof notes !== "string" || notes.length > 10000) throw new SpaceError("Notes must be at most 10,000 characters.");
  if (dueDate !== null && !validDate(dueDate)) throw new SpaceError("Enter a valid due date, or none.");
  if (assigneeId !== null && !space.members.some((m) => m.id === assigneeId)) throw new SpaceError("Assign the task to a current member, or to nobody.");
  if (typeof isComplete !== "boolean") throw new SpaceError("isComplete must be true or false.");
  return { title: title.trim(), notes, dueDate, assigneeId: assigneeId as string | null, isComplete };
}

async function findList(db: PoolClient, spaceId: string, id: string) {
  const { rowCount } = await db.query("SELECT 1 FROM task_lists WHERE id = $1 AND space_id = $2", [id, spaceId]);
  if (!rowCount) throw new SpaceError("List not found.", 404);
}
async function findTask(db: PoolClient, spaceId: string, id: string) {
  const { rows } = await db.query<Task>(`SELECT ${columns} FROM tasks
    WHERE id = $1 AND list_id IN (SELECT id FROM task_lists WHERE space_id = $2)`, [id, spaceId]);
  if (!rows[0]) throw new SpaceError("Task not found.", 404);
  return rows[0];
}

// Puts `id` before `before` (null: at the end) and renumbers the rows 0, 1, 2...
// `table` and `scope` are constants, never user input.
async function move(db: PoolClient, table: "tasks" | "task_lists", scope: "list_id" | "space_id", scopeId: string, id: string, before: unknown) {
  if (before != null && (typeof before !== "string" || !uuid.test(before))) throw new SpaceError("Invalid position.");
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE ${scope} = $1 ORDER BY position, id`, [scopeId]);
  const order = moveBefore(rows, id, before?.toLowerCase() ?? null);
  if (!order) throw new SpaceError("The order changed meanwhile. Try again.", 409);
  await db.query(`UPDATE ${table} SET position = o.n - 1 FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, n)
    WHERE ${table}.id = o.id`, [order.map((row) => row.id)]);
}

export async function taskOperation(db: PoolClient, userId: string, method: string, path: string[], body: Record<string, unknown> = {}) {
  const space = await readSpace(db, userId);
  if (!space) throw new SpaceError("Join or create a space first.", 403);
  const id = path.find((part) => uuid.test(part))?.toLowerCase() ?? "";
  // The endpoint with its id generalized, e.g. "PATCH /lists/:id".
  switch (`${method} /${path.map((part) => uuid.test(part) ? ":id" : part).join("/")}`) {
    case "GET /": return readLists(db, space.id);
    case "POST /lists": {
      const { rows } = await db.query(`INSERT INTO task_lists (id, space_id, name, position)
        SELECT $1::uuid, $2::uuid, $3::text, coalesce(max(position) + 1, 0) FROM task_lists WHERE space_id = $2
        ON CONFLICT (id) DO NOTHING RETURNING id, name`, [newId(body.id), space.id, listName(body.name)]);
      if (!rows[0]) throw new SpaceError("Could not create the list. Try again.", 409);
      return { ...rows[0], tasks: [] };
    }
    case "PATCH /lists/:id": {
      const { rows } = await db.query("UPDATE task_lists SET name = $3 WHERE id = $1 AND space_id = $2 RETURNING id, name",
        [id, space.id, listName(body.name)]);
      if (!rows[0]) throw new SpaceError("List not found.", 404);
      return rows[0];
    }
    case "DELETE /lists/:id": {
      const { rowCount } = await db.query("DELETE FROM task_lists WHERE id = $1 AND space_id = $2", [id, space.id]);
      if (!rowCount) throw new SpaceError("List not found.", 404);
      return null;
    }
    case "POST /lists/:id/move":
      await findList(db, space.id, id);
      await move(db, "task_lists", "space_id", space.id, id, body.beforeId);
      return null;
    case "POST /lists/:id/tasks": {
      await findList(db, space.id, id);
      const task = taskFields(space, body);
      const { rows } = await db.query<Task>(`INSERT INTO tasks (id, list_id, title, notes, due_date, assignee_id, is_complete, position)
        SELECT $1::uuid, $2::uuid, $3::text, nullif($4::text, ''), $5::date, $6::uuid, $7::boolean, coalesce(max(position) + 1, 0)
        FROM tasks WHERE list_id = $2 ON CONFLICT (id) DO NOTHING RETURNING ${columns}`,
      [newId(body.id), id, task.title, task.notes, task.dueDate, task.assigneeId, task.isComplete]);
      if (!rows[0]) throw new SpaceError("Could not create the task. Try again.", 409);
      return rows[0];
    }
    case "PATCH /:id": {
      const current = await findTask(db, space.id, id);
      const task = taskFields(space, body, current);
      // A task ticked off again goes to the end of the list, just above Done.
      const { rows } = await db.query<Task>(`UPDATE tasks SET title = $2, notes = nullif($3, ''), due_date = $4, assignee_id = $5, is_complete = $6,
        position = CASE WHEN $7 THEN (SELECT coalesce(max(position) + 1, 0) FROM tasks WHERE list_id = $8) ELSE position END
        WHERE id = $1 RETURNING ${columns}`,
      [id, task.title, task.notes, task.dueDate, task.assigneeId, task.isComplete, current.isComplete && !task.isComplete, current.listId]);
      return rows[0];
    }
    case "DELETE /:id": {
      const { rowCount } = await db.query("DELETE FROM tasks WHERE id = $1 AND list_id IN (SELECT id FROM task_lists WHERE space_id = $2)", [id, space.id]);
      if (!rowCount) throw new SpaceError("Task not found.", 404);
      return null;
    }
    case "POST /:id/move": {
      const task = await findTask(db, space.id, id);
      await move(db, "tasks", "list_id", task.listId, id, body.beforeId);
      return null;
    }
  }
  throw new SpaceError("Endpoint not found.", 404);
}
