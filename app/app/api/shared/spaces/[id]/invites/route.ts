import { apiRoute } from "@/lib/http";
import { createInvite } from "@/lib/spaces";

// POST /api/shared/spaces/{id}/invites {}: a new single-use invite code, valid for
// 24 hours ({code, expiresAt}). Any member can make one.
export const POST = apiRoute({ label: "Making an invite" }, ({ user, params }) => createInvite(user.id, params.id));
