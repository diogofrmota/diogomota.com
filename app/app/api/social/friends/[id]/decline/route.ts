import { declineFriendRequest } from "@/lib/friends";
import { socialRoute } from "@/lib/social";

// POST /api/social/friends/{user id}/decline {}: declines their friend request, and answers
// with your friends and requests.
export const POST = socialRoute({}, ({ user, params }) => declineFriendRequest(user.id, params.id));
