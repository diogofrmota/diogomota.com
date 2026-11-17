import { readFriends, sendFriendRequest } from "@/lib/friends";
import { friendRequest } from "@/lib/schemas";
import { socialRoute } from "@/lib/social";

// GET /api/social/friends: your friends, the requests you received and the ones you sent.
export const GET = socialRoute({}, ({ user }) => readFriends(user.id));

// POST /api/social/friends {username}: sends a friend request, or accepts theirs if
// they had sent you one (201). Answers with your friends and requests, as GET does.
export const POST = socialRoute({ body: friendRequest, status: 201 }, ({ user, body }) =>
  sendFriendRequest(user.id, body),
);
