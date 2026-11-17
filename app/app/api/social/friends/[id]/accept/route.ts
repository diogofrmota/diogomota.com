import { acceptFriendRequest } from "@/lib/friends";
import { socialRoute } from "@/lib/social";

// POST /api/social/friends/{user id}/accept {}: accepts their friend request, and answers
// with your friends and requests.
export const POST = socialRoute({}, ({ user, params }) => acceptFriendRequest(user.id, params.id));
