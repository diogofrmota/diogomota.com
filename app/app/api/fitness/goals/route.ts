import { updateGoals } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";
import { goalsPatch } from "@/lib/schemas";

// PATCH /api/fitness/goals {waterMl?, steps?}: changes your daily goals; answers with them.
export const PATCH = apiRoute(
  { label: "Changing the daily goals", body: goalsPatch, limit: fitnessRequestLimit },
  ({ user, body }) => updateGoals(user.id, body),
);
