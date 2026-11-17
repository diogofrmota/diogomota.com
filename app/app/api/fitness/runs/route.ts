import { createRun } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";
import { runCreate } from "@/lib/schemas";

// POST /api/fitness/runs {id?, date, distanceM, durationS, notes?}: adds a run.
export const POST = apiRoute(
  { label: "Adding a run", body: runCreate, status: 201, limit: fitnessRequestLimit },
  ({ user, body }) => createRun(user.id, body),
);
