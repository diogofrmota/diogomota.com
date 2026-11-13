import { apiRoute } from "@/lib/http";
import { taskCreate } from "@/lib/schemas";
import { inSpace } from "@/lib/spaces";
import { addTask } from "@/lib/tasks";

// POST /api/shared/tasks/lists/{id}/tasks {id?, title, notes?, dueDate?, assigneeId?, isComplete?, repeat?}:
// adds a task at the end of a list.
export const POST = apiRoute({ label: "Adding a task", body: taskCreate, status: 201 }, ({ user, params, body }) =>
  inSpace(user.id, (db, space) => addTask(db, space, user.id, params.id, body)),
);
