import { readFriends } from "@/lib/friends";
import { showsRoute } from "@/lib/shows";

// GET /api/shows/friends: your friends, the requests you received and the ones you
// sent, for a title's Recommend (components/shows/TitleDialog.tsx). Friendships
// themselves are made and ended through /api/social/friends.
export const GET = showsRoute({}, ({ user }) => readFriends(user.id));
