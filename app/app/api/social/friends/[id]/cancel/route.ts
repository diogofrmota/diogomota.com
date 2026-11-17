import { cancelFriendRequest } from "@/lib/friends";
import { socialRoute } from "@/lib/social";

// POST /api/social/friends/{user id}/cancel {}: withdraws the request you sent, and answers
// with your friends and requests.
export const POST = socialRoute({}, ({ user, params }) => cancelFriendRequest(user.id, params.id));
