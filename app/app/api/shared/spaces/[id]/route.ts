import { apiRoute } from "@/lib/http";
import { readSpace } from "@/lib/spaces";

// GET /api/shared/spaces/{id}: your space, by its id (404 for any other).
export const GET = apiRoute({ label: "Reading a space" }, ({ user, params }) => readSpace(user.id, params.id));
