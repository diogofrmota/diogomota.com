import { deleteRun, updateRun } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";
import { runPatch } from "@/lib/schemas";

// PATCH and DELETE /api/fitness/runs/:id: one of your runs (another's is a 404).

// Any of {date, distanceM, durationS, notes}; answers with the run.
export const PATCH = apiRoute(
  { label: "Changing a run", body: runPatch, limit: fitnessRequestLimit },
  ({ user, params, body }) => updateRun(user.id, params.id, body),
);

export const DELETE = apiRoute({ label: "Deleting a run", limit: fitnessRequestLimit }, ({ user, params }) =>
  deleteRun(user.id, params.id),
);
