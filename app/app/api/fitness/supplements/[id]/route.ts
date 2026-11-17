import { deleteSupplement } from "@/lib/fitness";
import { apiRoute } from "@/lib/http";
import { fitnessRequestLimit } from "@/lib/rate-limit";

// DELETE /api/fitness/supplements/:id: one of your supplements (another's is a 404).
export const DELETE = apiRoute({ label: "Deleting a supplement", limit: fitnessRequestLimit }, ({ user, params }) =>
  deleteSupplement(user.id, params.id),
);
