import { removeFriend } from "@/lib/friends";
import { socialRoute } from "@/lib/social";

// DELETE /api/social/friends/{user id}: removes a friend, for both of you.
export const DELETE = socialRoute({}, ({ user, params }) => removeFriend(user.id, params.id));
