import {
  acceptFriendRequest, cancelFriendRequest, declineFriendRequest, readFriend, readFriends, removeFriend, searchPeople,
  sendFriendRequest,
} from "@/lib/friends";
import { ShowsError, showsResponse } from "@/lib/shows";

type Context = { params: Promise<{ path?: string[] }> };

const actions = { accept: acceptFriendRequest, decline: declineFriendRequest, cancel: cancelFriendRequest };

// GET /api/shows/friends: your friends, the requests you received and the ones you sent.
// GET /api/shows/friends/search?q=: usernames that start with q, for Add a friend.
// GET /api/shows/friends/{user id}: a friend's profile (404 unless you are friends).
export function GET(request: Request, context: Context) {
  return showsResponse(request, async (userId) => {
    const { path = [] } = await context.params;
    if (path.length === 0) return readFriends(userId);
    if (path.length === 1 && path[0] === "search") return searchPeople(userId, new URL(request.url).searchParams.get("q"));
    if (path.length === 1) return readFriend(userId, path[0]);
    throw new ShowsError("Endpoint not found.", 404);
  });
}

// POST /api/shows/friends {username}: sends a friend request, or accepts theirs
// if they had sent you one (201).
// POST /api/shows/friends/{user id}/{accept|decline|cancel}: accepts or declines
// their request, or withdraws yours.
// Both answer with your friends and requests, as GET does.
export async function POST(request: Request, context: Context) {
  const { path = [] } = await context.params;
  return showsResponse(request, async (userId, body) => {
    if (path.length === 0) return sendFriendRequest(userId, body);
    const action = path.length === 2 && Object.hasOwn(actions, path[1]) ? actions[path[1] as keyof typeof actions] : null;
    if (!action) throw new ShowsError("Endpoint not found.", 404);
    return action(userId, path[0]);
  }, path.length === 0 ? 201 : 200);
}

// DELETE /api/shows/friends/{user id}: removes a friend, for both of you.
export function DELETE(request: Request, context: Context) {
  return showsResponse(request, async (userId) => {
    const { path = [] } = await context.params;
    if (path.length !== 1) throw new ShowsError("Endpoint not found.", 404);
    return removeFriend(userId, path[0]);
  });
}
