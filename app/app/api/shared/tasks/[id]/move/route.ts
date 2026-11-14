import { apiRoute } from "@/lib/http";
import { moveInput } from "@/lib/schemas";
import { inSpace } from "@/lib/spaces";
import { moveTask } from "@/lib/tasks";

// POST /api/shared/tasks/{id}/move {beforeId, listId?}: moves a task before another of its list (null: to
// the end), or with listId to the end of that list.
export const POST = apiRoute({ label: "Moving a task", body: moveInput }, ({ user, params, body }) =>
  inSpace(user.id, (db, space) => moveTask(db, space, params.id, body.beforeId, body.listId)),
);
