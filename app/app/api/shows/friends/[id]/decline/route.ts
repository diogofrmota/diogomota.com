import { declineFriendRequest } from "@/lib/friends";
import { showsRoute } from "@/lib/shows";

// POST /api/shows/friends/{user id}/decline {}: declines their friend request, and answers
// with your friends and requests.
export const POST = showsRoute({}, ({ user, params }) => declineFriendRequest(user.id, params.id));
