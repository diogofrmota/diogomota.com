import { acceptFriendRequest } from "@/lib/friends";
import { showsRoute } from "@/lib/shows";

// POST /api/shows/friends/{user id}/accept {}: accepts their friend request, and answers
// with your friends and requests.
export const POST = showsRoute({}, ({ user, params }) => acceptFriendRequest(user.id, params.id));
