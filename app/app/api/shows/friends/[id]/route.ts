import { readFriend, removeFriend } from "@/lib/friends";
import { showsRoute } from "@/lib/shows";

// GET /api/shows/friends/{user id}: a friend's profile (404 unless you are friends).
export const GET = showsRoute({}, ({ user, params }) => readFriend(user.id, params.id));

// DELETE /api/shows/friends/{user id}: removes a friend, for both of you.
export const DELETE = showsRoute({}, ({ user, params }) => removeFriend(user.id, params.id));
