import { apiRoute } from "@/lib/http";
import { taskPatch } from "@/lib/schemas";
import { inSpace } from "@/lib/spaces";
import { deleteTask, updateTask } from "@/lib/tasks";

// PATCH /api/shared/tasks/{id}: changes any of a task's fields. Ticking off a
// repeating task moves its due date on instead.
export const PATCH = apiRoute({ label: "Changing a task", body: taskPatch }, ({ user, params, body }) =>
  inSpace(user.id, (db, space) => updateTask(db, space, user.id, params.id, body)),
);

// DELETE /api/shared/tasks/{id}: deletes a task.
export const DELETE = apiRoute({ label: "Deleting a task" }, ({ user, params }) =>
  inSpace(user.id, (db, space) => deleteTask(db, space, user.id, params.id)),
);
