import { apiRoute } from "@/lib/http";
import { inSpace } from "@/lib/spaces";
import { readLists } from "@/lib/tasks";

// GET /api/shared/tasks: every list of your space with its tasks, both in order.
export const GET = apiRoute({ label: "Reading the tasks" }, ({ user }) =>
  inSpace(user.id, (db, space) => readLists(db, space)),
);
