import { apiRoute } from "@/lib/http";
import { listInput } from "@/lib/schemas";
import { inSpace } from "@/lib/spaces";
import { createList } from "@/lib/tasks";

// POST /api/shared/tasks/lists {id?, name}: adds a list at the end.
export const POST = apiRoute({ label: "Adding a list", body: listInput, status: 201 }, ({ user, body }) =>
  inSpace(user.id, (db, space) => createList(db, space, user.id, body)),
);
