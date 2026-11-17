import { readFitness } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";

// The Fitness app's API (lib/fitness.ts): each user's own routines, workouts,
// runs, supplements, daily log and goals.

// GET /api/fitness: all of it, {routines, workouts, runs, supplements, days, goals}.
export const GET = apiRoute({ label: "Loading fitness", limit: fitnessRequestLimit }, ({ user }) =>
  readFitness(user.id),
);
