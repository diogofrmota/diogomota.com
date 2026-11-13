import { readFriends, sendFriendRequest } from "@/lib/friends";
import { friendRequest } from "@/lib/schemas";
import { showsRoute } from "@/lib/shows";

// GET /api/shows/friends: your friends, the requests you received and the ones you sent.
export const GET = showsRoute({}, ({ user }) => readFriends(user.id));

// POST /api/shows/friends {username}: sends a friend request, or accepts theirs if
// they had sent you one (201). Answers with your friends and requests, as GET does.
export const POST = showsRoute({ body: friendRequest, status: 201 }, ({ user, body }) =>
  sendFriendRequest(user.id, body),
);
