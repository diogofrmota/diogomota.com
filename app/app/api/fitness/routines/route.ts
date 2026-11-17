import { createRoutine } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";
import { routineCreate } from "@/lib/schemas";

// POST /api/fitness/routines {id?, name, exercises: [{name, sets, reps}], notes?}: adds a routine.
export const POST = apiRoute(
  { label: "Adding a routine", body: routineCreate, status: 201, limit: fitnessRequestLimit },
  ({ user, body }) => createRoutine(user.id, body),
);
