import { deleteRoutine, updateRoutine } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";
import { routinePatch } from "@/lib/schemas";

// PATCH and DELETE /api/fitness/routines/:id: one of your routines (another's is a 404).

// Any of {name, exercises, notes}; answers with the routine.
export const PATCH = apiRoute(
  { label: "Changing a routine", body: routinePatch, limit: fitnessRequestLimit },
  ({ user, params, body }) => updateRoutine(user.id, params.id, body),
);

// The workouts started from it stay.
export const DELETE = apiRoute({ label: "Deleting a routine", limit: fitnessRequestLimit }, ({ user, params }) =>
  deleteRoutine(user.id, params.id),
);
