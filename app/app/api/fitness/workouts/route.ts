import { createWorkout } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";
import { workoutCreate } from "@/lib/schemas";

// POST /api/fitness/workouts {id?, date, name, routineId?, exercises?, notes?}: adds a workout.
export const POST = apiRoute(
  { label: "Adding a workout", body: workoutCreate, status: 201, limit: fitnessRequestLimit },
  ({ user, body }) => createWorkout(user.id, body),
);
