import { deleteWorkout, updateWorkout } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";
import { workoutPatch } from "@/lib/schemas";

// PATCH and DELETE /api/fitness/workouts/:id: one of your workouts (another's is a 404).

// Any of {date, name, exercises, notes} (exercises whole, with their sets); answers with the workout.
export const PATCH = apiRoute(
  { label: "Changing a workout", body: workoutPatch, limit: fitnessRequestLimit },
  ({ user, params, body }) => updateWorkout(user.id, params.id, body),
);

export const DELETE = apiRoute({ label: "Deleting a workout", limit: fitnessRequestLimit }, ({ user, params }) =>
  deleteWorkout(user.id, params.id),
);
