import { updateDay } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";
import { dayPatch } from "@/lib/schemas";

// PATCH /api/fitness/days/:date {steps?, waterMl?, weightKg?, taken?}: changes a
// day of your log (YYYY-MM-DD, a Lisbon date); null clears the steps or the
// weight. Answers with the day.
export const PATCH = apiRoute(
  { label: "Changing a day of the log", body: dayPatch, limit: fitnessRequestLimit },
  ({ user, params, body }) => updateDay(user.id, params.date, body),
);
