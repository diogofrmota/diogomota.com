import { createSupplement } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";
import { supplementCreate } from "@/lib/schemas";

// POST /api/fitness/supplements {id?, name, dose?}: adds a supplement (up to 30).
export const POST = apiRoute(
  { label: "Adding a supplement", body: supplementCreate, status: 201, limit: fitnessRequestLimit },
  ({ user, body }) => createSupplement(user.id, body),
);
