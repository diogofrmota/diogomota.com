import { cancelFriendRequest } from "@/lib/friends";
import { showsRoute } from "@/lib/shows";

// POST /api/shows/friends/{user id}/cancel {}: withdraws the request you sent, and answers
// with your friends and requests.
export const POST = showsRoute({}, ({ user, params }) => cancelFriendRequest(user.id, params.id));
