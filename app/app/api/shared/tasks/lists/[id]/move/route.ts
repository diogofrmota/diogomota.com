import { apiRoute } from "@/lib/http";
import { moveInput } from "@/lib/schemas";
import { inSpace } from "@/lib/spaces";
import { moveList } from "@/lib/tasks";

// POST /api/shared/tasks/lists/{id}/move {beforeId}: moves a list before another (null: to the end).
export const POST = apiRoute({ label: "Moving a list", body: moveInput }, ({ user, params, body }) =>
  inSpace(user.id, (db, space) => moveList(db, space, params.id, body.beforeId)),
);
