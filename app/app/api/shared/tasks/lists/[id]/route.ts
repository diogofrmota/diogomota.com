import { apiRoute } from "@/lib/http";
import { listRename } from "@/lib/schemas";
import { inSpace } from "@/lib/spaces";
import { deleteList, renameList } from "@/lib/tasks";

// PATCH /api/shared/tasks/lists/{id} {name}: renames a list.
export const PATCH = apiRoute({ label: "Renaming a list", body: listRename }, ({ user, params, body }) =>
  inSpace(user.id, (db, space) => renameList(db, space, params.id, body.name)),
);

// DELETE /api/shared/tasks/lists/{id}: deletes a list with its tasks.
export const DELETE = apiRoute({ label: "Deleting a list" }, ({ user, params }) =>
  inSpace(user.id, (db, space) => deleteList(db, space, user.id, params.id)),
);
