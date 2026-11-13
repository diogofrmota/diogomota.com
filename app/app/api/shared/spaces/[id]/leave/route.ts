import { apiRoute } from "@/lib/http";
import { leaveSpace } from "@/lib/spaces";

// POST /api/shared/spaces/{id}/leave {}: leaves the space; its last member's
// leaving deletes it, with its calendar and tasks.
export const POST = apiRoute({ label: "Leaving a space" }, ({ user, params }) => leaveSpace(user.id, params.id));
